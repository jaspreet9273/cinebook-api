import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { showService } from "../services/show";

// ─── Validation ───────────────────────────────────────────────────────────────
export const createShowValidation = [
  body("movieId").notEmpty().withMessage("movieId required").isString(),
  body("theatreId").notEmpty().withMessage("theatreId required").isString(),
  body("screenId").notEmpty().withMessage("screenId required").isString(),
  body("showTime").isISO8601().withMessage("showTime must be a valid ISO date"),
  body("language").trim().notEmpty().withMessage("language required"),
  body("format")
    .isIn(["2D", "3D", "IMAX", "4DX"])
    .withMessage("format must be 2D, 3D, IMAX or 4DX"),
  body("pricing").isObject().withMessage("pricing required"),
  body("pricing.standard")
    .isFloat({ min: 0 })
    .withMessage("pricing.standard must be >= 0"),
  body("pricing.premium")
    .isFloat({ min: 0 })
    .withMessage("pricing.premium must be >= 0"),
  body("pricing.recliner")
    .isFloat({ min: 0 })
    .withMessage("pricing.recliner must be >= 0"),
  body("pricing.couple")
    .isFloat({ min: 0 })
    .withMessage("pricing.couple must be >= 0"),
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
export class ShowController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      // Whitelist fields
      const {
        movieId,
        theatreId,
        screenId,
        showTime,
        language,
        format,
        pricing,
      } = req.body;
      const show = await showService.create({
        movieId,
        theatreId,
        screenId,
        showTime,
        language,
        format,
        pricing,
      });
      res.status(201).json(show);
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shows = await showService.list({
        movieId: req.query.movieId as string | undefined,
        theatreId: req.query.theatreId as string | undefined,
        city: req.query.city as string | undefined,
        date: req.query.date as string | undefined,
        language: req.query.language as string | undefined,
        format: req.query.format as string | undefined,
      });
      res.json(shows);
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
      const show = await showService.getById(req.params.showId);
      res.json(show);
    } catch (err) {
      next(err);
    }
  }

  async getSeats(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const seats = await showService.getSeats(req.params.showId);
      res.json(seats);
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
      await showService.deactivate(req.params.showId);
      res.json({ message: "Show deactivated", showId: req.params.showId });
    } catch (err) {
      next(err);
    }
  }
}

export const showController = new ShowController();
