import { v4 as uuidv4 } from "uuid";
import { Movie, IMovie } from "../models/movie";
import { AppError } from "../middleware/error-handler";
import { logger } from "../config/logger";

interface CreateMovieInput {
  title: string;
  description: string;
  genre: string[];
  language: string[];
  duration: number;
  rating: "U" | "UA" | "A" | "S";
  cast?: string[];
  director: string;
  releaseDate: string;
  posterUrl?: string;
  trailerUrl?: string;
}

interface UpdateMovieInput {
  title?: string;
  description?: string;
  genre?: string[];
  language?: string[];
  duration?: number;
  rating?: "U" | "UA" | "A" | "S";
  cast?: string[];
  director?: string;
  releaseDate?: string;
  posterUrl?: string;
  trailerUrl?: string;
}

interface ListMoviesQuery {
  genre?: string;
  language?: string;
  search?: string;
  page?: number;
  limit?: number;
}

class MovieService {
  async create(input: CreateMovieInput): Promise<IMovie> {
    try {
      const movie = await Movie.create({
        movieId: `MOV-${uuidv4().slice(0, 8).toUpperCase()}`,
        title: input.title,
        description: input.description,
        genre: input.genre,
        language: input.language,
        duration: input.duration,
        rating: input.rating,
        cast: input.cast ?? [],
        director: input.director,
        releaseDate: new Date(input.releaseDate),
        posterUrl: input.posterUrl,
        trailerUrl: input.trailerUrl,
      });

      logger.info("Movie created", {
        movieId: movie.movieId,
        title: movie.title,
      });
      return movie;
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError(409, "Movie already exists", "MOVIE_EXISTS");
      }
      throw err;
    }
  }

  async list(
    query: ListMoviesQuery,
  ): Promise<{ data: IMovie[]; total: number; page: number; pages: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const filter: any = { isActive: true };

    if (query.genre) filter.genre = { $in: [query.genre] };
    if (query.language) filter.language = { $in: [query.language] };
    if (query.search) filter.$text = { $search: query.search };

    try {
      const [data, total] = await Promise.all([
        Movie.find(filter)
          .sort(
            query.search
              ? { score: { $meta: "textScore" } }
              : { releaseDate: -1 },
          )
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Movie.countDocuments(filter),
      ]);

      return {
        data: data as unknown as IMovie[],
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    } catch (err: any) {
      // Text index may not exist yet in dev — fall back to title regex search
      if (err.code === 27 && query.search) {
        filter.$text = undefined;
        filter.title = { $regex: query.search, $options: "i" };
        const [data, total] = await Promise.all([
          Movie.find(filter)
            .sort({ releaseDate: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
          Movie.countDocuments(filter),
        ]);
        return {
          data: data as unknown as IMovie[],
          total,
          page,
          pages: Math.ceil(total / limit),
        };
      }
      throw err;
    }
  }

  async getById(movieId: string): Promise<IMovie> {
    const movie = await Movie.findOne({ movieId, isActive: true });
    if (!movie) throw new AppError(404, "Movie not found", "MOVIE_NOT_FOUND");
    return movie;
  }

  async update(movieId: string, updates: UpdateMovieInput): Promise<IMovie> {
    // Whitelist — only allow these fields to be updated
    const allowedUpdates: Record<string, any> = {};
    if (updates.title !== undefined)
      allowedUpdates.title = updates.title.trim();
    if (updates.description !== undefined)
      allowedUpdates.description = updates.description;
    if (updates.genre !== undefined) allowedUpdates.genre = updates.genre;
    if (updates.language !== undefined)
      allowedUpdates.language = updates.language;
    if (updates.duration !== undefined)
      allowedUpdates.duration = updates.duration;
    if (updates.rating !== undefined) allowedUpdates.rating = updates.rating;
    if (updates.cast !== undefined) allowedUpdates.cast = updates.cast;
    if (updates.director !== undefined)
      allowedUpdates.director = updates.director;
    if (updates.posterUrl !== undefined)
      allowedUpdates.posterUrl = updates.posterUrl;
    if (updates.trailerUrl !== undefined)
      allowedUpdates.trailerUrl = updates.trailerUrl;
    if (updates.releaseDate !== undefined)
      allowedUpdates.releaseDate = new Date(updates.releaseDate);

    if (Object.keys(allowedUpdates).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_UPDATES");
    }

    const movie = await Movie.findOneAndUpdate(
      { movieId },
      { $set: allowedUpdates },
      { new: true, runValidators: true },
    );
    if (!movie) throw new AppError(404, "Movie not found", "MOVIE_NOT_FOUND");

    logger.info("Movie updated", {
      movieId,
      fields: Object.keys(allowedUpdates),
    });
    return movie;
  }

  async deactivate(movieId: string): Promise<void> {
    const result = await Movie.findOneAndUpdate(
      { movieId },
      { isActive: false },
    );
    if (!result) throw new AppError(404, "Movie not found", "MOVIE_NOT_FOUND");
    logger.info("Movie deactivated", { movieId });
  }
}

export const movieService = new MovieService();
