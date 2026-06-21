import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { authService } from "../services/auth";

// ─── Validation chains ────────────────────────────────────────────────────────

export const registerValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be 2-100 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password needs 8+ chars with uppercase, lowercase, and a number",
    ),
  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Invalid phone number"),
];

export const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password required"),
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

export class AuthController {
  async register(
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

      // Whitelist fields — never trust req.body directly
      const { name, email, password, phone } = req.body;
      const result = await authService.register({
        name,
        email,
        password,
        phone,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      const { email, password } = req.body;
      const result = await authService.login({ email, password });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async refresh(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken || typeof refreshToken !== "string") {
        res.status(400).json({
          error: "refreshToken required",
          code: "MISSING_REFRESH_TOKEN",
        });
        return;
      }

      const result = await authService.refresh(refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      // Idempotent — succeeds even without a token (already logged out)
      if (refreshToken && typeof refreshToken === "string") {
        await authService.logout(refreshToken);
      }
      res.json({ message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // x-user-id is guaranteed by requireUserHeader middleware
      const userId = req.headers["x-user-id"] as string;
      const user = await authService.getProfile(userId);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
