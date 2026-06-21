import request from "supertest";
import app from "../index";

jest.mock("../models/Show", () => {
  const mockShow = {
    showId: "SHOW-001",
    movieId: "MOV-001",
    theatreId: "THR-001",
    screenId: "SCR-001",
    showTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    language: "English",
    format: "2D",
    totalSeats: 100,
    availableSeats: 98,
    seats: [],
    pricing: { standard: 200, premium: 350, recliner: 500, couple: 600 },
    isActive: true,
    seatVersion: 0,
  };

  return {
    Show: {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
    },
    __mockShow: mockShow,
  };
});

jest.mock("../models/Movie", () => ({
  Movie: { findOne: jest.fn() },
}));

jest.mock("../models/Theatre", () => ({
  Theatre: { findOne: jest.fn(), find: jest.fn() },
}));

const { Show, __mockShow } = require("../models/Show");
const { Movie } = require("../models/Movie");
const { Theatre } = require("../models/Theatre");

const ADMIN_HEADERS = { "x-user-id": "usr-admin-001", "x-user-role": "admin" };
const USER_HEADERS = { "x-user-id": "usr-001", "x-user-role": "user" };

const VALID_SHOW = {
  movieId: "MOV-001",
  theatreId: "THR-001",
  screenId: "SCR-001",
  showTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  language: "English",
  format: "2D",
  pricing: { standard: 200, premium: 350, recliner: 500, couple: 600 },
};

const MOCK_MOVIE = {
  movieId: "MOV-001",
  duration: 148,
  isActive: true,
};

const MOCK_THEATRE = {
  theatreId: "THR-001",
  isActive: true,
  screens: [
    {
      screenId: "SCR-001",
      formats: ["2D"],
      seatLayout: [
        {
          row: "A",
          seats: [
            {
              seatId: "SCR-001-A1",
              number: 1,
              type: "standard",
              isActive: true,
            },
            {
              seatId: "SCR-001-A2",
              number: 2,
              type: "standard",
              isActive: true,
            },
          ],
        },
      ],
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /api/shows ──────────────────────────────────────────────────────────
describe("POST /api/shows", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .post("/api/shows")
      .set(USER_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(403);
  });

  it("returns 401 when no auth headers", async () => {
    const res = await request(app).post("/api/shows").send(VALID_SHOW);
    expect(res.status).toBe(401);
  });

  it("returns 422 when movieId is missing", async () => {
    const { movieId, ...noMovieId } = VALID_SHOW;
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(noMovieId);
    expect(res.status).toBe(422);
  });

  it("returns 422 when format is invalid", async () => {
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_SHOW, format: "8D" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when pricing is missing", async () => {
    const { pricing, ...noPricing } = VALID_SHOW;
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(noPricing);
    expect(res.status).toBe(422);
  });

  it("returns 201 on successful creation", async () => {
    Movie.findOne.mockResolvedValue(MOCK_MOVIE);
    Theatre.findOne.mockResolvedValue(MOCK_THEATRE);
    Show.findOne.mockResolvedValue(null); // no overlap
    Show.create.mockResolvedValue(__mockShow);

    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(201);
    expect(res.body.showId).toBe("SHOW-001");
  });

  it("returns 404 when movie not found", async () => {
    Movie.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MOVIE_NOT_FOUND");
  });

  it("returns 404 when theatre not found", async () => {
    Movie.findOne.mockResolvedValue(MOCK_MOVIE);
    Theatre.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("THEATRE_NOT_FOUND");
  });

  it("returns 404 when screen not found", async () => {
    Movie.findOne.mockResolvedValue(MOCK_MOVIE);
    Theatre.findOne.mockResolvedValue({ ...MOCK_THEATRE, screens: [] }); // no screens
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SCREEN_NOT_FOUND");
  });

  it("returns 409 when show overlaps", async () => {
    Movie.findOne.mockResolvedValue(MOCK_MOVIE);
    Theatre.findOne.mockResolvedValue(MOCK_THEATRE);
    Show.findOne.mockResolvedValue(__mockShow); // overlap exists
    const res = await request(app)
      .post("/api/shows")
      .set(ADMIN_HEADERS)
      .send(VALID_SHOW);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SHOW_OVERLAP");
  });
});

// ─── GET /api/shows ───────────────────────────────────────────────────────────
describe("GET /api/shows", () => {
  it("returns 200 with shows list", async () => {
    Show.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([__mockShow]),
    });

    const res = await request(app).get("/api/shows?movieId=MOV-001");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 200 with empty array when no shows", async () => {
    Show.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const res = await request(app).get("/api/shows");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("returns 400 when date is invalid", async () => {
    const res = await request(app).get("/api/shows?date=not-a-date");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_DATE");
  });
});

// ─── GET /api/shows/:showId ───────────────────────────────────────────────────
describe("GET /api/shows/:showId", () => {
  it("returns 200 with show", async () => {
    Show.findOne.mockResolvedValue(__mockShow);
    const res = await request(app).get("/api/shows/SHOW-001");
    expect(res.status).toBe(200);
    expect(res.body.showId).toBe("SHOW-001");
  });

  it("returns 404 when show not found", async () => {
    Show.findOne.mockResolvedValue(null);
    const res = await request(app).get("/api/shows/SHOW-NONEXISTENT");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SHOW_NOT_FOUND");
  });
});

// ─── GET /api/shows/:showId/seats ─────────────────────────────────────────────
describe("GET /api/shows/:showId/seats", () => {
  it("returns 200 with seat layout", async () => {
    Show.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        showId: "SHOW-001",
        availableSeats: 98,
        seats: [{ seatId: "SCR-001-A1", status: "available" }],
      }),
    });

    const res = await request(app).get("/api/shows/SHOW-001/seats");
    expect(res.status).toBe(200);
    expect(res.body.showId).toBe("SHOW-001");
    expect(res.body.availableSeats).toBe(98);
    expect(res.body.seats).toBeDefined();
  });

  it("returns 404 when show not found", async () => {
    Show.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app).get("/api/shows/SHOW-NONEXISTENT/seats");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SHOW_NOT_FOUND");
  });
});

// ─── DELETE /api/shows/:showId ────────────────────────────────────────────────
describe("DELETE /api/shows/:showId", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .delete("/api/shows/SHOW-001")
      .set(USER_HEADERS);
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful deactivation", async () => {
    Show.findOneAndUpdate.mockResolvedValue(__mockShow);
    const res = await request(app)
      .delete("/api/shows/SHOW-001")
      .set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.showId).toBe("SHOW-001");
  });

  it("returns 404 when show not found", async () => {
    Show.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/shows/SHOW-NONEXISTENT")
      .set(ADMIN_HEADERS);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SHOW_NOT_FOUND");
  });
});
