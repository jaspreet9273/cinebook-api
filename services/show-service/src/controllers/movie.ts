import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { movieService } from "../services/movie";

// ─── Validation ───────────────────────────────────────────────────────────────
export const createMovieValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title required")
    .isLength({ max: 200 }),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description required")
    .isLength({ max: 2000 }),
  body("genre").isArray({ min: 1 }).withMessage("At least one genre required"),
  body("genre.*").isString().trim().notEmpty(),
  body("language")
    .isArray({ min: 1 })
    .withMessage("At least one language required"),
  body("language.*").isString().trim().notEmpty(),
  body("duration")
    .isInt({ min: 1, max: 600 })
    .withMessage("Duration must be 1-600 minutes"),
  body("rating")
    .isIn(["U", "UA", "A", "S"])
    .withMessage("Rating must be U, UA, A or S"),
  body("director")
    .trim()
    .notEmpty()
    .withMessage("Director required")
    .isLength({ max: 200 }),
  body("releaseDate").isISO8601().withMessage("releaseDate must be ISO date"),
  body("posterUrl")
    .optional()
    .isURL()
    .withMessage("posterUrl must be a valid URL"),
  body("trailerUrl")
    .optional()
    .isURL()
    .withMessage("trailerUrl must be a valid URL"),
  body("cast").optional().isArray(),
  body("cast.*").optional().isString().trim().notEmpty(),
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
export class MovieController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      // Whitelist fields
      const {
        title,
        description,
        genre,
        language,
        duration,
        rating,
        director,
        releaseDate,
        posterUrl,
        trailerUrl,
        cast,
      } = req.body;

      const movie = await movieService.create({
        title,
        description,
        genre,
        language,
        duration,
        rating,
        director,
        releaseDate,
        posterUrl,
        trailerUrl,
        cast,
      });
      res.status(201).json(movie);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await movieService.list({
        search: (req.query.search as string)?.trim() || undefined,
        genre: (req.query.genre as string)?.trim() || undefined,
        language: (req.query.language as string)?.trim() || undefined,
        page: req.query.page
          ? Math.max(1, parseInt(req.query.page as string))
          : undefined,
        limit: req.query.limit
          ? Math.max(1, parseInt(req.query.limit as string))
          : undefined,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const movie = await movieService.getById(req.params.movieId);
      res.json(movie);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Whitelist updatable fields — never allow movieId, isActive etc.
      const {
        title,
        description,
        genre,
        language,
        duration,
        rating,
        director,
        releaseDate,
        posterUrl,
        trailerUrl,
        cast,
      } = req.body;

      const movie = await movieService.update(req.params.movieId, {
        title,
        description,
        genre,
        language,
        duration,
        rating,
        director,
        releaseDate,
        posterUrl,
        trailerUrl,
        cast,
      });
      res.json(movie);
    } catch (err) {
      next(err);
    }
  }

  async deactivate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await movieService.deactivate(req.params.movieId);
      res.json({ message: "Movie deactivated", movieId: req.params.movieId });
    } catch (err) {
      next(err);
    }
  }
}

export const movieController = new MovieController();
