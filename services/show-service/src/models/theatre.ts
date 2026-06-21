import mongoose, { Document, Schema, Model } from "mongoose";

export interface IScreen {
  screenId: string;
  name: string;
  totalSeats: number;
  formats: ("2D" | "3D" | "IMAX" | "4DX")[];
  seatLayout: ISeatLayout[];
}

export interface ISeatLayout {
  row: string;
  seats: Array<{
    seatId: string;
    number: number;
    type: "standard" | "premium" | "recliner" | "couple";
    isActive: boolean;
  }>;
}

export interface ITheatre extends Document {
  theatreId: string;
  name: string;
  city: string;
  address: string;
  pincode: string;
  screens: IScreen[];
  amenities: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const transform = (_doc: any, ret: Record<string, any>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const SeatSchema = new Schema(
  {
    seatId: { type: String, required: true },
    number: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: ["standard", "premium", "recliner", "couple"],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const SeatLayoutSchema = new Schema(
  {
    row: { type: String, required: true, trim: true, maxlength: 5 },
    seats: {
      type: [SeatSchema],
      required: true,
      validate: [
        (v: any[]) => v.length > 0,
        "At least one seat per row required",
      ],
    },
  },
  { _id: false },
);

const ScreenSchema = new Schema(
  {
    screenId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    totalSeats: { type: Number, required: true, min: 1, max: 1000 },
    formats: {
      type: [String],
      enum: ["2D", "3D", "IMAX", "4DX"],
      required: true,
      validate: [(v: string[]) => v.length > 0, "At least one format required"],
    },
    seatLayout: {
      type: [SeatLayoutSchema],
      required: true,
      validate: [(v: any[]) => v.length > 0, "Seat layout cannot be empty"],
    },
  },
  { _id: false },
);

const TheatreSchema = new Schema<ITheatre>(
  {
    theatreId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{6}$/, "Pincode must be 6 digits"], // Indian pincode format
    },
    screens: {
      type: [ScreenSchema],
      required: true,
      validate: [(v: any[]) => v.length > 0, "At least one screen required"],
    },
    amenities: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { transform },
    toObject: { transform },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
TheatreSchema.index({ city: 1, isActive: 1 });
TheatreSchema.index({ name: "text", city: "text" }); // search by name or city

export const Theatre: Model<ITheatre> = mongoose.model<ITheatre>(
  "Theatre",
  TheatreSchema,
);
