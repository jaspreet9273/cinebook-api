import { SwaggerOptions } from "swagger-ui-express";

export const swaggerOptions: SwaggerOptions = {
  customCss: `
    .swagger-ui .topbar { background-color: #e50000; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .swagger-ui .info .title { color: #e50000; }
  `,
  customSiteTitle: "CineBook API Docs",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  },
};

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "CineBook — Movie Ticket Booking API",
    version: "1.0.0",
    description: `
Production-grade movie ticket booking system.

## Authentication
Most endpoints require a JWT Bearer token. Get one by calling \`POST /api/auth/login\`.

## Idempotency
\`POST /api/bookings\` requires an \`idempotencyKey\` (UUID v4) in the request body.
Generate one on the client. Retrying with the same key always returns the same result — no double bookings.

## Rate Limits
- Auth routes: 10 requests / 15 minutes
- Booking routes: 20 requests / 5 minutes
- Payment routes: 30 requests / 10 minutes
- General: 100 requests / 15 minutes
    `.trim(),
    contact: {
      name: "Jaspreet Singh",
      email: "jaspreet@cinebook.dev",
    },
  },

  servers: [{ url: "http://localhost:3000", description: "Local development" }],

  tags: [
    { name: "Auth", description: "Register, login, token refresh, logout" },
    { name: "Users", description: "User profile management" },
    { name: "Movies", description: "Movie catalogue (admin writes)" },
    {
      name: "Theatres",
      description: "Theatre and screen management (admin writes)",
    },
    {
      name: "Shows",
      description: "Show scheduling and seat maps (admin writes)",
    },
    { name: "Bookings", description: "Seat reservation and booking lifecycle" },
    { name: "Payments", description: "Razorpay payment flow and refunds" },
    { name: "Health", description: "Service health checks" },
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token from POST /api/auth/login",
      },
    },

    schemas: {
      // ── Common ──────────────────────────────────────────────────────────────
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "Resource not found" },
          code: { type: "string", example: "NOT_FOUND" },
          correlationId: { type: "string", example: "a3f2b1c4-..." },
        },
      },
      ValidationError: {
        type: "object",
        properties: {
          errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", example: "email" },
                message: {
                  type: "string",
                  example: "Must be a valid email address",
                },
              },
            },
          },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 100 },
          pages: { type: "integer", example: 5 },
        },
      },

      // ── Auth ────────────────────────────────────────────────────────────────
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: {
            type: "string",
            minLength: 2,
            maxLength: 100,
            example: "Jaspreet Singh",
          },
          email: {
            type: "string",
            format: "email",
            example: "jaspreet@example.com",
          },
          password: {
            type: "string",
            minLength: 8,
            example: "SecurePass1",
            description:
              "Min 8 chars, must include uppercase, lowercase, and digit",
          },
          phone: { type: "string", example: "+919876543210" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "jaspreet@example.com",
          },
          password: { type: "string", example: "SecurePass1" },
        },
      },
      AuthResponse: {
        type: "object",
        properties: {
          accessToken: {
            type: "string",
            description: "JWT — expires in 15 minutes",
          },
          refreshToken: {
            type: "string",
            description: "Opaque token — expires in 7 days",
          },
          user: { $ref: "#/components/schemas/UserProfile" },
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" },
        },
      },

      // ── User ────────────────────────────────────────────────────────────────
      UserProfile: {
        type: "object",
        properties: {
          userId: { type: "string", example: "usr_abc123" },
          name: { type: "string", example: "Jaspreet Singh" },
          email: { type: "string", example: "jaspreet@example.com" },
          phone: { type: "string", example: "+919876543210" },
          role: {
            type: "string",
            enum: ["user", "admin", "theatre_owner"],
            example: "user",
          },
          isVerified: { type: "boolean", example: false },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 2, example: "New Name" },
          phone: { type: "string", example: "+919876543210" },
        },
      },
      ChangePasswordRequest: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", example: "OldPass1" },
          newPassword: { type: "string", minLength: 8, example: "NewPass12" },
        },
      },

      // ── Movie ────────────────────────────────────────────────────────────────
      Movie: {
        type: "object",
        properties: {
          movieId: { type: "string", example: "MOV-A1B2C3D4" },
          title: { type: "string", example: "Inception" },
          description: { type: "string", example: "A mind-bending thriller" },
          genre: {
            type: "array",
            items: { type: "string" },
            example: ["Sci-Fi", "Thriller"],
          },
          language: {
            type: "array",
            items: { type: "string" },
            example: ["English", "Hindi"],
          },
          duration: {
            type: "integer",
            description: "In minutes",
            example: 148,
          },
          rating: {
            type: "string",
            enum: ["U", "UA", "A", "S"],
            example: "UA",
          },
          director: { type: "string", example: "Christopher Nolan" },
          cast: {
            type: "array",
            items: { type: "string" },
            example: ["Leonardo DiCaprio"],
          },
          releaseDate: {
            type: "string",
            format: "date",
            example: "2010-07-16",
          },
          posterUrl: { type: "string", format: "uri" },
          trailerUrl: { type: "string", format: "uri" },
          isActive: { type: "boolean", example: true },
        },
      },
      CreateMovieRequest: {
        type: "object",
        required: [
          "title",
          "description",
          "genre",
          "language",
          "duration",
          "rating",
          "director",
          "releaseDate",
        ],
        properties: {
          title: { type: "string", example: "Inception" },
          description: { type: "string", example: "A mind-bending thriller" },
          genre: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            example: ["Sci-Fi"],
          },
          language: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            example: ["English"],
          },
          duration: { type: "integer", minimum: 1, maximum: 600, example: 148 },
          rating: { type: "string", enum: ["U", "UA", "A", "S"] },
          director: { type: "string", example: "Christopher Nolan" },
          cast: { type: "array", items: { type: "string" } },
          releaseDate: {
            type: "string",
            format: "date",
            example: "2010-07-16",
          },
          posterUrl: { type: "string", format: "uri" },
          trailerUrl: { type: "string", format: "uri" },
        },
      },

      // ── Theatre ──────────────────────────────────────────────────────────────
      Theatre: {
        type: "object",
        properties: {
          theatreId: { type: "string", example: "THR-A1B2C3D4" },
          name: { type: "string", example: "PVR Cinemas" },
          city: { type: "string", example: "Chandigarh" },
          address: { type: "string", example: "Sector 17C" },
          pincode: { type: "string", example: "160017" },
          amenities: {
            type: "array",
            items: { type: "string" },
            example: ["Parking", "Food Court"],
          },
          screens: {
            type: "array",
            items: { $ref: "#/components/schemas/Screen" },
          },
          isActive: { type: "boolean" },
        },
      },
      Screen: {
        type: "object",
        properties: {
          screenId: { type: "string", example: "SCR-A1B2C3D4" },
          name: { type: "string", example: "Audi 1 — IMAX" },
          totalSeats: { type: "integer", example: 120 },
          formats: {
            type: "array",
            items: { type: "string", enum: ["2D", "3D", "IMAX", "4DX"] },
          },
        },
      },
      CreateTheatreRequest: {
        type: "object",
        required: ["name", "city", "address", "pincode", "screens"],
        properties: {
          name: { type: "string", example: "PVR Cinemas" },
          city: { type: "string", example: "Chandigarh" },
          address: { type: "string", example: "Sector 17C" },
          pincode: { type: "string", pattern: "^\\d{6}$", example: "160017" },
          amenities: { type: "array", items: { type: "string" } },
          screens: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["name", "totalSeats", "formats", "rows"],
              properties: {
                name: { type: "string", example: "Screen 1" },
                totalSeats: { type: "integer", minimum: 1, example: 120 },
                formats: {
                  type: "array",
                  items: { type: "string", enum: ["2D", "3D", "IMAX", "4DX"] },
                },
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["row", "count", "type"],
                    properties: {
                      row: { type: "string", example: "A" },
                      count: { type: "integer", minimum: 1, example: 10 },
                      type: {
                        type: "string",
                        enum: ["standard", "premium", "recliner", "couple"],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ── Show ────────────────────────────────────────────────────────────────
      Show: {
        type: "object",
        properties: {
          showId: { type: "string", example: "SHOW-A1B2C3D4" },
          movieId: { type: "string", example: "MOV-A1B2C3D4" },
          theatreId: { type: "string", example: "THR-A1B2C3D4" },
          screenId: { type: "string", example: "SCR-A1B2C3D4" },
          showTime: {
            type: "string",
            format: "date-time",
            example: "2025-12-25T14:30:00.000Z",
          },
          language: { type: "string", example: "English" },
          format: { type: "string", enum: ["2D", "3D", "IMAX", "4DX"] },
          totalSeats: { type: "integer", example: 120 },
          availableSeats: { type: "integer", example: 98 },
          pricing: {
            type: "object",
            properties: {
              standard: { type: "number", example: 250 },
              premium: { type: "number", example: 400 },
              recliner: { type: "number", example: 600 },
              couple: { type: "number", example: 700 },
            },
          },
          isActive: { type: "boolean" },
        },
      },
      Seat: {
        type: "object",
        properties: {
          seatId: { type: "string", example: "SCR-A1B2C3D4-A1" },
          row: { type: "string", example: "A" },
          number: { type: "integer", example: 1 },
          type: {
            type: "string",
            enum: ["standard", "premium", "recliner", "couple"],
          },
          price: { type: "number", example: 250 },
          status: {
            type: "string",
            enum: ["available", "reserved", "booked", "maintenance"],
          },
          reservedUntil: { type: "string", format: "date-time" },
        },
      },
      CreateShowRequest: {
        type: "object",
        required: [
          "movieId",
          "theatreId",
          "screenId",
          "showTime",
          "language",
          "format",
          "pricing",
        ],
        properties: {
          movieId: { type: "string", example: "MOV-A1B2C3D4" },
          theatreId: { type: "string", example: "THR-A1B2C3D4" },
          screenId: { type: "string", example: "SCR-A1B2C3D4" },
          showTime: {
            type: "string",
            format: "date-time",
            example: "2025-12-25T14:30:00.000Z",
          },
          language: { type: "string", example: "English" },
          format: { type: "string", enum: ["2D", "3D", "IMAX", "4DX"] },
          pricing: {
            type: "object",
            required: ["standard", "premium", "recliner", "couple"],
            properties: {
              standard: { type: "number", minimum: 0, example: 250 },
              premium: { type: "number", minimum: 0, example: 400 },
              recliner: { type: "number", minimum: 0, example: 600 },
              couple: { type: "number", minimum: 0, example: 700 },
            },
          },
        },
      },

      // ── Booking ─────────────────────────────────────────────────────────────
      Booking: {
        type: "object",
        properties: {
          bookingId: { type: "string", example: "BKG-1234567890-ABCD1234" },
          userId: { type: "string", example: "usr_abc123" },
          showId: { type: "string", example: "SHOW-A1B2C3D4" },
          movieId: { type: "string", example: "MOV-A1B2C3D4" },
          theatreId: { type: "string", example: "THR-A1B2C3D4" },
          seats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                seatId: { type: "string" },
                row: { type: "string" },
                number: { type: "integer" },
                type: { type: "string" },
                price: { type: "number" },
              },
            },
          },
          status: {
            type: "string",
            enum: [
              "pending",
              "payment_processing",
              "confirmed",
              "cancelled",
              "expired",
              "refunded",
            ],
          },
          totalAmount: { type: "number", example: 510 },
          convenienceFee: { type: "number", example: 10 },
          currency: { type: "string", example: "INR" },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "Seat hold expires at this time",
          },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateBookingRequest: {
        type: "object",
        required: ["showId", "seatIds", "idempotencyKey"],
        properties: {
          showId: { type: "string", example: "SHOW-A1B2C3D4" },
          seatIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            example: ["SCR-A1B2C3D4-A1", "SCR-A1B2C3D4-A2"],
          },
          idempotencyKey: {
            type: "string",
            format: "uuid",
            description:
              "UUID v4 — generate on client, use same key to safely retry",
            example: "550e8400-e29b-41d4-a716-446655440000",
          },
        },
      },
      CreateBookingResponse: {
        type: "object",
        properties: {
          bookingId: { type: "string", example: "BKG-1234567890-ABCD1234" },
          status: { type: "string", example: "pending" },
          totalAmount: { type: "number", example: 510 },
          convenienceFee: { type: "number", example: 10 },
          currency: { type: "string", example: "INR" },
          expiresAt: { type: "string", format: "date-time" },
          seats: {
            type: "array",
            items: { $ref: "#/components/schemas/Seat" },
          },
          isIdempotentReplay: {
            type: "boolean",
            description: "true if this was a duplicate request",
            example: false,
          },
        },
      },

      // ── Payment ─────────────────────────────────────────────────────────────
      Payment: {
        type: "object",
        properties: {
          paymentId: { type: "string", example: "PAY-1234567890-ABCD1234" },
          bookingId: { type: "string", example: "BKG-1234567890-ABCD1234" },
          userId: { type: "string", example: "usr_abc123" },
          amount: { type: "number", example: 510 },
          currency: { type: "string", example: "INR" },
          status: {
            type: "string",
            enum: [
              "initiated",
              "pending",
              "success",
              "failed",
              "refunded",
              "refund_pending",
            ],
          },
          razorpayOrderId: { type: "string", example: "order_abc123" },
          razorpayPaymentId: { type: "string", example: "pay_abc123" },
          razorpayRefundId: { type: "string", example: "refund_abc123" },
          failureReason: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateOrderRequest: {
        type: "object",
        required: ["bookingId", "amount"],
        properties: {
          bookingId: { type: "string", example: "BKG-1234567890-ABCD1234" },
          amount: {
            type: "number",
            minimum: 1,
            example: 510,
            description: "Amount in rupees",
          },
          currency: { type: "string", enum: ["INR", "USD"], default: "INR" },
        },
      },
      CreateOrderResponse: {
        type: "object",
        properties: {
          paymentId: { type: "string" },
          razorpayOrderId: {
            type: "string",
            description: "Pass to Razorpay checkout",
          },
          razorpayKeyId: {
            type: "string",
            description: "Pass to Razorpay checkout",
          },
          amount: { type: "number" },
          currency: { type: "string" },
          status: { type: "string" },
        },
      },
      VerifyPaymentRequest: {
        type: "object",
        required: ["razorpayOrderId", "razorpayPaymentId", "razorpaySignature"],
        properties: {
          razorpayOrderId: { type: "string", example: "order_abc123" },
          razorpayPaymentId: { type: "string", example: "pay_abc123" },
          razorpaySignature: {
            type: "string",
            description: "HMAC-SHA256 hex signature from Razorpay",
            example: "abc123def456...",
          },
        },
      },
    },

    responses: {
      Unauthorized: {
        description: "Missing or invalid JWT token",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Forbidden: {
        description: "Insufficient permissions",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      ValidationError: {
        description: "Request validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ValidationError" },
          },
        },
      },
      Conflict: {
        description: "Resource already exists or conflict",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },

  security: [{ bearerAuth: [] }],

  paths: {
    // ── Health ───────────────────────────────────────────────────────────────
    "/health": {
      get: {
        tags: ["Health"],
        summary: "API Gateway health check",
        security: [],
        responses: {
          "200": {
            description: "Gateway is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    service: { type: "string", example: "api-gateway" },
                    uptime: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "409": {
            description: "Email already registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: "Email already registered",
                  code: "EMAIL_TAKEN",
                },
              },
            },
          },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResponse" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: "Invalid email or password",
                  code: "INVALID_CREDENTIALS",
                },
              },
            },
          },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "New access token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Invalid or revoked refresh token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout — revoke refresh token",
        security: [],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Logged out successfully",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user from token",
        responses: {
          "200": {
            description: "Current user profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserProfile" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Users ────────────────────────────────────────────────────────────────
    "/api/users/profile": {
      get: {
        tags: ["Users"],
        summary: "Get own profile",
        responses: {
          "200": {
            description: "User profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserProfile" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Update own profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProfileRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserProfile" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/users/change-password": {
      patch: {
        tags: ["Users"],
        summary: "Change password — revokes all sessions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChangePasswordRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Password changed and all sessions revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "401": {
            description: "Wrong current password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: "Current password is incorrect",
                  code: "WRONG_PASSWORD",
                },
              },
            },
          },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/users/account": {
      delete: {
        tags: ["Users"],
        summary: "Deactivate account (soft delete)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: { password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Account deactivated" },
          "401": {
            description: "Wrong password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },

    // ── Movies ───────────────────────────────────────────────────────────────
    "/api/movies": {
      get: {
        tags: ["Movies"],
        summary: "List movies with filters",
        security: [],
        parameters: [
          {
            name: "genre",
            in: "query",
            schema: { type: "string" },
            example: "Sci-Fi",
          },
          {
            name: "language",
            in: "query",
            schema: { type: "string" },
            example: "English",
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Full-text search on title and description",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 50 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated movie list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Movie" },
                    },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    pages: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Movies"],
        summary: "Create movie — admin only",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMovieRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Movie created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Movie" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/movies/{movieId}": {
      get: {
        tags: ["Movies"],
        summary: "Get movie by ID",
        security: [],
        parameters: [
          {
            name: "movieId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Movie details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Movie" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Movies"],
        summary: "Update movie — admin only",
        parameters: [
          {
            name: "movieId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateMovieRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Movie updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Movie" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Movies"],
        summary: "Deactivate movie — admin only",
        parameters: [
          {
            name: "movieId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Movie deactivated" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Theatres ─────────────────────────────────────────────────────────────
    "/api/theatres": {
      get: {
        tags: ["Theatres"],
        summary: "List theatres by city",
        security: [],
        parameters: [
          {
            name: "city",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "Chandigarh",
          },
        ],
        responses: {
          "200": {
            description: "Theatre list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Theatre" },
                },
              },
            },
          },
          "400": { description: "city param missing" },
        },
      },
      post: {
        tags: ["Theatres"],
        summary: "Create theatre — admin only",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTheatreRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Theatre created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Theatre" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/theatres/{theatreId}": {
      get: {
        tags: ["Theatres"],
        summary: "Get theatre by ID",
        security: [],
        parameters: [
          {
            name: "theatreId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Theatre details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Theatre" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Theatres"],
        summary: "Update theatre — admin only",
        parameters: [
          {
            name: "theatreId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  city: { type: "string" },
                  address: { type: "string" },
                  pincode: { type: "string" },
                  amenities: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Theatre updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Theatre" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Shows ────────────────────────────────────────────────────────────────
    "/api/shows": {
      get: {
        tags: ["Shows"],
        summary: "List shows with filters",
        security: [],
        parameters: [
          { name: "movieId", in: "query", schema: { type: "string" } },
          { name: "theatreId", in: "query", schema: { type: "string" } },
          {
            name: "city",
            in: "query",
            schema: { type: "string" },
            description: "Filter by theatre city",
          },
          {
            name: "date",
            in: "query",
            schema: { type: "string", format: "date" },
            example: "2025-12-25",
          },
          { name: "language", in: "query", schema: { type: "string" } },
          {
            name: "format",
            in: "query",
            schema: { type: "string", enum: ["2D", "3D", "IMAX", "4DX"] },
          },
        ],
        responses: {
          "200": {
            description: "Show list (seats excluded — use /shows/:id/seats)",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Show" },
                },
              },
            },
          },
          "400": { description: "Invalid date format" },
        },
      },
      post: {
        tags: ["Shows"],
        summary: "Create show — admin only",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateShowRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Show created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Show" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { description: "Movie, theatre, or screen not found" },
          "409": { description: "Show overlaps existing show on same screen" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/shows/{showId}": {
      get: {
        tags: ["Shows"],
        summary: "Get show by ID",
        security: [],
        parameters: [
          {
            name: "showId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Show details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Show" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Shows"],
        summary: "Deactivate show — admin only",
        parameters: [
          {
            name: "showId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Show deactivated" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/shows/{showId}/seats": {
      get: {
        tags: ["Shows"],
        summary: "Get seat map for a show",
        security: [],
        parameters: [
          {
            name: "showId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Seat layout with availability",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    showId: { type: "string" },
                    availableSeats: { type: "integer" },
                    seats: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Seat" },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Bookings ─────────────────────────────────────────────────────────────
    "/api/bookings": {
      post: {
        tags: ["Bookings"],
        summary: "Create booking — idempotent",
        description:
          "Reserves seats and creates a pending booking. Use the returned `bookingId` to create a payment order. Seats are held for 10 minutes.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateBookingRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Booking created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateBookingResponse" },
              },
            },
          },
          "200": {
            description: "Idempotent replay — same booking returned",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateBookingResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": {
            description: "Seats unavailable or concurrent update conflict",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: "Seats A1, A2 are unavailable",
                  code: "SEATS_UNAVAILABLE",
                },
              },
            },
          },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
      get: {
        tags: ["Bookings"],
        summary: "List my bookings",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10, maximum: 50 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated booking list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Booking" },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    "/api/bookings/{bookingId}": {
      get: {
        tags: ["Bookings"],
        summary: "Get booking by ID",
        parameters: [
          {
            name: "bookingId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Booking details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Booking" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Bookings"],
        summary: "Cancel booking",
        parameters: [
          {
            name: "bookingId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Plans changed" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Booking cancelled",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    bookingId: { type: "string" },
                    status: { type: "string", example: "cancelled" },
                  },
                },
              },
            },
          },
          "400": { description: "Cannot cancel a confirmed/expired booking" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Payments ─────────────────────────────────────────────────────────────
    "/api/payments/orders": {
      post: {
        tags: ["Payments"],
        summary: "Create Razorpay order",
        description:
          "Creates a Razorpay order. Use `razorpayOrderId` and `razorpayKeyId` to open the Razorpay checkout modal on the frontend.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrderRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Order created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrderResponse" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/payments/verify": {
      post: {
        tags: ["Payments"],
        summary: "Verify payment signature",
        description:
          "Verifies the HMAC-SHA256 signature returned by Razorpay after checkout. On success, emits `payment.success` Kafka event which confirms the booking.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/VerifyPaymentRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Payment verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    paymentId: { type: "string" },
                    bookingId: { type: "string" },
                    razorpayPaymentId: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid signature",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  error: "Payment verification failed",
                  code: "INVALID_SIGNATURE",
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "422": { $ref: "#/components/responses/ValidationError" },
        },
      },
    },

    "/api/payments/booking/{bookingId}": {
      get: {
        tags: ["Payments"],
        summary: "Get payment for a booking",
        parameters: [
          {
            name: "bookingId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Payment details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Payment" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/payments/{paymentId}/refund": {
      post: {
        tags: ["Payments"],
        summary: "Initiate refund — admin only",
        parameters: [
          {
            name: "paymentId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  amount: {
                    type: "number",
                    description:
                      "Partial refund amount in rupees. Omit for full refund.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Refund initiated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "refund_pending" },
                    razorpayRefundId: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description:
              "Payment not successful or refund exceeds original amount",
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/payments/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Razorpay webhook receiver",
        description:
          "Called directly by Razorpay — not by your frontend. Verifies HMAC signature and processes payment.captured, payment.failed, refund.processed events.",
        security: [],
        parameters: [
          {
            name: "x-razorpay-signature",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "HMAC-SHA256 signature from Razorpay",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "Raw Razorpay webhook payload",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook processed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
          "400": { description: "Invalid webhook signature" },
        },
      },
    },
  },
};
