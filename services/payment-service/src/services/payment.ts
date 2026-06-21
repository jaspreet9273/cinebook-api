import Razorpay from "razorpay";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { Payment, IPayment } from "../models/Payment";
import { kafkaProducer } from "../events/kafka-producer";
import { logger } from "../config/logger";
import { env } from "../config/env";
import { AppError } from "../middleware/error-handler";

const TOPICS = {
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_SUCCESS: "payment.success",
  PAYMENT_FAILED: "payment.failed",
} as const;

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

const IS_RAZORPAY_CONFIGURED =
  env.RAZORPAY_KEY_ID !== "rzp_test_XXXXXXXXXXXXXXXX" &&
  env.RAZORPAY_KEY_SECRET !== "XXXXXXXXXXXXXXXXXXXXXXXX";

class PaymentService {
  /**
   * Create a Razorpay order.
   * Idempotent — returns existing order if one already exists for this booking.
   */
  async createOrder(input: {
    bookingId: string;
    userId: string;
    amount: number;
    currency?: string;
    correlationId: string;
  }): Promise<{ payment: IPayment; razorpayKeyId: string }> {
    if (!IS_RAZORPAY_CONFIGURED) {
      throw new AppError(
        503,
        "Payment service is not configured. Add valid Razorpay keys",
        "PAYMENT_NOT_CONFIGURED",
      );
    }

    // Idempotency — return existing active order
    const existing = await Payment.findOne({
      bookingId: input.bookingId,
      status: { $in: ["initiated", "pending", "success"] },
    });
    if (existing) {
      logger.info("Returning existing payment order", {
        paymentId: existing.paymentId,
      });
      return { payment: existing, razorpayKeyId: env.RAZORPAY_KEY_ID };
    }

    // Validate amount
    if (input.amount <= 0) {
      throw new AppError(
        400,
        "Payment amount must be greater than 0",
        "INVALID_AMOUNT",
      );
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(input.amount * 100), // paise
      currency: input.currency ?? "INR",
      receipt: input.bookingId,
      notes: {
        bookingId: input.bookingId,
        userId: input.userId,
        correlationId: input.correlationId,
      },
    });

    const paymentId = `PAY-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    try {
      const payment = await Payment.create({
        paymentId,
        bookingId: input.bookingId,
        userId: input.userId,
        amount: input.amount,
        currency: input.currency ?? "INR",
        status: "initiated",
        razorpayOrderId: razorpayOrder.id,
        correlationId: input.correlationId,
      });

      kafkaProducer
        .publish(TOPICS.PAYMENT_INITIATED, {
          eventId: uuidv4(),
          correlationId: input.correlationId,
          timestamp: new Date().toISOString(),
          type: "payment.initiated",
          payload: {
            paymentId,
            bookingId: input.bookingId,
            userId: input.userId,
            amount: input.amount,
            razorpayOrderId: razorpayOrder.id,
          },
        })
        .catch((err) =>
          logger.error("Kafka publish failed", { error: err.message }),
        );

      logger.info("Payment order created", {
        paymentId,
        bookingId: input.bookingId,
        razorpayOrderId: razorpayOrder.id,
        amount: input.amount,
      });

      return { payment, razorpayKeyId: env.RAZORPAY_KEY_ID };
    } catch (err: any) {
      // Handle race condition — duplicate razorpayOrderId
      if (err.code === 11000) {
        const existing = await Payment.findOne({
          razorpayOrderId: razorpayOrder.id,
        });
        if (existing)
          return { payment: existing, razorpayKeyId: env.RAZORPAY_KEY_ID };
      }
      throw err;
    }
  }

  /**
   * Verify payment signature after Razorpay checkout.
   * HMAC-SHA256(orderId + "|" + paymentId, key_secret) must match signature.
   */
  async verifyPayment(input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    correlationId: string;
  }): Promise<IPayment> {
    const payment = await Payment.findOne({
      razorpayOrderId: input.razorpayOrderId,
    });
    if (!payment)
      throw new AppError(404, "Payment order not found", "PAYMENT_NOT_FOUND");

    // Idempotent — already verified
    if (payment.status === "success") {
      logger.info("Payment already verified", { paymentId: payment.paymentId });
      return payment;
    }

    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");

    // Constant-time comparison — prevents timing attacks
    const sigBuffer = Buffer.from(input.razorpaySignature, "hex");
    const expectedBuffer = Buffer.from(expectedSig, "hex");
    const isValid =
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (!isValid) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: input.razorpayOrderId },
        { status: "failed", failureReason: "Invalid signature" },
      );

      kafkaProducer
        .publish(TOPICS.PAYMENT_FAILED, {
          eventId: uuidv4(),
          correlationId: input.correlationId,
          timestamp: new Date().toISOString(),
          type: "payment.failed",
          payload: {
            paymentId: payment.paymentId,
            bookingId: payment.bookingId,
            userId: payment.userId,
            reason: "Signature verification failed",
          },
        })
        .catch(() => {});

      throw new AppError(
        400,
        "Payment verification failed",
        "INVALID_SIGNATURE",
      );
    }

    // Mark success — do NOT store signature
    const updated = await Payment.findOneAndUpdate(
      { razorpayOrderId: input.razorpayOrderId },
      {
        status: "success",
        razorpayPaymentId: input.razorpayPaymentId,
        // razorpaySignature NOT stored — verified but discarded
      },
      { new: true },
    );

    if (!updated)
      throw new AppError(500, "Payment update failed", "UPDATE_FAILED");

    // Publish success — booking service confirms booking on this event
    kafkaProducer
      .publish(TOPICS.PAYMENT_SUCCESS, {
        eventId: uuidv4(),
        correlationId: input.correlationId,
        timestamp: new Date().toISOString(),
        type: "payment.success",
        payload: {
          paymentId: payment.paymentId,
          bookingId: payment.bookingId,
          userId: payment.userId,
          amount: payment.amount,
          razorpayPaymentId: input.razorpayPaymentId,
        },
      })
      .catch((err) =>
        logger.error("Kafka publish failed", { error: err.message }),
      );

    logger.info("Payment verified", {
      paymentId: payment.paymentId,
      bookingId: payment.bookingId,
      razorpayPaymentId: input.razorpayPaymentId,
      correlationId: input.correlationId,
    });

    return updated;
  }

  /**
   * Initiate a refund — full or partial.
   */
  async refund(input: {
    paymentId: string;
    amount?: number;
    correlationId: string;
  }): Promise<IPayment> {
    const payment = await Payment.findOne({ paymentId: input.paymentId });
    if (!payment)
      throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    if (payment.status !== "success")
      throw new AppError(
        400,
        "Only successful payments can be refunded",
        "INVALID_STATUS",
      );
    if (!payment.razorpayPaymentId)
      throw new AppError(
        400,
        "Razorpay payment ID missing",
        "MISSING_PAYMENT_ID",
      );

    // Validate partial refund amount
    if (input.amount !== undefined) {
      if (input.amount <= 0)
        throw new AppError(
          400,
          "Refund amount must be greater than 0",
          "INVALID_REFUND_AMOUNT",
        );
      if (input.amount > payment.amount)
        throw new AppError(
          400,
          "Refund amount exceeds original payment",
          "REFUND_EXCEEDS_PAYMENT",
        );
    }

    const refundAmountPaise = input.amount
      ? Math.round(input.amount * 100)
      : Math.round(payment.amount * 100);

    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: refundAmountPaise,
      notes: { correlationId: input.correlationId },
    });

    const updated = await Payment.findOneAndUpdate(
      { paymentId: input.paymentId },
      { status: "refund_pending", razorpayRefundId: refund.id },
      { new: true },
    );

    if (!updated)
      throw new AppError(500, "Refund update failed", "UPDATE_FAILED");

    logger.info("Refund initiated", {
      paymentId: input.paymentId,
      razorpayRefundId: refund.id,
      amountRupees: refundAmountPaise / 100,
      correlationId: input.correlationId,
    });

    return updated;
  }

  /**
   * Handle Razorpay webhook events.
   * Raw body must be passed for signature verification.
   */
  async handleWebhook(
    rawBody: Buffer | string,
    signature: string,
    correlationId: string,
  ): Promise<void> {
    const bodyString = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : rawBody;

    // Verify webhook signature
    const expectedSig = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(bodyString)
      .digest("hex");

    if (expectedSig !== signature) {
      throw new AppError(
        400,
        "Invalid webhook signature",
        "INVALID_WEBHOOK_SIGNATURE",
      );
    }

    const event = JSON.parse(bodyString);
    const entity = event.payload?.payment?.entity;

    logger.info("Razorpay webhook received", {
      event: event.event,
      orderId: entity?.order_id,
      correlationId,
    });

    switch (event.event) {
      case "payment.captured": {
        const updated = await Payment.findOneAndUpdate(
          { razorpayOrderId: entity.order_id, status: { $ne: "success" } },
          { status: "success", razorpayPaymentId: entity.id },
          { new: true },
        );

        // Publish success so booking service confirms the booking
        if (updated) {
          kafkaProducer
            .publish(TOPICS.PAYMENT_SUCCESS, {
              eventId: uuidv4(),
              correlationId,
              timestamp: new Date().toISOString(),
              type: "payment.success",
              payload: {
                paymentId: updated.paymentId,
                bookingId: updated.bookingId,
                userId: updated.userId,
                amount: updated.amount,
                razorpayPaymentId: entity.id,
              },
            })
            .catch(() => {});
        }
        break;
      }

      case "payment.failed": {
        await Payment.findOneAndUpdate(
          { razorpayOrderId: entity.order_id },
          {
            status: "failed",
            failureReason: entity.error_description ?? "Payment failed",
          },
        );

        kafkaProducer
          .publish(TOPICS.PAYMENT_FAILED, {
            eventId: uuidv4(),
            correlationId,
            timestamp: new Date().toISOString(),
            type: "payment.failed",
            payload: {
              razorpayOrderId: entity.order_id,
              reason: entity.error_description,
            },
          })
          .catch(() => {});
        break;
      }

      case "refund.processed": {
        await Payment.findOneAndUpdate(
          { razorpayRefundId: event.payload?.refund?.entity?.id },
          { status: "refunded" },
        );
        break;
      }

      default:
        logger.debug("Unhandled webhook event", { event: event.event });
    }
  }

  async getPaymentByBooking(bookingId: string): Promise<IPayment | null> {
    return Payment.findOne({ bookingId }).sort({ createdAt: -1 });
  }
}

export const paymentService = new PaymentService();
