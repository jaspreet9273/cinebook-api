import request from "supertest";
import crypto from "crypto";
import app from "../index";

jest.mock("../events/kafkaProducer", () => ({
  kafkaProducer: {
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest
        .fn()
        .mockResolvedValue({
          id: "order_test123",
          amount: 51000,
          currency: "INR",
        }),
    },
    payments: { refund: jest.fn().mockResolvedValue({ id: "refund_test123" }) },
  }));
});

jest.mock("../models/Payment", () => {
  const mockPayment = {
    paymentId: "PAY-TEST-001",
    bookingId: "BKG-001",
    userId: "usr-001",
    amount: 510,
    currency: "INR",
    status: "initiated",
    razorpayOrderId: "order_test123",
    razorpayPaymentId: undefined,
    correlationId: "corr-001",
  };
  return {
    Payment: {
      findOne: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
    },
    __mockPayment: mockPayment,
  };
});

const { Payment, __mockPayment } = require("../models/Payment");

const USER_HEADERS = { "x-user-id": "usr-001", "x-user-role": "user" };
const ADMIN_HEADERS = { "x-user-id": "usr-admin-001", "x-user-role": "admin" };

beforeEach(() => jest.clearAllMocks());

// ─── POST /api/payments/orders ────────────────────────────────────────────────
describe("POST /api/payments/orders", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app)
      .post("/api/payments/orders")
      .send({ bookingId: "BKG-001", amount: 510 });
    expect(res.status).toBe(401);
  });

  it("returns 422 when bookingId is missing", async () => {
    const res = await request(app)
      .post("/api/payments/orders")
      .set(USER_HEADERS)
      .send({ amount: 510 });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("bookingId");
  });

  it("returns 422 when amount is zero", async () => {
    const res = await request(app)
      .post("/api/payments/orders")
      .set(USER_HEADERS)
      .send({ bookingId: "BKG-001", amount: 0 });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("amount");
  });

  it("returns 422 when amount is negative", async () => {
    const res = await request(app)
      .post("/api/payments/orders")
      .set(USER_HEADERS)
      .send({ bookingId: "BKG-001", amount: -100 });
    expect(res.status).toBe(422);
  });

  it("returns 201 on successful order creation", async () => {
    Payment.findOne.mockResolvedValue(null);
    Payment.create.mockResolvedValue(__mockPayment);

    const res = await request(app)
      .post("/api/payments/orders")
      .set(USER_HEADERS)
      .send({ bookingId: "BKG-001", amount: 510 });

    expect(res.status).toBe(201);
    expect(res.body.paymentId).toBe("PAY-TEST-001");
    expect(res.body.razorpayOrderId).toBe("order_test123");
    expect(res.body.razorpayKeyId).toBe("rzp_test_dummy");
    expect(res.body).not.toHaveProperty("razorpaySignature");
  });

  it("returns existing order on idempotent replay", async () => {
    Payment.findOne.mockResolvedValue({
      ...__mockPayment,
      status: "initiated",
    });

    const res = await request(app)
      .post("/api/payments/orders")
      .set(USER_HEADERS)
      .send({ bookingId: "BKG-001", amount: 510 });

    expect(res.status).toBe(201);
    expect(res.body.razorpayOrderId).toBe("order_test123");
    expect(Payment.create).not.toHaveBeenCalled();
  });
});

// ─── POST /api/payments/verify ────────────────────────────────────────────────
describe("POST /api/payments/verify", () => {
  it("returns 422 when all fields missing", async () => {
    const res = await request(app).post("/api/payments/verify").send({});
    expect(res.status).toBe(422);
  });

  it("returns 422 when razorpaySignature is missing", async () => {
    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: "order_test123",
        razorpayPaymentId: "pay_test123",
      });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("razorpaySignature");
  });

  it("returns 422 when signature is not hex", async () => {
    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: "order_test123",
        razorpayPaymentId: "pay_test123",
        razorpaySignature: "not-hex-string!",
      });
    expect(res.status).toBe(422);
  });

  it("returns 404 when payment order not found", async () => {
    Payment.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: "order_nonexistent",
        razorpayPaymentId: "pay_test123",
        razorpaySignature: "abc123def456abc123def456abc123de",
      });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
  });

  it("returns 400 on invalid signature", async () => {
    Payment.findOne.mockResolvedValue({ ...__mockPayment, status: "pending" });
    Payment.findOneAndUpdate.mockResolvedValue({
      ...__mockPayment,
      status: "failed",
    });

    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: "order_test123",
        razorpayPaymentId: "pay_test123",
        razorpaySignature: "abc123def456abc123def456abc123de",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_SIGNATURE");
  });

  it("returns 200 on valid signature", async () => {
    const orderId = "order_test123";
    const paymentId = "pay_test123";
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    Payment.findOne.mockResolvedValue({ ...__mockPayment, status: "pending" });
    Payment.findOneAndUpdate.mockResolvedValue({
      ...__mockPayment,
      status: "success",
      razorpayPaymentId: paymentId,
    });

    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body).not.toHaveProperty("razorpaySignature");
  });

  it("returns 200 idempotently when already verified", async () => {
    Payment.findOne.mockResolvedValue({ ...__mockPayment, status: "success" });

    const res = await request(app)
      .post("/api/payments/verify")
      .set(USER_HEADERS)
      .send({
        razorpayOrderId: "order_test123",
        razorpayPaymentId: "pay_test123",
        razorpaySignature: "abc123def456abc123def456abc123de",
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });
});

// ─── POST /api/payments/:paymentId/refund ─────────────────────────────────────
describe("POST /api/payments/:paymentId/refund", () => {
  it("returns 403 when headers missing", async () => {
    const res = await request(app)
      .post("/api/payments/PAY-001/refund")
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .post("/api/payments/PAY-001/refund")
      .set(USER_HEADERS)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 404 when payment not found", async () => {
    Payment.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/payments/PAY-NONEXISTENT/refund")
      .set(ADMIN_HEADERS)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
  });

  it("returns 400 when payment is not successful", async () => {
    Payment.findOne.mockResolvedValue({ ...__mockPayment, status: "pending" });
    const res = await request(app)
      .post("/api/payments/PAY-TEST-001/refund")
      .set(ADMIN_HEADERS)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_STATUS");
  });

  it("returns 200 on successful full refund", async () => {
    Payment.findOne.mockResolvedValue({
      ...__mockPayment,
      status: "success",
      razorpayPaymentId: "pay_test123",
    });
    Payment.findOneAndUpdate.mockResolvedValue({
      ...__mockPayment,
      status: "refund_pending",
      razorpayRefundId: "refund_test123",
    });

    const res = await request(app)
      .post("/api/payments/PAY-TEST-001/refund")
      .set(ADMIN_HEADERS)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("refund_pending");
    expect(res.body.razorpayRefundId).toBe("refund_test123");
  });

  it("returns 400 when refund amount exceeds original", async () => {
    Payment.findOne.mockResolvedValue({
      ...__mockPayment,
      status: "success",
      amount: 510,
      razorpayPaymentId: "pay_test123",
    });

    const res = await request(app)
      .post("/api/payments/PAY-TEST-001/refund")
      .set(ADMIN_HEADERS)
      .send({ amount: 1000 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REFUND_EXCEEDS_PAYMENT");
  });
});

// ─── GET /api/payments/booking/:bookingId ─────────────────────────────────────
describe("GET /api/payments/booking/:bookingId", () => {
  it("returns 401 when headers missing", async () => {
    const res = await request(app).get("/api/payments/booking/BKG-001");
    expect(res.status).toBe(401);
  });

  it("returns 404 when payment not found", async () => {
    Payment.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });
    const res = await request(app)
      .get("/api/payments/booking/BKG-NONEXISTENT")
      .set(USER_HEADERS);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PAYMENT_NOT_FOUND");
  });

  it("returns 200 with payment for own booking", async () => {
    Payment.findOne.mockReturnValue({
      sort: jest
        .fn()
        .mockResolvedValue({ ...__mockPayment, userId: "usr-001" }),
    });
    const res = await request(app)
      .get("/api/payments/booking/BKG-001")
      .set(USER_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.paymentId).toBe("PAY-TEST-001");
    expect(res.body).not.toHaveProperty("razorpaySignature");
  });

  it("returns 403 when user tries to see another users payment", async () => {
    Payment.findOne.mockReturnValue({
      sort: jest
        .fn()
        .mockResolvedValue({ ...__mockPayment, userId: "usr-OTHER" }),
    });
    const res = await request(app)
      .get("/api/payments/booking/BKG-001")
      .set(USER_HEADERS);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 200 for admin viewing any payment", async () => {
    Payment.findOne.mockReturnValue({
      sort: jest
        .fn()
        .mockResolvedValue({ ...__mockPayment, userId: "usr-OTHER" }),
    });
    const res = await request(app)
      .get("/api/payments/booking/BKG-001")
      .set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
  });
});

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
describe("POST /api/payments/webhook", () => {
  it("returns 400 when signature header missing", async () => {
    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .send('{"event":"payment.captured"}');
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid webhook signature", async () => {
    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", "invalidsignature")
      .send('{"event":"payment.captured"}');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("returns 200 on valid webhook signature", async () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: { entity: { order_id: "order_test123", id: "pay_test123" } },
      },
    });
    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex");

    Payment.findOneAndUpdate.mockResolvedValue(__mockPayment);

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("x-razorpay-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("payment-service");
    expect(res.body.status).toBe("ok");
  });
});
