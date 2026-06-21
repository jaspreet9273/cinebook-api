import { User, IUser } from "../models/user";
import { RefreshToken } from "../models/refresh-token";
import { AppError } from "../middleware/error-handler";
import { logger } from "../config/logger";

interface UpdateProfileInput {
  name?: string;
  phone?: string;
}

class UserService {
  async getById(userId: string): Promise<IUser> {
    const user = await User.findOne({ userId, isActive: true });
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    return user;
  }

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<IUser> {
    // Only update fields that were actually provided
    const updates: Partial<UpdateProfileInput> = {};
    if (input.name !== undefined) updates.name = input.name.trim();
    if (input.phone !== undefined) updates.phone = input.phone;

    if (Object.keys(updates).length === 0) {
      throw new AppError(400, "No fields to update", "NO_UPDATES");
    }

    const user = await User.findOneAndUpdate(
      { userId, isActive: true },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");

    logger.info("User profile updated", {
      userId,
      fields: Object.keys(updates),
    });
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await User.findOne({ userId, isActive: true }).select(
      "+password",
    );
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new AppError(
        401,
        "Current password is incorrect",
        "WRONG_PASSWORD",
      );
    }

    user.password = newPassword; // pre-save hook rehashes
    await user.save();

    // Revoke all refresh tokens — force re-login on all devices after password change
    await RefreshToken.deleteMany({ userId });

    logger.info("Password changed — all sessions revoked", { userId });
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await User.findOne({ userId, isActive: true }).select(
      "+password",
    );
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      throw new AppError(401, "Password is incorrect", "WRONG_PASSWORD");
    }

    // Soft delete — preserve data for audit/recovery
    await User.findOneAndUpdate(
      { userId },
      {
        isActive: false,
        email: `deleted_${Date.now()}_${user.email}`, // free up email for re-registration
      },
    );

    // Revoke all tokens
    await RefreshToken.deleteMany({ userId });

    logger.info("Account deactivated", { userId });
  }
}

export const userService = new UserService();
