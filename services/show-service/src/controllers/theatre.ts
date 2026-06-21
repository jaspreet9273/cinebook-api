import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { theatreService } from "../services/theatre";

// ─── Validation ───────────────────────────────────────────────────────────────
export const createTheatreValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name required")
    .isLength({ max: 200 }),
  body("city")
    .trim()
    .notEmpty()
    .withMessage("City required")
    .isLength({ max: 100 }),
  body("address")
    .trim()
    .notEmpty()
    .withMessage("Address required")
    .isLength({ max: 500 }),
  body("pincode")
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("Pincode must be 6 digits"),
  body("screens")
    .isArray({ min: 1 })
    .withMessage("At least one screen required"),
  body("screens.*.name").trim().notEmpty().withMessage("Screen name required"),
  body("screens.*.totalSeats")
    .isInt({ min: 1, max: 1000 })
    .withMessage("totalSeats must be 1-1000"),
  body("screens.*.formats")
    .isArray({ min: 1 })
    .withMessage("At least one format required"),
  body("screens.*.formats.*")
    .isIn(["2D", "3D", "IMAX", "4DX"])
    .withMessage("Invalid format"),
  body("screens.*.rows")
    .isArray({ min: 1 })
    .withMessage("At least one row required"),
  body("screens.*.rows.*.row")
    .trim()
    .notEmpty()
    .withMessage("Row name required"),
  body("screens.*.rows.*.count")
    .isInt({ min: 1, max: 50 })
    .withMessage("Row count must be 1-50"),
  body("screens.*.rows.*.type")
    .isIn(["standard", "premium", "recliner", "couple"])
    .withMessage("Invalid seat type"),
  body("amenities").optional().isArray(),
  body("amenities.*").optional().isString().trim().notEmpty(),
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
export class TheatreController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = formatErrors(req);
      if (errors.length) {
        res.status(422).json({ errors });
        return;
      }

      // Whitelist fields
      const { name, city, address, pincode, amenities, screens } = req.body;
      const theatre = await theatreService.create({
        name,
        city,
        address,
        pincode,
        amenities,
        screens,
      });
      res.status(201).json(theatre);
    } catch (err) {
      next(err);
    }
  }

  async listByCity(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const city = (req.query.city as string)?.trim();
      if (!city) {
        res
          .status(400)
          .json({ error: "city query param required", code: "MISSING_PARAM" });
        return;
      }
      const theatres = await theatreService.listByCity(city);
      res.json(theatres);
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
      const theatre = await theatreService.getById(req.params.theatreId);
      res.json(theatre);
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Whitelist — screens cannot be updated via this endpoint
      const { name, city, address, pincode, amenities } = req.body;
      const theatre = await theatreService.update(req.params.theatreId, {
        name,
        city,
        address,
        pincode,
        amenities,
      });
      res.json(theatre);
    } catch (err) {
      next(err);
    }
  }
}

export const theatreController = new TheatreController();
