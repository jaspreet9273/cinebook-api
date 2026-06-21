import request from "supertest";
import app from "../index";

jest.mock("../models/User", () => {
  const mockUser = {
    userId: "usr_test001",
    name: "Test User",
    email: "test@example.com",
    role: "user",
    isActive: true,
    isVerified: false,
  };

  // Helper — returns object with .select() chaining
  const withSelect = (returnValue: any) => ({
    select: jest.fn().mockResolvedValue(returnValue),
  });

  return {
    User: {
      findOne: jest.fn(),
      create: jest.fn(),
    },
    __mockUser: mockUser,
    __withSelect: withSelect,
  };
});

jest.mock("../models/RefreshToken", () => ({
  RefreshToken: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const { User, __mockUser, __withSelect } = require("../models/User");
const { RefreshToken } = require("../models/RefreshToken");

const VALID_REGISTER = {
  name: "Test User",
  email: "test@example.com",
  password: "Test1234",
};
const VALID_LOGIN = { email: "test@example.com", password: "Test1234" };

// ─── POST /api/auth/register ──────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with tokens on success", async () => {
    User.create.mockResolvedValue({
      ...__mockUser,
      comparePassword: jest.fn(),
    });
    RefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/register")
      .send(VALID_REGISTER);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("returns 422 when name is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_REGISTER, name: "A" });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("name");
  });

  it("returns 422 when email is invalid", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_REGISTER, email: "bad" });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("email");
  });

  it("returns 422 when password is weak", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_REGISTER, password: "weak" });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("password");
  });

  it("returns 409 when email already taken", async () => {
    User.create.mockRejectedValue({ code: 11000 });
    const res = await request(app)
      .post("/api/auth/register")
      .send(VALID_REGISTER);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with tokens on valid credentials", async () => {
    // findOne().select() chain
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        password: "hashed",
        comparePassword: jest.fn().mockResolvedValue(true),
      }),
    );
    RefreshToken.create.mockResolvedValue({});

    const res = await request(app).post("/api/auth/login").send(VALID_LOGIN);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("refreshToken");
  });

  it("returns 401 on wrong password", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        password: "hashed",
        comparePassword: jest.fn().mockResolvedValue(false),
      }),
    );
    const res = await request(app).post("/api/auth/login").send(VALID_LOGIN);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 when user does not exist", async () => {
    User.findOne.mockReturnValue(__withSelect(null));
    const res = await request(app).post("/api/auth/login").send(VALID_LOGIN);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 when account is deactivated", async () => {
    User.findOne.mockReturnValue(
      __withSelect({
        ...__mockUser,
        isActive: false,
        comparePassword: jest.fn().mockResolvedValue(true),
      }),
    );
    const res = await request(app).post("/api/auth/login").send(VALID_LOGIN);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 422 when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "Test1234" });
    expect(res.status).toBe(422);
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
describe("POST /api/auth/refresh", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when refreshToken missing", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_REFRESH_TOKEN");
  });

  it("returns 401 when token is invalid", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "bad.token.here" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("returns 401 and revokes all tokens on reuse attack", async () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { id: "usr_test001", email: "test@example.com", role: "user" },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: "7d" },
    );
    RefreshToken.findOne.mockResolvedValue(null);
    RefreshToken.deleteMany.mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: token });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("REFRESH_TOKEN_REVOKED");
    expect(RefreshToken.deleteMany).toHaveBeenCalledWith({
      userId: "usr_test001",
    });
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 without token (idempotent)", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
  });

  it("returns 200 and deletes token", async () => {
    RefreshToken.deleteOne.mockResolvedValue({});
    const res = await request(app)
      .post("/api/auth/logout")
      .send({ refreshToken: "some.token" });
    expect(res.status).toBe(200);
    expect(RefreshToken.deleteOne).toHaveBeenCalled();
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when headers missing", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user profile", async () => {
    User.findOne.mockResolvedValue(__mockUser);
    const res = await request(app)
      .get("/api/auth/me")
      .set("x-user-id", "usr_test001")
      .set("x-user-role", "user");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("usr_test001");
  });

  it("returns 404 when user not found", async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/auth/me")
      .set("x-user-id", "usr_none")
      .set("x-user-role", "user");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
