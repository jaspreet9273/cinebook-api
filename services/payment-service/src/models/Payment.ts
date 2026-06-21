import mongoose, { Document, Schema, Model } from "mongoose";

export type PaymentStatus =
  | "initiated" // Razorpay order created
  | "pending" // Awaiting user to complete checkout
  | "success" // Payment captured and verified
  | "failed" // Payment failed or signature invalid
  | "refunded" // Full refund processed
  | "refund_pending"; // Refund initiated, awaiting Razorpay confirmation

export interface IPayment extends Document {
  paymentId: string;
  bookingId: string;
  userId: string;
  amount: number; // In rupees
  currency: string;
  status: PaymentStatus;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string; // Never returned in API responses
  razorpayRefundId?: string;
  failureReason?: string;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

const transform = (_doc: any, ret: Record<string, any>) => {
  delete ret._id;
  delete ret.__v;
  delete ret.razorpaySignature; // never expose signature in responses
  return ret;
};

const PaymentSchema = new Schema<IPayment>(
  {
    paymentId: { type: String, required: true, unique: true },
    bookingId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 1 }, // min ₹1
    currency: { type: String, required: true, default: "INR", uppercase: true },
    status: {
      type: String,
      enum: [
        "initiated",
        "pending",
        "success",
        "failed",
        "refunded",
        "refund_pending",
      ],
      default: "initiated",
      index: true,
    },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String, select: false }, // excluded from all queries by default
    razorpayRefundId: { type: String, unique: true, sparse: true },
    failureReason: { type: String },
    correlationId: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: { transform },
    toObject: { transform },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
PaymentSchema.index({ bookingId: 1, status: 1 });
PaymentSchema.index({ userId: 1, createdAt: -1 }); // user payment history

export const Payment: Model<IPayment> = mongoose.model<IPayment>(
  "Payment",
  PaymentSchema,
);
