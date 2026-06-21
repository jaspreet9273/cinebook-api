import request from "supertest";
import app from "../index";

// ─── Mock mongoose to prevent bootstrap from starting server ──────────────────
jest.mock("mongoose", () => ({
  connect: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn().mockResolvedValue({}),
  startSession: jest.fn(),
  model: jest.fn(),
  Schema: jest.fn().mockImplementation(() => ({ index: jest.fn() })),
}));

jest.mock("../models/User", () => {
  const mockUser = {
    userId: "usr_test001",
    name: "Test User",
    email: "test@example.com",
    role: "user",
    isActive: true,
    isVerified: false,
  };

  // Returns an object with .select() — mirrors Mongoose query chaining
  const withSelect = (value: any) => ({
    select: jest.fn().mockResolvedValue(value),
  });

  return {
    User: {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    },
    __mockUser: mockUser,
    __withSelect: withSelect,
  };
});

jest.mock("../models/RefreshToken", () => ({
  RefreshToken: {
    deleteMany: jest.fn(),
  },
}));

const { User, __mockUser, __withSelect } = require("../models/User");
const { RefreshToken } = require("../models/RefreshToken");

const BASE_HEADERS = { "x-user-id": "usr_test001", "x-user-role": "user" };

beforeEach(() => jest.clearAllMocks());

// ─── GET /api/users/profile ───────────────────────────────────────────────────
describe("GET /api/users/profile", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app).get("/api/users/profile");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user profile", async () => {
    User.findOne.mockResolvedValue(__mockUser);
    const res = await request(app).get("/api/users/profile").set(BASE_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("usr_test001");
  });

  it("returns 404 when user not found", async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).get("/api/users/profile").set(BASE_HEADERS);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });
});

// ─── PATCH /api/users/profile ─────────────────────────────────────────────────
describe("PATCH /api/users/profile", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .send({ name: "New" });
    expect(res.status).toBe(401);
  });

  it("returns 200 on valid update", async () => {
    User.findOneAndUpdate.mockResolvedValue({
      ...__mockUser,
      name: "New Name",
    });
    const res = await request(app)
      .patch("/api/users/profile")
      .set(BASE_HEADERS)
      .send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("returns 422 when name is too short", async () => {
    const res = await request(app)
      .patch("/api/users/profile")
      .set(BASE_HEADERS)
      .send({ name: "A" });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("name");
  });

  it("returns 400 when no fields provided", async () => {
    const { AppError } = require("../middleware/errorHandler");
    jest
      .spyOn(require("../services/userService").userService, "updateProfile")
      .mockRejectedValue(
        new AppError(400, "No fields to update", "NO_UPDATES"),
      );

    const res = await request(app)
      .patch("/api/users/profile")
      .set(BASE_HEADERS)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_UPDATES");
  });
});

// ─── PATCH /api/users/change-password ────────────────────────────────────────
describe("PATCH /api/users/change-password", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app)
      .patch("/api/users/change-password")
      .send({ currentPassword: "Old1234", newPassword: "New5678" });
    expect(res.status).toBe(401);
  });

  it("returns 422 when newPassword is weak", async () => {
    const res = await request(app)
      .patch("/api/users/change-password")
      .set(BASE_HEADERS)
      .send({ currentPassword: "Old1234", newPassword: "weak" });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("newPassword");
  });

  it("returns 422 when new password same as current", async () => {
    const res = await request(app)
      .patch("/api/users/change-password")
      .set(BASE_HEADERS)
      .send({ currentPassword: "SamePass1", newPassword: "SamePass1" });
    expect(res.status).toBe(422);
  });

  it("returns 200 on successful password change", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn(),
      }),
    );
    RefreshToken.deleteMany.mockResolvedValue({});

    const res = await request(app)
      .patch("/api/users/change-password")
      .set(BASE_HEADERS)
      .send({ currentPassword: "OldPass1", newPassword: "NewPass12" }); // 8+ chars

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password changed successfully");
    expect(RefreshToken.deleteMany).toHaveBeenCalledWith({
      userId: "usr_test001",
    });
  });

  it("returns 401 when current password is wrong", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        comparePassword: jest.fn().mockResolvedValue(false),
      }),
    );
    const res = await request(app)
      .patch("/api/users/change-password")
      .set(BASE_HEADERS)
      .send({ currentPassword: "WrongPass1", newPassword: "NewPass12" }); // 8+ chars
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("WRONG_PASSWORD");
  });
});

// ─── DELETE /api/users/account ────────────────────────────────────────────────
describe("DELETE /api/users/account", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app)
      .delete("/api/users/account")
      .send({ password: "Test1234" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when password not provided", async () => {
    const res = await request(app)
      .delete("/api/users/account")
      .set(BASE_HEADERS)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PASSWORD_REQUIRED");
  });

  it("returns 200 on successful deletion", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        comparePassword: jest.fn().mockResolvedValue(true),
      }),
    );
    User.findOneAndUpdate.mockResolvedValue({});
    RefreshToken.deleteMany.mockResolvedValue({});

    const res = await request(app)
      .delete("/api/users/account")
      .set(BASE_HEADERS)
      .send({ password: "Test1234" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Account deactivated successfully");
  });

  it("returns 401 when password is wrong", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        comparePassword: jest.fn().mockResolvedValue(false),
      }),
    );
    const res = await request(app)
      .delete("/api/users/account")
      .set(BASE_HEADERS)
      .send({ password: "Wrong123" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("WRONG_PASSWORD");
  });
});
