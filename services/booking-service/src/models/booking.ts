import mongoose, { Document, Schema, Model } from "mongoose";

// ─── Types ────────────────────────────────────────────────────────────────────
export type BookingStatus =
  | "pending" // Seats held, awaiting payment
  | "payment_processing" // Payment initiated
  | "confirmed" // Payment successful
  | "cancelled" // Cancelled by user or admin
  | "expired" // Hold window passed without payment
  | "refunded"; // Refund processed

export interface ISeat {
  seatId: string;
  row: string;
  number: number;
  type: "standard" | "premium" | "recliner" | "couple";
  price: number;
}

export interface IBooking extends Document {
  bookingId: string;
  userId: string;
  showId: string;
  movieId: string;
  theatreId: string;
  seats: ISeat[];
  status: BookingStatus;
  totalAmount: number;
  convenienceFee: number;
  currency: string;
  paymentId?: string;
  confirmationCode?: string;
  expiresAt: Date;
  cancelReason?: string;
  idempotencyKey: string;
  correlationId: string;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceType?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────
const SeatSchema = new Schema<ISeat>(
  {
    seatId: { type: String, required: true },
    row: { type: String, required: true },
    number: { type: Number, required: true },
    type: {
      type: String,
      enum: ["standard", "premium", "recliner", "couple"],
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// ─── Schema ───────────────────────────────────────────────────────────────────
const BookingSchema = new Schema<IBooking>(
  {
    bookingId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    showId: { type: String, required: true, index: true },
    movieId: { type: String, required: true },
    theatreId: { type: String, required: true },
    seats: {
      type: [SeatSchema],
      required: true,
      validate: [(v: ISeat[]) => v.length > 0, "At least one seat required"],
    },
    status: {
      type: String,
      enum: [
        "pending",
        "payment_processing",
        "confirmed",
        "cancelled",
        "expired",
        "refunded",
      ],
      default: "pending",
      index: true,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    convenienceFee: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: "INR", uppercase: true },

    // sparse+unique: only enforces uniqueness on non-null values
    paymentId: { type: String, unique: true, sparse: true },
    confirmationCode: { type: String, unique: true, sparse: true },

    // No TTL index — expired bookings are kept for audit
    // Expiry worker marks them as 'expired' and releases seats
    expiresAt: { type: Date, required: true, index: true },

    cancelReason: { type: String },
    idempotencyKey: { type: String, required: true, unique: true },
    correlationId: { type: String, required: true },
    metadata: {
      ipAddress: String,
      userAgent: String,
      deviceType: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  },
);

// ─── Compound indexes ─────────────────────────────────────────────────────────
BookingSchema.index({ userId: 1, createdAt: -1 }); // user booking history
BookingSchema.index({ showId: 1, status: 1 }); // seat availability checks
BookingSchema.index({ status: 1, expiresAt: 1 }); // expiry worker queries

// ─── Model ────────────────────────────────────────────────────────────────────
export const Booking: Model<IBooking> = mongoose.model<IBooking>(
  "Booking",
  BookingSchema,
);
