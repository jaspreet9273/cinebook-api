import mongoose, { Document, Schema, Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  userId: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "user" | "admin" | "theatre_owner";
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const transform = (_doc: any, ret: any) => {
  delete ret._id;
  delete ret.__v;
  delete ret.password;
  return ret;
};

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    phone: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["user", "admin", "theatre_owner"],
      default: "user",
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { transform },
    toObject: { transform }, // also strip password from .toObject() calls
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
UserSchema.index({ isActive: 1, role: 1 }); // admin queries filtering by role
UserSchema.index({ createdAt: -1 }); // user list sorted by newest

// ─── Password hashing ─────────────────────────────────────────────────────────
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err as Error);
  }
});

UserSchema.methods.comparePassword = async function (
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);
