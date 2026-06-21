import { v4 as uuidv4 } from "uuid";
import { Theatre, ITheatre, IScreen } from "../models/theatre";
import { AppError } from "../middleware/error-handler";
import { logger } from "../config/logger";

interface CreateTheatreInput {
  name: string;
  city: string;
  address: string;
  pincode: string;
  amenities?: string[];
  screens: Array<{
    name: string;
    totalSeats: number;
    formats: ("2D" | "3D" | "IMAX" | "4DX")[];
    rows: Array<{
      row: string;
      count: number;
      type: "standard" | "premium" | "recliner" | "couple";
    }>;
  }>;
}

interface UpdateTheatreInput {
  name?: string;
  city?: string;
  address?: string;
  pincode?: string;
  amenities?: string[];
}

class TheatreService {
  async create(input: CreateTheatreInput): Promise<ITheatre> {
    const screens: IScreen[] = input.screens.map((s) => {
      const screenId = `SCR-${uuidv4().slice(0, 8).toUpperCase()}`;

      const seatLayout = s.rows.map((r) => ({
        row: r.row.toUpperCase(),
        seats: Array.from({ length: r.count }, (_, i) => ({
          seatId: `${screenId}-${r.row.toUpperCase()}${i + 1}`, // include screenId to prevent cross-screen collisions
          number: i + 1,
          type: r.type,
          isActive: true,
        })),
      }));

      // Validate totalSeats matches actual seat count
      const actualSeats = s.rows.reduce((sum, r) => sum + r.count, 0);
      if (actualSeats !== s.totalSeats) {
        throw new AppError(
          400,
          `Screen "${s.name}": totalSeats (${s.totalSeats}) does not match actual seat count (${actualSeats})`,
          "SEAT_COUNT_MISMATCH",
        );
      }

      return {
        screenId,
        name: s.name,
        totalSeats: s.totalSeats,
        formats: s.formats,
        seatLayout,
      };
    });

    try {
      const theatre = await Theatre.create({
        theatreId: `THR-${uuidv4().slice(0, 8).toUpperCase()}`,
        name: input.name,
        city: input.city,
        address: input.address,
        pincode: input.pincode,
        amenities: input.amenities ?? [],
        screens,
      });

      logger.info("Theatre created", {
        theatreId: theatre.theatreId,
        name: theatre.name,
        city: theatre.city,
      });
      return theatre;
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError(409, "Theatre already exists", "THEATRE_EXISTS");
      }
      throw err;
    }
  }

  async listByCity(city: string): Promise<ITheatre[]> {
    return Theatre.find({
      city: { $regex: city, $options: "i" },
      isActive: true,
    }).lean() as unknown as ITheatre[];
  }

  async getById(theatreId: string): Promise<ITheatre> {
    const theatre = await Theatre.findOne({ theatreId, isActive: true });
    if (!theatre)
      throw new AppError(404, "Theatre not found", "THEATRE_NOT_FOUND");
    return theatre;
  }

  async update(
    theatreId: string,
    updates: UpdateTheatreInput,
  ): Promise<ITheatre> {
    // Only set fields that were actually provided
    const allowedUpdates: Record<string, any> = {};
    if (updates.name !== undefined) allowedUpdates.name = updates.name.trim();
    if (updates.city !== undefined) allowedUpdates.city = updates.city.trim();
    if (updates.address !== undefined)
      allowedUpdates.address = updates.address.trim();
    if (updates.pincode !== undefined)
      allowedUpdates.pincode = updates.pincode.trim();
    if (updates.amenities !== undefined)
      allowedUpdates.amenities = updates.amenities;

    if (Object.keys(allowedUpdates).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_UPDATES");
    }

    const theatre = await Theatre.findOneAndUpdate(
      { theatreId },
      { $set: allowedUpdates },
      { new: true, runValidators: true },
    );
    if (!theatre)
      throw new AppError(404, "Theatre not found", "THEATRE_NOT_FOUND");

    logger.info("Theatre updated", {
      theatreId,
      fields: Object.keys(allowedUpdates),
    });
    return theatre;
  }
}

export const theatreService = new TheatreService();
