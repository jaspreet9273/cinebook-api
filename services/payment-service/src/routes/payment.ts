import { Router, Request, Response, NextFunction } from "express";
import {
  paymentController,
  createOrderValidation,
  verifyPaymentValidation,
} from "../controllers/payment";

export const paymentRouter = Router();

paymentRouter.post(
  "/orders",
  createOrderValidation,
  (req: Request, res: Response, next: NextFunction) =>
    paymentController.createOrder(req, res, next),
);

paymentRouter.post(
  "/verify",
  verifyPaymentValidation,
  (req: Request, res: Response, next: NextFunction) =>
    paymentController.verifyPayment(req, res, next),
);

// Webhook — no auth, no rate limit (Razorpay calls this directly)
paymentRouter.post(
  "/webhook",
  (req: Request, res: Response, next: NextFunction) =>
    paymentController.webhook(req, res, next),
);

paymentRouter.post(
  "/:paymentId/refund",
  (req: Request, res: Response, next: NextFunction) =>
    paymentController.refund(req, res, next),
);

paymentRouter.get(
  "/booking/:bookingId",
  (req: Request, res: Response, next: NextFunction) =>
    paymentController.getByBooking(req, res, next),
);
