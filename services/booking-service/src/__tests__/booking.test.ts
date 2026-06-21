import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import app from "../index";

// ─── Mock all external dependencies ──────────────────────────────────────────
jest.mock("../events/kafkaProducer", () => ({
  kafkaProducer: {
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../events/rabbitPublisher", () => ({
  rabbitPublisher: {
    connect: jest.fn().mockResolvedValue(undefined),
    publishNotification: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../services/bookingService", () => ({
  bookingService: {
    init: jest.fn().mockResolvedValue(undefined),
    createBooking: jest.fn(),
    cancelBooking: jest.fn(),
  },
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────
const BASE_HEADERS = {
  "x-user-id": "usr-test-001",
  "x-user-email": "test@example.com",
  "x-user-role": "user",
  "x-correlation-id": uuidv4(),
};

const validPayload = {
  showId: "SHOW-001",
  seatIds: ["A1", "A2"],
  idempotencyKey: uuidv4(),
};

// ─── POST /api/bookings ───────────────────────────────────────────────────────
describe("POST /api/bookings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 when seatIds is empty", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send({ ...validPayload, seatIds: [] });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0]).toHaveProperty("field");
    expect(res.body.errors[0]).toHaveProperty("message");
  });

  it("returns 422 when idempotencyKey is not a UUID v4", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send({ ...validPayload, idempotencyKey: "not-a-uuid" });

    expect(res.status).toBe(422);
  });

  it("returns 422 when showId is missing", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send({ seatIds: ["A1"], idempotencyKey: uuidv4() });

    expect(res.status).toBe(422);
  });

  it("returns 422 when more than 10 seats requested", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send({
        ...validPayload,
        seatIds: Array.from({ length: 11 }, (_, i) => `A${i + 1}`),
      });

    expect(res.status).toBe(422);
  });

  it("returns 201 on successful booking", async () => {
    const { bookingService } = require("../services/bookingService");
    const mockBooking = {
      bookingId: "BKG-123",
      status: "pending",
      totalAmount: 510,
      convenienceFee: 10,
      currency: "INR",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      seats: [
        { seatId: "A1", row: "A", number: 1, type: "standard", price: 250 },
      ],
    };

    bookingService.createBooking.mockResolvedValue({
      booking: mockBooking,
      isNew: true,
    });

    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.bookingId).toBe("BKG-123");
    expect(res.body.isIdempotentReplay).toBe(false);
  });

  it("returns 200 and isIdempotentReplay=true on duplicate request", async () => {
    const { bookingService } = require("../services/bookingService");
    const mockBooking = {
      bookingId: "BKG-123",
      status: "pending",
      totalAmount: 510,
      convenienceFee: 10,
      currency: "INR",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      seats: [],
    };

    bookingService.createBooking.mockResolvedValue({
      booking: mockBooking,
      isNew: false,
    });

    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send(validPayload);

    expect(res.status).toBe(200);
    expect(res.body.isIdempotentReplay).toBe(true);
  });

  it("returns 409 when seats are unavailable", async () => {
    const { bookingService } = require("../services/bookingService");
    const { AppError } = require("../middleware/errorHandler");

    bookingService.createBooking.mockRejectedValue(
      new AppError(409, "Seats A1, A2 are unavailable", "SEATS_UNAVAILABLE"),
    );

    const res = await request(app)
      .post("/api/bookings")
      .set(BASE_HEADERS)
      .send(validPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SEATS_UNAVAILABLE");
  });

  it("returns 401 when x-user-id header is missing", async () => {
    const res = await request(app).post("/api/bookings").send(validPayload);

    expect(res.status).toBe(401);
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200 with service info", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("booking-service");
    expect(res.body.status).toBe("ok");
  });
});

// ─── GET /api/bookings ────────────────────────────────────────────────────────
describe("GET /api/bookings", () => {
  it("returns 401 when x-user-id header is missing", async () => {
    const res = await request(app).get("/api/bookings");
    expect(res.status).toBe(401);
  });
});
