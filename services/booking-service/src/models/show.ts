import mongoose, { Document, Schema, Model } from "mongoose";

export type SeatStatus = "available" | "reserved" | "booked" | "maintenance";

export interface IShowSeat {
  seatId: string;
  row: string;
  number: number;
  type: "standard" | "premium" | "recliner" | "couple";
  price: number;
  status: SeatStatus;
  reservedBy?: string; // bookingId holding this seat
  reservedUntil?: Date; // reservation expiry
  bookedBy?: string; // confirmed bookingId
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
  isActive: boolean;
  seatVersion: number; // OCC version — incremented on every seat state change
  createdAt: Date;
  updatedAt: Date;
}

const ShowSeatSchema = new Schema<IShowSeat>(
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
    totalSeats: { type: Number, required: true, min: 1 },
    availableSeats: { type: Number, required: true, min: 0 },
    seats: { type: [ShowSeatSchema], required: true },
    isActive: { type: Boolean, default: true },
    seatVersion: { type: Number, default: 0 }, // renamed from 'version' to avoid __v confusion
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

// ─── Indexes ──────────────────────────────────────────────────────────────────
ShowSchema.index({ movieId: 1, isActive: 1, showTime: 1 }); // browse shows by movie
ShowSchema.index({ theatreId: 1, isActive: 1, showTime: 1 }); // browse shows by theatre
ShowSchema.index({ showTime: 1, isActive: 1 }); // upcoming shows

export const Show: Model<IShow> = mongoose.model<IShow>("Show", ShowSchema);
