import request from "supertest";
import app from "../index";

jest.mock("../models/Theatre", () => {
  const mockTheatre = {
    theatreId: "THR-001",
    name: "PVR Cinemas",
    city: "Mumbai",
    address: "123 Main Street",
    pincode: "400001",
    screens: [],
    amenities: ["Parking", "Food Court"],
    isActive: true,
  };

  return {
    Theatre: {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
    },
    __mockTheatre: mockTheatre,
  };
});

const { Theatre, __mockTheatre } = require("../models/Theatre");

const ADMIN_HEADERS = { "x-user-id": "usr-admin-001", "x-user-role": "admin" };
const USER_HEADERS = { "x-user-id": "usr-001", "x-user-role": "user" };

const VALID_THEATRE = {
  name: "PVR Cinemas",
  city: "Mumbai",
  address: "123 Main Street",
  pincode: "400001",
  screens: [
    {
      name: "Screen 1",
      totalSeats: 4,
      formats: ["2D"],
      rows: [
        { row: "A", count: 2, type: "standard" },
        { row: "B", count: 2, type: "premium" },
      ],
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /api/theatres ───────────────────────────────────────────────────────
describe("POST /api/theatres", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .post("/api/theatres")
      .set(USER_HEADERS)
      .send(VALID_THEATRE);
    expect(res.status).toBe(403);
  });

  it("returns 401 when no auth headers", async () => {
    const res = await request(app).post("/api/theatres").send(VALID_THEATRE);
    expect(res.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    const { name, ...noName } = VALID_THEATRE;
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send(noName);
    expect(res.status).toBe(422);
  });

  it("returns 422 when pincode is invalid", async () => {
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_THEATRE, pincode: "12345" }); // 5 digits not 6
    expect(res.status).toBe(422);
  });

  it("returns 422 when screens is empty", async () => {
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_THEATRE, screens: [] });
    expect(res.status).toBe(422);
  });

  it("returns 422 when screen format is invalid", async () => {
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send({
        ...VALID_THEATRE,
        screens: [{ ...VALID_THEATRE.screens[0], formats: ["8D"] }],
      });
    expect(res.status).toBe(422);
  });

  it("returns 201 on successful creation", async () => {
    Theatre.create.mockResolvedValue(__mockTheatre);
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send(VALID_THEATRE);
    expect(res.status).toBe(201);
    expect(res.body.theatreId).toBe("THR-001");
    expect(res.body.name).toBe("PVR Cinemas");
  });

  it("returns 409 when theatre already exists", async () => {
    Theatre.create.mockRejectedValue({ code: 11000 });
    const res = await request(app)
      .post("/api/theatres")
      .set(ADMIN_HEADERS)
      .send(VALID_THEATRE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("THEATRE_EXISTS");
  });
});

// ─── GET /api/theatres ────────────────────────────────────────────────────────
describe("GET /api/theatres", () => {
  it("returns 400 when city param is missing", async () => {
    const res = await request(app).get("/api/theatres");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_PARAM");
  });

  it("returns 200 with theatres for city", async () => {
    Theatre.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([__mockTheatre]),
    });
    const res = await request(app).get("/api/theatres?city=Mumbai");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].theatreId).toBe("THR-001");
  });

  it("returns 200 with empty array when no theatres in city", async () => {
    Theatre.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    const res = await request(app).get("/api/theatres?city=Nowhere");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ─── GET /api/theatres/:theatreId ─────────────────────────────────────────────
describe("GET /api/theatres/:theatreId", () => {
  it("returns 200 with theatre", async () => {
    Theatre.findOne.mockResolvedValue(__mockTheatre);
    const res = await request(app).get("/api/theatres/THR-001");
    expect(res.status).toBe(200);
    expect(res.body.theatreId).toBe("THR-001");
  });

  it("returns 404 when theatre not found", async () => {
    Theatre.findOne.mockResolvedValue(null);
    const res = await request(app).get("/api/theatres/THR-NONEXISTENT");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("THEATRE_NOT_FOUND");
  });
});

// ─── PATCH /api/theatres/:theatreId ──────────────────────────────────────────
describe("PATCH /api/theatres/:theatreId", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .patch("/api/theatres/THR-001")
      .set(USER_HEADERS)
      .send({ name: "New Name" });
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful update", async () => {
    Theatre.findOneAndUpdate.mockResolvedValue({
      ...__mockTheatre,
      name: "INOX Cinemas",
    });
    const res = await request(app)
      .patch("/api/theatres/THR-001")
      .set(ADMIN_HEADERS)
      .send({ name: "INOX Cinemas" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("INOX Cinemas");
  });

  it("returns 404 when theatre not found", async () => {
    Theatre.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/theatres/THR-NONEXISTENT")
      .set(ADMIN_HEADERS)
      .send({ name: "New Name" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("THEATRE_NOT_FOUND");
  });
});
