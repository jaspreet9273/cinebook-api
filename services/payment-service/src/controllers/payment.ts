import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { paymentService } from "../services/payment";
import { AppError } from "../middleware/error-handler";

// ─── Validation ───────────────────────────────────────────────────────────────
export const createOrderValidation = [
  body("bookingId").notEmpty().withMessage("bookingId required").isString(),
  body("amount")
    .isFloat({ min: 1 })
    .withMessage("amount must be greater than 0"),
  body("currency")
    .optional()
    .isIn(["INR", "USD"])
    .withMessage("currency must be INR or USD"),
];

export const verifyPaymentValidation = [
  body("razorpayOrderId").notEmpty().withMessage("razorpayOrderId required"),
  body("razorpayPaymentId")
    .notEmpty()
    .withMessage("razorpayPaymentId required"),
  body("razorpaySignature")
    .notEmpty()
    .withMessage("razorpaySignature required")
    .isHexadecimal()
    .withMessage("razorpaySignature must be a hex string"),
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

function getUserRole(req: Request): string {
  return (req.headers["x-user-role"] as string)?.trim() ?? "user";
}

// ─── Controller ───────────────────────────────────────────────────────────────
export class PaymentController {
  // POST /api/payments/orders
  async createOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      const userId = getUserId(req);
      const { bookingId, amount, currency } = req.body;

      const { payment, razorpayKeyId } = await paymentService.createOrder({
        bookingId,
        userId,
        amount,
        currency,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        paymentId: payment.paymentId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayKeyId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/verify
  async verifyPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } =
        req.body;

      const payment = await paymentService.verifyPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        correlationId: req.correlationId,
      });

      res.json({
        status: payment.status,
        paymentId: payment.paymentId,
        bookingId: payment.bookingId,
        razorpayPaymentId: payment.razorpayPaymentId,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/:paymentId/refund — admin only
  async refund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = getUserRole(req);
      if (!["admin", "theatre_owner"].includes(role)) {
        throw new AppError(
          403,
          "Admin access required for refunds",
          "FORBIDDEN",
        );
      }

      const { paymentId } = req.params;
      const amount =
        req.body.amount !== undefined ? parseFloat(req.body.amount) : undefined;

      if (amount !== undefined && isNaN(amount)) {
        res.status(422).json({
          errors: [{ field: "amount", message: "amount must be a number" }],
        });
        return;
      }

      const payment = await paymentService.refund({
        paymentId,
        amount,
        correlationId: req.correlationId,
      });

      res.json({
        status: payment.status,
        razorpayRefundId: payment.razorpayRefundId,
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/payments/webhook — Razorpay calls this directly, no JWT
  async webhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const signature = req.headers["x-razorpay-signature"] as string;

      if (!signature) {
        res.status(400).json({ error: "Missing webhook signature" });
        return;
      }

      // req.body is a Buffer here because of express.raw() in index.ts
      // Do NOT JSON.stringify — pass the raw Buffer directly
      await paymentService.handleWebhook(
        req.body as Buffer,
        signature,
        req.correlationId,
      );

      // Always return 200 quickly — Razorpay retries on non-200
      res.json({ status: "ok" });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/payments/booking/:bookingId
  async getByBooking(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.params;

      const payment = await paymentService.getPaymentByBooking(bookingId);

      if (!payment) {
        res
          .status(404)
          .json({ error: "Payment not found", code: "PAYMENT_NOT_FOUND" });
        return;
      }

      // Only allow user to see their own payment, or admin to see any
      const role = getUserRole(req);
      if (
        payment.userId !== userId &&
        !["admin", "theatre_owner"].includes(role)
      ) {
        throw new AppError(403, "Not your payment", "FORBIDDEN");
      }

      res.json(payment);
    } catch (err) {
      next(err);
    }
  }
}

export const paymentController = new PaymentController();
