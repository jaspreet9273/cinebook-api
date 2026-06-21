// import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { Booking } from "../models/booking";
import { Show } from "../models/show";
import { kafkaProducer } from "../events/kafka-producer";
import { logger } from "../config/logger";

const TOPICS = {
  BOOKING_EXPIRED: "booking.expired",
} as const;

const BATCH_SIZE = 100;
const WORKER_INTERVAL = 60_000; // 60 seconds

let workerTimer: NodeJS.Timeout | null = null;
let isRunning = false; // prevent overlapping runs

/**
 * Booking Expiry Worker
 *
 * Finds pending bookings past their hold window and:
 *  1. Marks them as 'expired'
 *  2. Releases their seats back to 'available'
 *  3. Publishes booking.expired Kafka event
 *
 * Runs every 60 seconds. Protected against overlapping runs.
 * Note: No TTL index on Booking — this worker is the only expiry mechanism.
 *
 * NOTE: MongoDB transactions are commented out for single-node dev compatibility.
 * To re-enable in production: add replica set, uncomment session blocks.
 * Without transactions, booking expiry and seat release are sequential —
 * the `status: "pending"` filter on findOneAndUpdate prevents double-processing.
 */
export async function runExpiryWorker(): Promise<void> {
  if (isRunning) {
    logger.debug("Expiry worker already running — skipping this tick");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const now = new Date();

    const expiredBookings = await Booking.find({
      status: "pending",
      expiresAt: { $lt: now },
    })
      .limit(BATCH_SIZE)
      .lean();

    if (expiredBookings.length === 0) return;

    logger.info("Expiry worker: processing expired bookings", {
      count: expiredBookings.length,
    });

    let succeeded = 0;
    let failed = 0;

    for (const booking of expiredBookings) {
      try {
        // ── Production version (with transactions) ──────────────────────────
        // const session = await mongoose.startSession()
        // try {
        //   await session.withTransaction(async () => {
        //     const updated = await Booking.findOneAndUpdate(
        //       { bookingId: booking.bookingId, status: 'pending' },
        //       { status: 'expired' },
        //       { session, new: true },
        //     )
        //     if (!updated) return // already processed by another worker
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
        // ── End production version ──────────────────────────────────────────

        // Only update if still pending — prevents double-processing
        // by concurrent worker instances
        const updated = await Booking.findOneAndUpdate(
          { bookingId: booking.bookingId, status: "pending" },
          { status: "expired" },
          { new: true },
        );

        // Already processed by another worker instance — skip
        if (!updated) continue;

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

        // Publish event after successful update
        await kafkaProducer.publish(TOPICS.BOOKING_EXPIRED, {
          eventId: uuidv4(),
          correlationId: booking.correlationId,
          timestamp: new Date().toISOString(),
          type: "booking.expired",
          payload: {
            bookingId: booking.bookingId,
            userId: booking.userId,
            reason: "expired",
            seatIds: booking.seats.map((s) => s.seatId),
            showId: booking.showId,
          },
        });

        succeeded++;
        logger.info("Booking expired", {
          bookingId: booking.bookingId,
          userId: booking.userId,
        });
      } catch (err) {
        failed++;
        logger.error("Failed to expire booking", {
          bookingId: booking.bookingId,
          error: (err as Error).message,
        });
      }
    }

    logger.info("Expiry worker completed", {
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.error("Expiry worker failed", { error: (err as Error).message });
  } finally {
    isRunning = false;
  }
}

/** Start the expiry worker on an interval */
export function startExpiryWorker(): void {
  logger.info("Starting expiry worker", { intervalMs: WORKER_INTERVAL });
  runExpiryWorker();
  workerTimer = setInterval(runExpiryWorker, WORKER_INTERVAL);
  workerTimer.unref();
}

/** Stop the expiry worker — call during graceful shutdown */
export function stopExpiryWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info("Expiry worker stopped");
  }
}
