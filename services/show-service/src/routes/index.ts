import { Router, Request, Response, NextFunction } from "express";
import { movieController, createMovieValidation } from "../controllers/movie";
import {
  theatreController,
  createTheatreValidation,
} from "../controllers/theatre";
import { showController, createShowValidation } from "../controllers/show";
import { requireAdmin } from "../middleware/require-admin";

export const movieRouter = Router();
export const theatreRouter = Router();
export const showRouter = Router();

// ── Movies ────────────────────────────────────────────────────────────────────
movieRouter.get("/", (req: Request, res: Response, next: NextFunction) =>
  movieController.list(req, res, next),
);
movieRouter.get(
  "/:movieId",
  (req: Request, res: Response, next: NextFunction) =>
    movieController.getById(req, res, next),
);
movieRouter.post(
  "/",
  requireAdmin,
  createMovieValidation,
  (req: Request, res: Response, next: NextFunction) =>
    movieController.create(req, res, next),
);
movieRouter.patch(
  "/:movieId",
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) =>
    movieController.update(req, res, next),
);
movieRouter.delete(
  "/:movieId",
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) =>
    movieController.deactivate(req, res, next),
);

// ── Theatres ──────────────────────────────────────────────────────────────────
theatreRouter.get("/", (req: Request, res: Response, next: NextFunction) =>
  theatreController.listByCity(req, res, next),
);
theatreRouter.get(
  "/:theatreId",
  (req: Request, res: Response, next: NextFunction) =>
    theatreController.getById(req, res, next),
);
theatreRouter.post(
  "/",
  requireAdmin,
  createTheatreValidation,
  (req: Request, res: Response, next: NextFunction) =>
    theatreController.create(req, res, next),
);
theatreRouter.patch(
  "/:theatreId",
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) =>
    theatreController.update(req, res, next),
);

// ── Shows ─────────────────────────────────────────────────────────────────────
showRouter.get("/", (req: Request, res: Response, next: NextFunction) =>
  showController.list(req, res, next),
);
showRouter.get("/:showId", (req: Request, res: Response, next: NextFunction) =>
  showController.getById(req, res, next),
);
showRouter.get(
  "/:showId/seats",
  (req: Request, res: Response, next: NextFunction) =>
    showController.getSeats(req, res, next),
);
showRouter.post(
  "/",
  requireAdmin,
  createShowValidation,
  (req: Request, res: Response, next: NextFunction) =>
    showController.create(req, res, next),
);
showRouter.delete(
  "/:showId",
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) =>
    showController.deactivate(req, res, next),
);
