/**
 * CineBook Seed Script
 *
 * Populates the database with realistic test data for local dev and demos.
 *
 * Run with:
 *   npm run seed           (from project root)
 *   npx tsx scripts/seed.ts
 *
 * What it creates:
 *   1 admin user
 *   2 regular users
 *   3 movies
 *   2 theatres (3 screens each)
 *   Shows for the next 7 days
 *
 * Prerequisites:
 *   - All services running (npm run dev)
 *   - API Gateway on port 3000
 */

const BASE_URL = "http://localhost:3000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApiResponse {
  [key: string]: any;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(
  path: string,
  body: object,
  token?: string,
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok)
      throw new Error(
        `POST ${path} failed [${res.status}]: ${JSON.stringify(data)}`,
      );
    return data;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`POST ${path} timed out — is the service running?`);
    }
    throw err;
  }
}

async function patch(
  path: string,
  body: object,
  token: string,
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok)
      throw new Error(
        `PATCH ${path} failed [${res.status}]: ${JSON.stringify(data)}`,
      );
    return data;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`PATCH ${path} timed out — is the service running?`);
    }
    throw err;
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function log(icon: string, msg: string, detail?: string) {
  const d = detail ? `${c.dim} → ${detail}${c.reset}` : "";
  console.log(`  ${icon}  ${msg}${d}`);
}

function section(title: string) {
  console.log(
    `\n${c.bold}${c.cyan}── ${title} ${"─".repeat(50 - title.length)}${c.reset}`,
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const MOVIES = [
  {
    title: "Inception",
    description:
      "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    genre: ["Sci-Fi", "Thriller", "Action"],
    language: ["English", "Hindi"],
    duration: 148,
    rating: "UA" as const,
    director: "Christopher Nolan",
    releaseDate: "2010-07-16",
  },
  {
    title: "Interstellar",
    description:
      "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    genre: ["Sci-Fi", "Drama", "Adventure"],
    language: ["English", "Hindi"],
    duration: 169,
    rating: "U" as const,
    director: "Christopher Nolan",
    releaseDate: "2014-11-07",
  },
  {
    title: "Kalki 2898-AD",
    description:
      "A futuristic sci-fi set in the year 2898, inspired by Hindu mythology.",
    genre: ["Sci-Fi", "Action", "Mythology"],
    language: ["Hindi", "Telugu", "Tamil", "Malayalam"],
    duration: 181,
    rating: "UA" as const,
    director: "Nag Ashwin",
    releaseDate: "2024-06-27",
  },
];

const THEATRES = [
  {
    name: "PVR Cinemas — Sector 17",
    city: "Chandigarh",
    address: "SCO 189-190, Sector 17C",
    pincode: "160017",
    amenities: ["Parking", "Food Court", "Wheelchair Access", "Dolby Atmos"],
    screens: [
      {
        name: "Audi 1 — IMAX",
        totalSeats: 40,
        formats: ["IMAX", "2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "standard" as const },
          { row: "C", count: 10, type: "premium" as const },
          { row: "D", count: 10, type: "recliner" as const },
        ],
      },
      {
        name: "Audi 2 — 3D",
        totalSeats: 30,
        formats: ["3D", "2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "premium" as const },
          { row: "C", count: 10, type: "recliner" as const },
        ],
      },
      {
        name: "Audi 3 — Standard",
        totalSeats: 20,
        formats: ["2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "premium" as const },
        ],
      },
    ],
  },
  {
    name: "INOX — Elante Mall",
    city: "Chandigarh",
    address: "Elante Mall, Industrial Area Phase 1",
    pincode: "160002",
    amenities: ["Parking", "Food Court", "4DX"],
    screens: [
      {
        name: "Screen 1 — 4DX",
        totalSeats: 30,
        formats: ["4DX", "2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "premium" as const },
          { row: "C", count: 10, type: "couple" as const },
        ],
      },
      {
        name: "Screen 2 — 3D",
        totalSeats: 30,
        formats: ["3D", "2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "premium" as const },
          { row: "C", count: 10, type: "recliner" as const },
        ],
      },
      {
        name: "Screen 3 — Standard",
        totalSeats: 20,
        formats: ["2D"],
        rows: [
          { row: "A", count: 10, type: "standard" as const },
          { row: "B", count: 10, type: "premium" as const },
        ],
      },
    ],
  },
];

// Show times per day
const SHOW_TIMES = ["10:00", "13:30", "17:00", "20:30"];

const PRICING = {
  standard: 250,
  premium: 400,
  recliner: 600,
  couple: 700,
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n${c.bold}${c.green}🎬 CineBook Seed Script${c.reset}`);
  console.log(`${c.dim}  Connecting to ${BASE_URL}${c.reset}`);

  // ── 1. Health check ──────────────────────────────────────────────────────────
  section("Health Check");
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error("Gateway not responding");
    log("✓", "API Gateway is up");
  } catch {
    console.error(`\n  ✗  Cannot reach ${BASE_URL}/health`);
    console.error("     Make sure all services are running: npm run dev\n");
    process.exit(1);
  }

  // ── 2. Create users ───────────────────────────────────────────────────────────
  section("Users");

  let adminToken: string;
  let user1Token: string;

  // Admin
  try {
    const res = await post("/api/auth/register", {
      name: "Admin",
      email: "admin@cinebook.dev",
      password: "Admin1234",
    });
    adminToken = res.accessToken;
    log("✓", "Admin registered", "admin@cinebook.dev / Admin1234");
  } catch (err: unknown) {
    // Always try login if register fails for any reason
    try {
      const res = await post("/api/auth/login", {
        email: "admin@cinebook.dev",
        password: "Admin1234",
      });
      adminToken = res.accessToken;
      log("↺", "Admin already exists — logged in", "admin@cinebook.dev");
    } catch {
      throw new Error("Could not register or login as admin");
    }
  }

  // User 1
  try {
    const res = await post("/api/auth/register", {
      name: "Jaspreet Singh",
      email: "jaspreet@cinebook.dev",
      password: "User1234",
    });
    user1Token = res.accessToken;
    log("✓", "User 1 registered", "jaspreet@cinebook.dev / User1234");
  } catch {
    try {
      const res = await post("/api/auth/login", {
        email: "jaspreet@cinebook.dev",
        password: "User1234",
      });
      user1Token = res.accessToken;
      log("↺", "User 1 already exists — logged in", "jaspreet@cinebook.dev");
    } catch {
      throw new Error("Could not register or login as user 1");
    }
  }

  // User 2
  try {
    await post("/api/auth/register", {
      name: "Test User",
      email: "test@cinebook.dev",
      password: "User1234",
    });
    log("✓", "User 2 registered", "test@cinebook.dev / User1234");
  } catch {
    log("↺", "User 2 already exists", "test@cinebook.dev");
  }

  // ── Re-login admin to get fresh token with updated role ───────────────────────
  try {
    const res = await post("/api/auth/login", {
      email: "admin@cinebook.dev",
      password: "Admin1234",
    });
    adminToken = res.accessToken;
    log("✓", `Admin token refreshed (role: ${res.user?.role})`);
  } catch {
    log("!", "Could not refresh admin token");
  }

  // ── 3. Create movies ──────────────────────────────────────────────────────────
  section("Movies");

  const createdMovies: Array<{
    movieId: string;
    title: string;
    duration: number;
  }> = [];

  for (const movie of MOVIES) {
    try {
      const res = await post("/api/movies", movie, adminToken);
      createdMovies.push({
        movieId: res.movieId,
        title: res.title,
        duration: res.duration,
      });
      log("✓", res.title, res.movieId);
    } catch (err: any) {
      if (err.message.includes("MOVIE_EXISTS") || err.message.includes("403")) {
        log("↺", `${movie.title} already exists`);
        // Try to fetch it
        try {
          const res = await fetch(
            `${BASE_URL}/api/movies?search=${encodeURIComponent(movie.title)}`,
          );
          const data = await res.json();
          if (data.data?.[0]) {
            createdMovies.push({
              movieId: data.data[0].movieId,
              title: data.data[0].title,
              duration: data.data[0].duration,
            });
          }
        } catch {}
      } else {
        log(
          "!",
          `${c.yellow}Could not create ${movie.title}${c.reset}`,
          "Admin role required — run mongosh command above first",
        );
      }
    }
  }

  if (createdMovies.length === 0) {
    console.error(
      "\n  ✗  No movies created. Make sure admin role is set and re-run.\n",
    );
    process.exit(1);
  }

  // ── 4. Create theatres ────────────────────────────────────────────────────────
  section("Theatres");

  const createdTheatres: Array<{
    theatreId: string;
    name: string;
    screens: Array<{ screenId: string; name: string; formats: string[] }>;
  }> = [];

  for (const theatre of THEATRES) {
    try {
      const res = await post("/api/theatres", theatre, adminToken);
      createdTheatres.push({
        theatreId: res.theatreId,
        name: res.name,
        screens: res.screens.map((s: any) => ({
          screenId: s.screenId,
          name: s.name,
          formats: s.formats,
        })),
      });
      log("✓", res.name, res.theatreId);
      for (const screen of res.screens) {
        log(" ", `  └─ ${screen.name}`, screen.screenId);
      }
    } catch (err: any) {
      if (
        err.message.includes("THEATRE_EXISTS") ||
        err.message.includes("403")
      ) {
        log("↺", `${theatre.name} already exists`);
      } else {
        log(
          "!",
          `${c.yellow}Could not create ${theatre.name}${c.reset}`,
          err.message,
        );
      }
    }
  }

  if (createdTheatres.length === 0) {
    console.error("\n  ✗  No theatres created. Make sure admin role is set.\n");
    process.exit(1);
  }

  // ── 5. Create shows ───────────────────────────────────────────────────────────
  section("Shows (next 7 days)");

  const createdShows: Array<{
    showId: string;
    movie: string;
    theatre: string;
    showTime: string;
  }> = [];
  let showCount = 0;

  for (let day = 1; day <= 7; day++) {
    const date = new Date();
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];

    // Each movie gets shows across theatres
    for (const movie of createdMovies) {
      for (const theatre of createdTheatres) {
        // Pick first compatible screen
        const screen = theatre.screens[0];
        if (!screen) continue;

        // Two show times per movie per theatre per day
        for (const time of SHOW_TIMES.slice(0, 2)) {
          const showTime = `${dateStr}T${time}:00.000Z`;

          try {
            const format = screen.formats.includes("IMAX")
              ? "IMAX"
              : screen.formats.includes("3D")
                ? "3D"
                : "2D";

            const res = await post(
              "/api/shows",
              {
                movieId: movie.movieId,
                theatreId: theatre.theatreId,
                screenId: screen.screenId,
                showTime,
                language: "English",
                format,
                pricing: PRICING,
              },
              adminToken,
            );

            createdShows.push({
              showId: res.showId,
              movie: movie.title,
              theatre: theatre.name,
              showTime: `${dateStr} ${time}`,
            });
            showCount++;
          } catch (err: any) {
            if (err.message.includes("SHOW_OVERLAP")) {
              // Already exists, skip silently
            } else if (!err.message.includes("403")) {
              log("!", `Show overlap or error`, err.message.slice(0, 80));
            }
          }
        }
      }
    }
  }

  log("✓", `${showCount} shows created across 7 days`);

  // ── 6. Summary ────────────────────────────────────────────────────────────────
  section("Summary");

  console.log(`
${c.bold}  Users${c.reset}
    Admin  → admin@cinebook.dev / Admin1234
    User 1 → jaspreet@cinebook.dev / User1234
    User 2 → test@cinebook.dev / User1234

${c.bold}  Movies created${c.reset}`);

  for (const m of createdMovies) {
    console.log(`    ${c.green}${m.movieId}${c.reset}  ${m.title}`);
  }

  console.log(`\n${c.bold}  Theatres & Screens${c.reset}`);
  for (const t of createdTheatres) {
    console.log(`    ${c.green}${t.theatreId}${c.reset}  ${t.name}`);
    for (const s of t.screens) {
      console.log(`      ${c.dim}${s.screenId}${c.reset}  ${s.name}`);
    }
  }

  if (createdShows.length > 0) {
    console.log(
      `\n${c.bold}  Sample Show (use this to test booking)${c.reset}`,
    );
    const sample = createdShows[0];
    console.log(`    Show ID   → ${c.green}${sample.showId}${c.reset}`);
    console.log(`    Movie     → ${sample.movie}`);
    console.log(`    Theatre   → ${sample.theatre}`);
    console.log(`    Show Time → ${sample.showTime}`);
  }

  console.log(`
${c.bold}  Quick booking test${c.reset}
${c.dim}
    # 1. Login
    TOKEN=\$(curl -s -X POST http://localhost:3000/api/auth/login \\
      -H "Content-Type: application/json" \\
      -d '{"email":"jaspreet@cinebook.dev","password":"User1234"}' | jq -r .accessToken)

    # 2. View seats
    curl -s http://localhost:3000/api/shows/${createdShows[0]?.showId ?? "SHOW-XXXXXXXX"}/seats | jq .seats[0:4]

    # 3. Book
    curl -s -X POST http://localhost:3000/api/bookings \\
      -H "Authorization: Bearer \$TOKEN" \\
      -H "Content-Type: application/json" \\
      -d '{
        "showId": "${createdShows[0]?.showId ?? "SHOW-XXXXXXXX"}",
        "seatIds": ["<seatId from step 2>"],
        "idempotencyKey": "'$(node -e "console.log(require('crypto').randomUUID())"  2>/dev/null || echo 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'  )'"
      }' | jq .
${c.reset}`);

  console.log(`${c.bold}${c.green}  ✓ Seed complete!${c.reset}\n`);
}

seed().catch((err) => {
  console.error(`\n  ✗  Seed failed: ${err.message}\n`);
  process.exit(1);
});
