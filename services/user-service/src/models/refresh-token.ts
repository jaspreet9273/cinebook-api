import mongoose, { Document, Schema, Model } from "mongoose";

export interface IRefreshToken extends Document {
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

RefreshTokenSchema.index({ userId: 1, token: 1 });

export const RefreshToken: Model<IRefreshToken> = mongoose.model<IRefreshToken>(
  "RefreshToken",
  RefreshTokenSchema,
);
