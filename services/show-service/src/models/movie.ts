import mongoose, { Document, Schema, Model } from "mongoose";

export interface IMovie extends Document {
  movieId: string;
  title: string;
  description: string;
  genre: string[];
  language: string[];
  duration: number;
  rating: "U" | "UA" | "A" | "S";
  cast: string[];
  director: string;
  releaseDate: Date;
  posterUrl?: string;
  trailerUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const transform = (_doc: any, ret: Record<string, any>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const MovieSchema = new Schema<IMovie>(
  {
    movieId: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },
    genre: {
      type: [String],
      required: true,
      validate: [(v: string[]) => v.length > 0, "At least one genre required"],
    },
    language: {
      type: [String],
      required: true,
      validate: [
        (v: string[]) => v.length > 0,
        "At least one language required",
      ],
    },
    duration: { type: Number, required: true, min: 1, max: 600 }, // max 10 hours
    rating: { type: String, enum: ["U", "UA", "A", "S"], required: true },
    cast: { type: [String], default: [] },
    director: { type: String, required: true, trim: true, maxlength: 200 },
    releaseDate: { type: Date, required: true },
    posterUrl: { type: String },
    trailerUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { transform },
    toObject: { transform },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
MovieSchema.index(
  { title: "text", description: "text" },
  { language_override: "search_language" },
);
MovieSchema.index({ releaseDate: -1, isActive: 1 }); // latest active movies
MovieSchema.index({ genre: 1, isActive: 1 }); // filter by genre
MovieSchema.index({ language: 1, isActive: 1 }); // filter by language

export const Movie: Model<IMovie> = mongoose.model<IMovie>(
  "Movie",
  MovieSchema,
);
