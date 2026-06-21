import { v4 as uuidv4 } from "uuid";
import { addMinutes } from "date-fns";
import { RedisClientType } from "redis";
import { Booking, IBooking, BookingStatus } from "../models/booking";
import { Show } from "../models/show";
import { kafkaProducer } from "../events/kafka-producer";
import { rabbitPublisher } from "../events/rabbit-publisher";
import { logger } from "../config/logger";
import { env } from "../config/env";
import { AppError } from "../middleware/error-handler";

const TOPICS = {
  BOOKING_CREATED: "booking.created",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_EXPIRED: "booking.expired",
} as const;

const MAX_SEATS_PER_BOOKING = 10;
const CONVENIENCE_FEE_PERCENT = 0.02; // 2%

interface CreateBookingInput {
  userId: string;
  userEmail: string; // needed for notification
  showId: string;
  seatIds: string[];
  idempotencyKey: string;
  correlationId: string;
  ipAddress?: string;
}

class BookingService {
  private redis!: RedisClientType;

  async init(redis: RedisClientType): Promise<void> {
    this.redis = redis;
  }

  async createBooking(
    input: CreateBookingInput,
  ): Promise<{ booking: IBooking; isNew: boolean }> {
    // ── 0. Input validation ───────────────────────────────────────────────────
    if (input.seatIds.length > MAX_SEATS_PER_BOOKING) {
      throw new AppError(
        400,
        `Maximum ${MAX_SEATS_PER_BOOKING} seats per booking`,
        "TOO_MANY_SEATS",
      );
    }

    // ── 1. Idempotency check ──────────────────────────────────────────────────
    const existing = await Booking.findOne({
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      logger.info("Idempotent replay", {
        bookingId: existing.bookingId,
        correlationId: input.correlationId,
      });
      return { booking: existing, isNew: false };
    }

    // ── 2. Distributed seat lock ──────────────────────────────────────────────
    const lockKey = `seat-lock:${input.showId}:${[...input.seatIds].sort().join(",")}`;
    const lockToken = uuidv4();
    // Lock TTL = hold window + buffer
    const lockTtl = env.SEAT_HOLD_MINUTES * 60 + 30;
    const acquired = await this.acquireLock(lockKey, lockToken, lockTtl);

    if (!acquired) {
      throw new AppError(
        409,
        "Seats are being reserved by someone else. Try again in a moment.",
        "SEAT_LOCK_CONFLICT",
      );
    }

    try {
      // ── 3. Validate show & seats ────────────────────────────────────────────
      const show = await Show.findOne({ showId: input.showId, isActive: true });
      if (!show) throw new AppError(404, "Show not found", "SHOW_NOT_FOUND");

      const now = new Date();
      if (show.showTime <= now) {
        throw new AppError(400, "Show has already started", "SHOW_STARTED");
      }

      const seatIdSet = new Set(input.seatIds);
      const selectedSeats = show.seats.filter((s) => seatIdSet.has(s.seatId));

      if (selectedSeats.length !== input.seatIds.length) {
        throw new AppError(
          400,
          "One or more seats not found",
          "SEATS_NOT_FOUND",
        );
      }

      const unavailable = selectedSeats.filter(
        (s) =>
          s.status === "booked" ||
          s.status === "maintenance" ||
          (s.status === "reserved" && s.reservedUntil && s.reservedUntil > now),
      );

      if (unavailable.length > 0) {
        throw new AppError(
          409,
          `Seats ${unavailable.map((s) => `${s.row}${s.number}`).join(", ")} are unavailable`,
          "SEATS_UNAVAILABLE",
        );
      }

      // ── 4. Calculate amounts ────────────────────────────────────────────────
      const subtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);
      const convenienceFee = Math.round(subtotal * CONVENIENCE_FEE_PERCENT);
      const total = subtotal + convenienceFee;
      const expiresAt = addMinutes(now, env.SEAT_HOLD_MINUTES);
      const bookingId = `BKG-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

      // ── 5. Reserve seats + create booking ─────────────────────────────────────
      // OCC: filter by seatVersion to detect concurrent updates
      // Redis lock (step 2) + OCC (below) provide two layers of race protection.
      //
      // NOTE: MongoDB transactions are commented out — single-node MongoDB does not
      // support multi-document transactions. To re-enable in production:
      //   1. Run MongoDB as a replica set (--replSet rs0)
      //   2. Add ?replicaSet=rs0 to MONGODB_URI
      //   3. Uncomment the session.withTransaction block below
      //   4. Remove the standalone Show.findOneAndUpdate and Booking.save() calls
      //
      // ── Production version (with transactions) ────────────────────────────────
      // const session = await mongoose.startSession()
      // let savedBooking: IBooking | null = null
      // try {
      //   await session.withTransaction(async () => {
      //     const updated = await Show.findOneAndUpdate(
      //       {
      //         showId: input.showId,
      //         seatVersion: show.seatVersion,
      //         seats: {
      //           $not: {
      //             $elemMatch: {
      //               seatId: { $in: input.seatIds },
      //               $or: [
      //                 { status: 'booked' },
      //                 { status: 'maintenance' },
      //                 { status: 'reserved', reservedUntil: { $gt: now } },
      //               ],
      //             },
      //           },
      //         },
      //       },
      //       {
      //         $set: {
      //           'seats.$[seat].status':        'reserved',
      //           'seats.$[seat].reservedBy':    bookingId,
      //           'seats.$[seat].reservedUntil': expiresAt,
      //         },
      //         $inc: { availableSeats: -input.seatIds.length, seatVersion: 1 },
      //       },
      //       { arrayFilters: [{ 'seat.seatId': { $in: input.seatIds } }], new: true, session },
      //     )
      //     if (!updated) throw new AppError(409, 'Seats just got taken.', 'CONCURRENT_UPDATE')
      //     savedBooking = await new Booking({ ...bookingFields }).save({ session })
      //   })
      // } finally {
      //   session.endSession()
      // }
      // if (!savedBooking) throw new AppError(500, 'Booking creation failed', 'BOOKING_SAVE_FAILED')
      // ── End production version ────────────────────────────────────────────────

      const updated = await Show.findOneAndUpdate(
        {
          showId: input.showId,
          seatVersion: show.seatVersion, // OCC check — rejects if concurrent update happened
          seats: {
            $not: {
              $elemMatch: {
                seatId: { $in: input.seatIds },
                $or: [
                  { status: "booked" },
                  { status: "maintenance" },
                  { status: "reserved", reservedUntil: { $gt: now } },
                ],
              },
            },
          },
        },
        {
          $set: {
            "seats.$[seat].status": "reserved",
            "seats.$[seat].reservedBy": bookingId,
            "seats.$[seat].reservedUntil": expiresAt,
          },
          $inc: {
            availableSeats: -input.seatIds.length,
            seatVersion: 1,
          },
        },
        {
          arrayFilters: [{ "seat.seatId": { $in: input.seatIds } }],
          new: true,
        },
      );

      if (!updated) {
        throw new AppError(
          409,
          "Seats just got taken. Refresh and try again.",
          "CONCURRENT_UPDATE",
        );
      }

      const savedBooking = await new Booking({
        bookingId,
        userId: input.userId,
        showId: input.showId,
        movieId: show.movieId,
        theatreId: show.theatreId,
        seats: selectedSeats.map((s) => ({
          seatId: s.seatId,
          row: s.row,
          number: s.number,
          type: s.type,
          price: s.price,
        })),
        status: "pending",
        totalAmount: total,
        convenienceFee,
        currency: "INR",
        expiresAt,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        metadata: { ipAddress: input.ipAddress },
      }).save();

      // ── 6. Publish events (fire-and-forget after commit) ───────────────────
      kafkaProducer
        .publish(TOPICS.BOOKING_CREATED, {
          eventId: uuidv4(),
          correlationId: input.correlationId,
          timestamp: new Date().toISOString(),
          type: "booking.created",
          payload: {
            bookingId,
            userId: input.userId,
            showId: input.showId,
            movieId: show.movieId,
            theatreId: show.theatreId,
            seatIds: input.seatIds,
            totalAmount: total,
            currency: "INR",
            expiresAt: expiresAt.toISOString(),
          },
        })
        .catch((err) =>
          logger.error("Kafka publish failed", {
            error: err.message,
            bookingId,
          }),
        );

      rabbitPublisher
        .publishNotification({
          type: "email",
          to: input.userEmail,
          templateId: "booking_pending",
          variables: { bookingId, totalAmount: total },
          correlationId: input.correlationId,
        })
        .catch((err) =>
          logger.error("RabbitMQ publish failed", {
            error: err.message,
            bookingId,
          }),
        );

      logger.info("Booking created", {
        bookingId,
        userId: input.userId,
        showId: input.showId,
        totalAmount: total,
        seatCount: input.seatIds.length,
        correlationId: input.correlationId,
      });

      return { booking: savedBooking, isNew: true };
    } finally {
      await this.releaseLock(lockKey, lockToken);
    }
  }

  async cancelBooking(
    bookingId: string,
    userId: string,
    reason: string,
    correlationId: string,
  ): Promise<IBooking> {
    const booking = await Booking.findOne({ bookingId });
    if (!booking)
      throw new AppError(404, "Booking not found", "BOOKING_NOT_FOUND");
    if (booking.userId !== userId)
      throw new AppError(403, "Not your booking", "FORBIDDEN");

    const cancellable: BookingStatus[] = ["pending", "payment_processing"];
    if (!cancellable.includes(booking.status)) {
      throw new AppError(
        400,
        `Cannot cancel a ${booking.status} booking`,
        "INVALID_STATUS",
      );
    }

    // ── Cancel booking + release seats ────────────────────────────────────────
    // NOTE: Production version uses a transaction to ensure booking status update
    // and seat release are atomic. Commented out for single-node dev compatibility.
    // To re-enable: add replica set, uncomment session block, remove sequential ops.
    //
    // ── Production version (with transactions) ────────────────────────────────
    // const session = await mongoose.startSession()
    // let updatedBooking: IBooking | null = null
    // try {
    //   await session.withTransaction(async () => {
    //     updatedBooking = await Booking.findOneAndUpdate(
    //       { bookingId },
    //       { status: 'cancelled', cancelReason: reason },
    //       { session, new: true },
    //     )
    //     await Show.updateOne(
    //       { showId: booking.showId },
    //       {
    //         $set: {
    //           'seats.$[seat].status':        'available',
    //           'seats.$[seat].reservedBy':    null,
    //           'seats.$[seat].reservedUntil': null,
    //         },
    //         $inc: { availableSeats: booking.seats.length, seatVersion: 1 },
    //       },
    //       {
    //         arrayFilters: [{ 'seat.seatId': { $in: booking.seats.map((s) => s.seatId) } }],
    //         session,
    //       },
    //     )
    //   })
    // } finally {
    //   session.endSession()
    // }
    // if (!updatedBooking) throw new AppError(500, 'Cancel failed', 'CANCEL_FAILED')
    // ── End production version ────────────────────────────────────────────────

    const updatedBooking = await Booking.findOneAndUpdate(
      { bookingId },
      { status: "cancelled", cancelReason: reason },
      { new: true },
    );

    if (!updatedBooking) {
      throw new AppError(500, "Cancel failed", "CANCEL_FAILED");
    }

    await Show.updateOne(
      { showId: booking.showId },
      {
        $set: {
          "seats.$[seat].status": "available",
          "seats.$[seat].reservedBy": null,
          "seats.$[seat].reservedUntil": null,
        },
        $inc: {
          availableSeats: booking.seats.length,
          seatVersion: 1,
        },
      },
      {
        arrayFilters: [
          { "seat.seatId": { $in: booking.seats.map((s) => s.seatId) } },
        ],
      },
    );

    kafkaProducer
      .publish(TOPICS.BOOKING_CANCELLED, {
        eventId: uuidv4(),
        correlationId,
        timestamp: new Date().toISOString(),
        type: "booking.cancelled",
        payload: { bookingId, userId, reason: "user_cancelled" },
      })
      .catch((err) =>
        logger.error("Kafka publish failed", { error: err.message }),
      );

    logger.info("Booking cancelled", { bookingId, userId, correlationId });
    return updatedBooking;
  }

  // ── Redis distributed lock (Redlock-lite) ──────────────────────────────────

  private async acquireLock(
    key: string,
    token: string,
    ttlSecs: number,
  ): Promise<boolean> {
    const result = await this.redis.set(key, token, { NX: true, EX: ttlSecs });
    return result === "OK";
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    // Lua script: atomic check-and-delete — never release another process's lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, { keys: [key], arguments: [token] });
  }
}

export const bookingService = new BookingService();
