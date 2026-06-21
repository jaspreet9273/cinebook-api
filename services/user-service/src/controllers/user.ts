import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { userService } from "../services/user";

// ─── Validation chains ────────────────────────────────────────────────────────

export const updateProfileValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters"),
  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Invalid phone number"),
];

export const changePasswordValidation = [
  body("currentPassword").notEmpty().withMessage("Current password required"),
  body("newPassword")
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "New password needs 8+ chars with uppercase, lowercase, and a number",
    ),
  body("newPassword").custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error("New password must be different from current password");
    }
    return true;
  }),
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatErrors(req: Request) {
  return validationResult(req)
    .array()
    .map((e) => ({
      field: e.type === "field" ? (e as any).path : e.type,
      message: e.msg,
    }));
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class UserController {
  /**
   * GET /api/users/profile
   * Returns the logged-in user's full profile.
   */
  async getProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.headers["x-user-id"] as string;
      const user = await userService.getById(userId);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/users/profile
   * Update name and/or phone. Email and role changes are not allowed here.
   */
  async updateProfile(
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

      const userId = req.headers["x-user-id"] as string;

      // Whitelist — never allow role/email/password updates through this endpoint
      const { name, phone } = req.body;
      const updated = await userService.updateProfile(userId, { name, phone });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/users/change-password
   * Requires current password verification before setting new one.
   */
  async changePassword(
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

      const userId = req.headers["x-user-id"] as string;
      const { currentPassword, newPassword } = req.body;

      await userService.changePassword(userId, currentPassword, newPassword);
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/users/account
   * Soft-deletes the account (sets isActive: false).
   * Requires password confirmation.
   */
  async deleteAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.headers["x-user-id"] as string;
      const { password } = req.body;

      if (!password || typeof password !== "string") {
        res.status(400).json({
          error: "Password confirmation required",
          code: "PASSWORD_REQUIRED",
        });
        return;
      }

      await userService.deleteAccount(userId, password);
      res.json({ message: "Account deactivated successfully" });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
