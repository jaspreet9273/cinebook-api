import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { addDays } from "date-fns";
import { User, IUser } from "../models/user";
import { RefreshToken } from "../models/refresh-token";
import { env } from "../config/env";
import { AppError } from "../middleware/error-handler";
import { logger } from "../config/logger";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: Partial<IUser>;
}

interface JwtRefreshPayload {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// Dummy hash for timing attack prevention
const DUMMY_HASH = "$2a$12$dummyhashfortimingattackpreventiondummy";

class AuthService {
  async register(input: RegisterInput): Promise<TokenPair> {
    try {
      const user = await User.create({
        userId: `usr_${uuidv4().replace(/-/g, "").slice(0, 16)}`,
        name: input.name,
        email: input.email,
        password: input.password, // hashed by pre-save hook
        phone: input.phone,
      });

      logger.info("User registered", { userId: user.userId });
      return this.issueTokens(user);
    } catch (err: any) {
      // MongoDB duplicate key error
      if (err.code === 11000) {
        throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
      }
      throw err;
    }
  }

  async login(input: LoginInput): Promise<TokenPair> {
    // Always select password to prevent timing attack
    // (if we skip bcrypt when user not found, response is faster → leaks email existence)
    const user = await User.findOne({ email: input.email }).select("+password");

    // Run bcrypt even if user not found — prevents timing-based email enumeration
    const passwordToCheck = user?.password ?? DUMMY_HASH;
    const isValid = user
      ? await user.comparePassword(input.password)
      : await import("bcryptjs").then((b) =>
          b.default.compare(input.password, passwordToCheck),
        );

    if (!user || !user.isActive || !isValid) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    logger.info("User logged in", { userId: user.userId });
    return this.issueTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    // 1. Verify JWT signature
    let payload: JwtRefreshPayload;
    try {
      payload = jwt.verify(
        rawRefreshToken,
        env.JWT_REFRESH_SECRET,
      ) as JwtRefreshPayload;
    } catch {
      throw new AppError(
        401,
        "Invalid or expired refresh token",
        "INVALID_REFRESH_TOKEN",
      );
    }

    const hashed = this.hashToken(rawRefreshToken);
    const stored = await RefreshToken.findOne({
      token: hashed,
      userId: payload.id,
    });

    if (!stored) {
      // Token not found — possible reuse attack
      // Invalidate ALL refresh tokens for this user (token family breach)
      await RefreshToken.deleteMany({ userId: payload.id });
      logger.warn("Refresh token reuse detected — all tokens revoked", {
        userId: payload.id,
      });
      throw new AppError(401, "Refresh token revoked", "REFRESH_TOKEN_REVOKED");
    }

    // 2. Delete used token (one-time use rotation)
    await RefreshToken.deleteOne({ _id: stored._id });

    // 3. Get fresh user data
    const user = await User.findOne({ userId: payload.id });
    if (!user || !user.isActive) {
      throw new AppError(
        401,
        "User not found or deactivated",
        "USER_NOT_FOUND",
      );
    }

    return this.issueTokens(user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    let userId: string | undefined;
    try {
      const payload = jwt.decode(rawRefreshToken) as JwtRefreshPayload | null;
      userId = payload?.id;
    } catch {
      /* ignore */
    }

    const hashed = this.hashToken(rawRefreshToken);
    await RefreshToken.deleteOne({ token: hashed });

    logger.info("User logged out", { userId: userId ?? "unknown" });
  }

  async getProfile(userId: string): Promise<IUser> {
    const user = await User.findOne({ userId, isActive: true });
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    return user;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async issueTokens(user: IUser): Promise<TokenPair> {
    const payload = { id: user.userId, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    const rawRefresh = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
    });

    // Parse refresh expiry from env for TTL (e.g. "7d" → 7 days)
    const refreshDays = parseInt(env.JWT_REFRESH_EXPIRES_IN) || 7;

    await RefreshToken.create({
      userId: user.userId,
      token: this.hashToken(rawRefresh),
      expiresAt: addDays(new Date(), refreshDays),
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

export const authService = new AuthService();
