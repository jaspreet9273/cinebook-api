import { Router, Request, Response, NextFunction } from "express";
import {
  authController,
  registerValidation,
  loginValidation,
} from "../controllers/auth";
import { requireUserHeader } from "../middleware/require-user-header";

export const authRouter = Router();

// Public routes
authRouter.post(
  "/register",
  registerValidation,
  (req: Request, res: Response, next: NextFunction) =>
    authController.register(req, res, next),
);
authRouter.post(
  "/login",
  loginValidation,
  (req: Request, res: Response, next: NextFunction) =>
    authController.login(req, res, next),
);
authRouter.post("/refresh", (req: Request, res: Response, next: NextFunction) =>
  authController.refresh(req, res, next),
);
authRouter.post("/logout", (req: Request, res: Response, next: NextFunction) =>
  authController.logout(req, res, next),
);

// Protected — requires X-User-Id header forwarded by gateway
authRouter.get(
  "/me",
  requireUserHeader,
  (req: Request, res: Response, next: NextFunction) =>
    authController.me(req, res, next),
);
