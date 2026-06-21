import { Router, Request, Response, NextFunction } from "express";
import { requireUserHeader } from "../middleware/require-user-header";
import {
  userController,
  updateProfileValidation,
  changePasswordValidation,
} from "../controllers/user";

export const userRouter = Router();

userRouter.use(requireUserHeader);

userRouter.get("/profile", (req: Request, res: Response, next: NextFunction) =>
  userController.getProfile(req, res, next),
);
userRouter.patch(
  "/profile",
  updateProfileValidation,
  (req: Request, res: Response, next: NextFunction) =>
    userController.updateProfile(req, res, next),
);
userRouter.delete(
  "/account",
  (req: Request, res: Response, next: NextFunction) =>
    userController.deleteAccount(req, res, next),
);
userRouter.patch(
  "/change-password",
  changePasswordValidation,
  (req: Request, res: Response, next: NextFunction) =>
    userController.changePassword(req, res, next),
);
