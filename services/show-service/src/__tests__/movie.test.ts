import request from "supertest";
import app from "../index";

jest.mock("../models/Movie", () => {
  const mockMovie = {
    movieId: "MOV-001",
    title: "Inception",
    description: "A mind-bending thriller",
    genre: ["Sci-Fi", "Thriller"],
    language: ["English"],
    duration: 148,
    rating: "UA",
    director: "Christopher Nolan",
    releaseDate: new Date("2010-07-16"),
    isActive: true,
  };

  return {
    Movie: {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    },
    __mockMovie: mockMovie,
  };
});

const { Movie, __mockMovie } = require("../models/Movie");

const ADMIN_HEADERS = { "x-user-id": "usr-admin-001", "x-user-role": "admin" };
const USER_HEADERS = { "x-user-id": "usr-001", "x-user-role": "user" };

const VALID_MOVIE = {
  title: "Inception",
  description: "A mind-bending thriller about dreams",
  genre: ["Sci-Fi", "Thriller"],
  language: ["English"],
  duration: 148,
  rating: "UA",
  director: "Christopher Nolan",
  releaseDate: "2010-07-16",
};

beforeEach(() => jest.clearAllMocks());

// ─── POST /api/movies ─────────────────────────────────────────────────────────
describe("POST /api/movies", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .post("/api/movies")
      .set(USER_HEADERS)
      .send(VALID_MOVIE);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 401 when no auth headers", async () => {
    const res = await request(app).post("/api/movies").send(VALID_MOVIE);
    expect(res.status).toBe(401);
  });

  it("returns 422 when title is missing", async () => {
    const { title, ...noTitle } = VALID_MOVIE;
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send(noTitle);
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe("title");
  });

  it("returns 422 when genre is empty array", async () => {
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_MOVIE, genre: [] });
    expect(res.status).toBe(422);
  });

  it("returns 422 when rating is invalid", async () => {
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_MOVIE, rating: "X" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when duration is zero", async () => {
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_MOVIE, duration: 0 });
    expect(res.status).toBe(422);
  });

  it("returns 422 when releaseDate is invalid", async () => {
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send({ ...VALID_MOVIE, releaseDate: "not-a-date" });
    expect(res.status).toBe(422);
  });

  it("returns 201 on successful creation", async () => {
    Movie.create.mockResolvedValue(__mockMovie);
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send(VALID_MOVIE);
    expect(res.status).toBe(201);
    expect(res.body.movieId).toBe("MOV-001");
    expect(res.body.title).toBe("Inception");
  });

  it("returns 409 when movie already exists", async () => {
    Movie.create.mockRejectedValue({ code: 11000 });
    const res = await request(app)
      .post("/api/movies")
      .set(ADMIN_HEADERS)
      .send(VALID_MOVIE);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("MOVIE_EXISTS");
  });
});

// ─── GET /api/movies ──────────────────────────────────────────────────────────
describe("GET /api/movies", () => {
  it("returns 200 with paginated movies", async () => {
    Movie.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([__mockMovie]),
    });
    Movie.countDocuments.mockResolvedValue(1);

    const res = await request(app).get("/api/movies");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1); // not pagination.total
    expect(res.body.pages).toBeDefined(); // not pagination.pages
    expect(res.body.page).toBe(1);
  });

  it("returns 200 with empty array when no movies", async () => {
    Movie.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    Movie.countDocuments.mockResolvedValue(0);

    const res = await request(app).get("/api/movies");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ─── GET /api/movies/:movieId ─────────────────────────────────────────────────
describe("GET /api/movies/:movieId", () => {
  it("returns 200 with movie", async () => {
    Movie.findOne.mockResolvedValue(__mockMovie);
    const res = await request(app).get("/api/movies/MOV-001");
    expect(res.status).toBe(200);
    expect(res.body.movieId).toBe("MOV-001");
  });

  it("returns 404 when movie not found", async () => {
    Movie.findOne.mockResolvedValue(null);
    const res = await request(app).get("/api/movies/MOV-NONEXISTENT");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MOVIE_NOT_FOUND");
  });
});

// ─── PATCH /api/movies/:movieId ───────────────────────────────────────────────
describe("PATCH /api/movies/:movieId", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .patch("/api/movies/MOV-001")
      .set(USER_HEADERS)
      .send({ title: "New Title" });
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful update", async () => {
    Movie.findOneAndUpdate.mockResolvedValue({
      ...__mockMovie,
      title: "Updated Title",
    });
    const res = await request(app)
      .patch("/api/movies/MOV-001")
      .set(ADMIN_HEADERS)
      .send({ title: "Updated Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Title");
  });

  it("returns 404 when movie not found", async () => {
    Movie.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/movies/MOV-NONEXISTENT")
      .set(ADMIN_HEADERS)
      .send({ title: "Updated Title" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MOVIE_NOT_FOUND");
  });

  it("returns 400 when no valid fields provided", async () => {
    const { AppError } = require("../middleware/errorHandler");
    jest
      .spyOn(require("../services/movieService").movieService, "update")
      .mockRejectedValue(
        new AppError(400, "No valid fields to update", "NO_UPDATES"),
      );

    const res = await request(app)
      .patch("/api/movies/MOV-001")
      .set(ADMIN_HEADERS)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_UPDATES");
  });
});

// ─── DELETE /api/movies/:movieId ──────────────────────────────────────────────
describe("DELETE /api/movies/:movieId", () => {
  it("returns 403 when user is not admin", async () => {
    const res = await request(app)
      .delete("/api/movies/MOV-001")
      .set(USER_HEADERS);
    expect(res.status).toBe(403);
  });

  it("returns 200 on successful deactivation", async () => {
    Movie.findOneAndUpdate.mockResolvedValue(__mockMovie);
    const res = await request(app)
      .delete("/api/movies/MOV-001")
      .set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.movieId).toBe("MOV-001");
  });

  it("returns 404 when movie not found", async () => {
    Movie.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .delete("/api/movies/MOV-NONEXISTENT")
      .set(ADMIN_HEADERS);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MOVIE_NOT_FOUND");
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("show-service");
  });
});
