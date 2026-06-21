import { v4 as uuidv4 } from "uuid";
import { Show, IShow } from "../models/show";
import { Theatre } from "../models/theatre";
import { Movie } from "../models/movie";
import { AppError } from "../middleware/error-handler";
import { logger } from "../config/logger";

interface CreateShowInput {
  movieId: string;
  theatreId: string;
  screenId: string;
  showTime: string;
  language: string;
  format: "2D" | "3D" | "IMAX" | "4DX";
  pricing: {
    standard: number;
    premium: number;
    recliner: number;
    couple: number;
  };
}

interface ListShowsQuery {
  movieId?: string;
  theatreId?: string;
  city?: string;
  date?: string;
  language?: string;
  format?: string;
}

class ShowService {
  async create(input: CreateShowInput): Promise<IShow> {
    const showTime = new Date(input.showTime);
    if (isNaN(showTime.getTime())) {
      throw new AppError(400, "Invalid showTime format", "INVALID_SHOW_TIME");
    }
    if (showTime <= new Date()) {
      throw new AppError(
        400,
        "Show time must be in the future",
        "SHOW_TIME_IN_PAST",
      );
    }

    // Validate movie
    const movie = await Movie.findOne({
      movieId: input.movieId,
      isActive: true,
    });
    if (!movie) throw new AppError(404, "Movie not found", "MOVIE_NOT_FOUND");

    // Validate theatre + screen
    const theatre = await Theatre.findOne({
      theatreId: input.theatreId,
      isActive: true,
    });
    if (!theatre)
      throw new AppError(404, "Theatre not found", "THEATRE_NOT_FOUND");

    const screen = theatre.screens.find((s) => s.screenId === input.screenId);
    if (!screen)
      throw new AppError(404, "Screen not found", "SCREEN_NOT_FOUND");

    if (!screen.formats.includes(input.format)) {
      throw new AppError(
        400,
        `Screen does not support ${input.format}`,
        "FORMAT_NOT_SUPPORTED",
      );
    }

    // Overlap check: movie duration + 30min buffer
    // A conflict exists if any existing show's window overlaps our window
    // Existing show window: [existingStart, existingStart + duration + 30min)
    // Our window:           [showTime,       showTime + duration + 30min)
    // Conflict if: existingStart < ourEnd AND existingEnd > ourStart
    const durationMs = (movie.duration + 30) * 60 * 1000;
    const endTime = new Date(showTime.getTime() + durationMs);

    const overlap = await Show.findOne({
      theatreId: input.theatreId,
      screenId: input.screenId,
      isActive: true,
      $or: [
        // Existing show starts during our window
        { showTime: { $gte: showTime, $lt: endTime } },
        // Existing show started before us but ends after we start
        {
          showTime: {
            $lt: showTime,
            $gt: new Date(showTime.getTime() - durationMs),
          },
        },
      ],
    });

    if (overlap) {
      throw new AppError(
        409,
        "Another show overlaps this time slot",
        "SHOW_OVERLAP",
      );
    }

    // Build seat list from theatre layout
    const seats = screen.seatLayout.flatMap((row) =>
      row.seats
        .filter((s) => s.isActive)
        .map((s) => ({
          seatId: s.seatId,
          row: row.row,
          number: s.number,
          type: s.type,
          price: input.pricing[s.type],
          status: "available" as const,
        })),
    );

    if (seats.length === 0) {
      throw new AppError(400, "Screen has no active seats", "NO_ACTIVE_SEATS");
    }

    const show = await Show.create({
      showId: `SHOW-${uuidv4().slice(0, 8).toUpperCase()}`,
      movieId: input.movieId,
      theatreId: input.theatreId,
      screenId: input.screenId,
      showTime,
      language: input.language,
      format: input.format,
      totalSeats: seats.length,
      availableSeats: seats.length,
      seats,
      pricing: input.pricing,
      seatVersion: 0,
    });

    logger.info("Show created", {
      showId: show.showId,
      movieId: input.movieId,
      theatreId: input.theatreId,
      showTime: showTime.toISOString(),
    });

    return show;
  }

  async list(query: ListShowsQuery): Promise<IShow[]> {
    const filter: any = { isActive: true };

    if (query.movieId) filter.movieId = query.movieId;
    if (query.theatreId) filter.theatreId = query.theatreId;
    if (query.language) filter.language = query.language;
    if (query.format) filter.format = query.format;

    // City filter — requires a lookup through Theatre
    // For now filter by theatreId if city is provided
    if (query.city && !query.theatreId) {
      const theatres = await Theatre.find({
        city: { $regex: query.city, $options: "i" },
        isActive: true,
      })
        .select("theatreId")
        .lean();

      filter.theatreId = { $in: theatres.map((t) => t.theatreId) };
    }

    if (query.date) {
      const start = new Date(query.date);
      if (isNaN(start.getTime())) {
        throw new AppError(
          400,
          "Invalid date format. Use YYYY-MM-DD",
          "INVALID_DATE",
        );
      }
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.showTime = { $gte: start, $lt: end };
    } else {
      filter.showTime = { $gte: new Date() };
    }

    return Show.find(filter)
      .sort({ showTime: 1 })
      .select("-seats") // seats returned via getSeats endpoint only
      .lean() as unknown as IShow[];
  }

  async getById(showId: string): Promise<IShow> {
    const show = await Show.findOne({ showId, isActive: true });
    if (!show) throw new AppError(404, "Show not found", "SHOW_NOT_FOUND");
    return show;
  }

  async getSeats(showId: string): Promise<{
    showId: string;
    seats: IShow["seats"];
    availableSeats: number;
  }> {
    const show = await Show.findOne({ showId, isActive: true }).select(
      "showId seats availableSeats",
    );
    if (!show) throw new AppError(404, "Show not found", "SHOW_NOT_FOUND");

    return {
      showId: show.showId,
      availableSeats: show.availableSeats,
      seats: show.seats,
    };
  }

  async deactivate(showId: string): Promise<void> {
    const result = await Show.findOneAndUpdate({ showId }, { isActive: false });
    if (!result) throw new AppError(404, "Show not found", "SHOW_NOT_FOUND");
    logger.info("Show deactivated", { showId });
  }
}

export const showService = new ShowService();
