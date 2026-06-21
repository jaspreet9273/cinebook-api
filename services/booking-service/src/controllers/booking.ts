import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { bookingService } from "../services/booking";
import { Booking } from "../models/booking";
import { AppError } from "../middleware/error-handler";

// ─── Validation ───────────────────────────────────────────────────────────────
export const createBookingValidation = [
  body("showId").notEmpty().withMessage("showId required").isString(),
  body("seatIds")
    .isArray({ min: 1, max: 10 })
    .withMessage("1-10 seats required"),
  body("seatIds.*")
    .isString()
    .notEmpty()
    .withMessage("Each seatId must be a non-empty string"),
  body("idempotencyKey")
    .isUUID(4)
    .withMessage("idempotencyKey must be a UUID v4"),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatErrors(req: Request) {
  return validationResult(req)
    .array()
    .map((e) => ({
      field: e.type === "field" ? (e as any).path : e.type,
      message: e.msg,
    }));
}

function getUserId(req: Request): string {
  const userId = (req.headers["x-user-id"] as string)?.trim();
  if (!userId) throw new AppError(401, "Unauthorized", "MISSING_USER_CONTEXT");
  return userId;
}

function getUserEmail(req: Request): string {
  // Gateway forwards X-User-Email after JWT verification
  const email = (req.headers["x-user-email"] as string)?.trim();
  return email ?? ""; // graceful fallback — notification is non-fatal
}

// ─── Controller ───────────────────────────────────────────────────────────────
export class BookingController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      const userId = getUserId(req);
      const userEmail = getUserEmail(req);
      const { showId, seatIds, idempotencyKey } = req.body;

      const { booking, isNew } = await bookingService.createBooking({
        userId,
        userEmail,
        showId,
        seatIds,
        idempotencyKey,
        correlationId: req.correlationId,
        ipAddress: req.ip,
      });

      res.status(isNew ? 201 : 200).json({
        bookingId: booking.bookingId,
        status: booking.status,
        totalAmount: booking.totalAmount,
        convenienceFee: booking.convenienceFee,
        currency: booking.currency,
        expiresAt: booking.expiresAt,
        seats: booking.seats,
        isIdempotentReplay: !isNew,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;

      const booking = await Booking.findOne({ bookingId, userId });
      if (!booking) {
        res
          .status(404)
          .json({ error: "Booking not found", code: "BOOKING_NOT_FOUND" });
        return;
      }

      res.json(booking);
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;
      const reason =
        typeof req.body.reason === "string"
          ? req.body.reason.trim()
          : "user_requested";

      const booking = await bookingService.cancelBooking(
        bookingId,
        userId,
        reason,
        req.correlationId,
      );

      res.json({ bookingId: booking.bookingId, status: booking.status });
    } catch (err) {
      next(err);
    }
  }

  async listUserBookings(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getUserId(req);
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit as string) || 10),
      );

      const [bookings, total] = await Promise.all([
        Booking.find({ userId })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Booking.countDocuments({ userId }),
      ]);

      res.json({
        data: bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const bookingController = new BookingController();
