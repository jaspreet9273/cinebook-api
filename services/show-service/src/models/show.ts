import mongoose, { Document, Schema, Model } from "mongoose";

export type SeatStatus = "available" | "reserved" | "booked" | "maintenance";

export interface IShowSeat {
  seatId: string;
  row: string;
  number: number;
  type: "standard" | "premium" | "recliner" | "couple";
  price: number;
  status: SeatStatus;
  reservedBy?: string;
  reservedUntil?: Date;
  bookedBy?: string;
}

export interface IShow extends Document {
  showId: string;
  movieId: string;
  theatreId: string;
  screenId: string;
  showTime: Date;
  language: string;
  format: "2D" | "3D" | "IMAX" | "4DX";
  totalSeats: number;
  availableSeats: number;
  seats: IShowSeat[];
  pricing: {
    standard: number;
    premium: number;
    recliner: number;
    couple: number;
  };
  isActive: boolean;
  seatVersion: number; // OCC — incremented on every seat state change
  createdAt: Date;
  updatedAt: Date;
}

const transform = (_doc: any, ret: Record<string, any>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const ShowSeatSchema = new Schema<IShowSeat>(
  {
    seatId: { type: String, required: true },
    row: { type: String, required: true },
    number: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ["standard", "premium", "recliner", "couple"],
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["available", "reserved", "booked", "maintenance"],
      default: "available",
    },
    reservedBy: { type: String },
    reservedUntil: { type: Date },
    bookedBy: { type: String },
  },
  { _id: false },
);

const ShowSchema = new Schema<IShow>(
  {
    showId: { type: String, required: true, unique: true },
    movieId: { type: String, required: true },
    theatreId: { type: String, required: true },
    screenId: { type: String, required: true },
    showTime: { type: Date, required: true },
    language: { type: String, required: true },
    format: { type: String, enum: ["2D", "3D", "IMAX", "4DX"], required: true },
    totalSeats: { type: Number, required: true, min: 1, max: 1000 },
    availableSeats: { type: Number, required: true, min: 0, max: 1000 },
    seats: {
      type: [ShowSeatSchema],
      required: true,
      validate: [(v: any[]) => v.length > 0, "At least one seat required"],
    },
    pricing: {
      standard: { type: Number, required: true, min: 0 },
      premium: { type: Number, required: true, min: 0 },
      recliner: { type: Number, required: true, min: 0 },
      couple: { type: Number, required: true, min: 0 },
    },
    isActive: { type: Boolean, default: true },
    seatVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { transform },
    toObject: { transform },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Compound indexes cover single-field lookups too — no need for separate ones
ShowSchema.index({ movieId: 1, isActive: 1, showTime: 1 });
ShowSchema.index({ theatreId: 1, isActive: 1, showTime: 1 });
ShowSchema.index({ movieId: 1, theatreId: 1, showTime: 1 });
ShowSchema.index({ showTime: 1, isActive: 1 }); // upcoming shows query

export const Show: Model<IShow> = mongoose.model<IShow>("Show", ShowSchema);
