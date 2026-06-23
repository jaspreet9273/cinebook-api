# 🎬 CineBook — Movie Ticket Booking System

A production-grade microservices backend for online movie ticket booking.
Built with Node.js, TypeScript, Kafka, RabbitMQ, MongoDB, and Redis.

---

## Architecture

```
Client
  │
  ▼
┌─────────────────┐
│   API Gateway   │  ← Rate limiting, JWT auth, CORS, circuit breaker
│   (Port 3000)   │
└────────┬────────┘
         │ HTTP proxy (injects X-User-Id, X-User-Role, X-Correlation-Id)
    ┌────┴──────────┬──────────────┬──────────────┐
    ▼               ▼              ▼              ▼
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  User   │  │ Booking  │  │ Payment  │  │  Show    │
│ Service │  │ Service  │  │ Service  │  │ Service  │
│  :3004  │  │  :3001   │  │  :3002   │  │  :3003   │
└─────────┘  └────┬─────┘  └────┬─────┘  └──────────┘
                  │              │
        ┌─────────┴──────────────┘
        │     Apache Kafka (async, durable, ordered)
        │     booking.created → payment.initiated
        │     payment.success → booking.confirmed
        │     booking.expired → seats released
        ▼
┌──────────────────────────────────────────────┐
│                 Apache Kafka                 │
│  Topics: booking.*, payment.*, seats.*       │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────┐
│       RabbitMQ       │  ← Fanout exchange → email + SMS queues
│  Priority queues     │  ← DLQ after 3 failed retries
│  + Dead Letter Queue │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Notification Svc    │  ← Consumes RabbitMQ, sends email (Nodemailer) + SMS
└──────────────────────┘

Infrastructure:
  MongoDB  ← Users, Bookings, Shows, Movies, Theatres, Payments
  Redis    ← JWT blacklist, distributed seat locks, expiry cache
```

---

## Key Production Features

| Feature                    | Implementation                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Idempotency**            | Client-supplied `idempotencyKey` (UUID v4) on POST /bookings — exact-once booking    |
| **Distributed Locking**    | Redis `SET NX EX` + Lua atomic release — prevents race on seat reservation           |
| **Optimistic Concurrency** | `seatVersion` field on Show document — detects concurrent seat updates               |
| **MongoDB Transactions**   | Atomic seat reserve + booking create — no partial failures                           |
| **Circuit Breaker**        | Per-service in API Gateway — closed/open/half-open with auto-recovery                |
| **Kafka At-Least-Once**    | Idempotent producer + manual offset commit after processing                          |
| **RabbitMQ DLQ**           | Dead letter queue after 3 failed notification retries                                |
| **Graceful Shutdown**      | SIGTERM drains worker → Kafka → RabbitMQ → Redis → MongoDB in order                  |
| **Correlation IDs**        | `X-Correlation-Id` propagated across all services for distributed tracing            |
| **Seat Hold Expiry**       | Expiry worker runs every 60s — releases seats from unpaid bookings                   |
| **JWT Blacklist**          | Redis stores revoked tokens on logout                                                |
| **Refresh Token Rotation** | Token reuse detected → entire token family invalidated                               |
| **Input Validation**       | Joi (env vars) + express-validator (routes) on every service                         |
| **Structured Logging**     | Winston JSON logs with redaction of sensitive fields (passwords, tokens, signatures) |
| **Rate Limiting**          | Per-endpoint limits — auth: 10/15min, bookings: 20/5min                              |
| **Razorpay Integration**   | Order creation, HMAC signature verification (timing-safe), webhook handling, refunds |
| **HTML Email Templates**   | 4 templates with XSS sanitization via `escapeHtml()`                                 |
| **SMS Notifications**      | Template-based SMS with injection prevention and length validation                   |
| **API Documentation**      | Swagger UI at `/api-docs` — full OpenAPI 3.0 spec with try-it-out                    |
| **Seed Script**            | One-command DB population with movies, theatres, shows, and users                    |

---

## Test Coverage

| Service                | Tests         | What's Covered                                                               |
| ---------------------- | ------------- | ---------------------------------------------------------------------------- |
| `user-service`         | ✅ 35 tests   | Register, login, refresh, logout, profile, password change, account deletion |
| `booking-service`      | ✅ 10 tests   | Create booking, idempotency, validation, seat conflict, auth                 |
| `show-service`         | ✅ 57 tests   | Movies CRUD, theatres CRUD, shows CRUD, seat layout, admin guards            |
| `payment-service`      | ✅ 28 tests   | Order creation, signature verify, refunds, webhook, ownership checks         |
| `notification-service` | ✅ 17 tests   | Email templates, SMS templates, XSS sanitization, unknown template handling  |
| **Total**              | **147 tests** | All services fully mocked — no real DB/broker needed                         |

### Run all tests

```bash
# All services at once
npm run test:all

# Individual service
cd services/user-service         && npm test
cd services/booking-service      && npm test
cd services/show-service         && npm test
cd services/payment-service      && npm test
cd services/notification-service && npm test
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/jaspreet9273/cinebook-api.git
cd cinebook
npm install
```

### 2. Start infrastructure

```bash
npm run infra:up
# Starts MongoDB, Redis, Kafka, Zookeeper, RabbitMQ
# Wait ~30s for Kafka to be ready
```

### 3. Run all services in dev mode

```bash
npm run dev
```

### 4. Seed the database

Populates movies, theatres, shows, and test users in one command:

```bash
npm run seed
```

Output includes ready-to-use IDs and a copy-paste booking curl command.
To wipe and re-seed fresh:

```bash
npm run seed:clean
```

### 5. Explore the API

Open **http://localhost:3000/api-docs** — interactive Swagger UI with all endpoints,
request/response schemas, and try-it-out. Paste your JWT token once via the
**Authorize** button and it's applied to all requests.

### 6. Optional: Kafka UI

```bash
docker compose --profile tools up kafka-ui
# Open http://localhost:8080
```

### 7. RabbitMQ Management UI

Open http://localhost:15672 → admin / password

---

## Documentation

| Document                                                     | Description                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| [Getting Started](docs/getting-started.md)                   | Full local setup guide — install, seed, end-to-end booking flow       |
| [API Reference](docs/api-reference.md)                       | All endpoints with request/response shapes and error codes            |
| [Architecture](docs/architecture.md)                         | System design, data flow, service responsibilities                    |
| [Event Contracts](docs/event-contracts.md)                   | Kafka topics and RabbitMQ queue payload schemas                       |
| [Efficiency & Resilience](docs/efficiency-and-resilience.md) | Flowcharts for happy path and 6 failure scenarios, performance tables |
| [Deployment](docs/deployment.md)                             | Free tier hosting guide — Railway, Atlas, Upstash, CloudAMQP          |

### Architecture Decision Records

| ADR                                               | Decision                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| [ADR-001](docs/adr/001-why-microservices.md)      | Why microservices over a monolith                                     |
| [ADR-002](docs/adr/002-why-kafka-and-rabbitmq.md) | Why both Kafka and RabbitMQ — different guarantees for different jobs |
| [ADR-003](docs/adr/003-why-mongodb.md)            | Why MongoDB for bookings and shows                                    |
| [ADR-004](docs/adr/004-idempotency-strategy.md)   | Idempotency strategy — client key vs server dedup                     |

---

## API Documentation

Interactive Swagger UI is available at **http://localhost:3000/api-docs** when the
gateway is running.

Features:

- Full OpenAPI 3.0 spec covering all 5 services
- Try-it-out on every endpoint — no external tool needed
- JWT auth pre-wired — authorize once, applies everywhere
- Request/response schemas with examples
- Error codes documented per endpoint
- Raw spec available at `GET /api-docs.json` for import into Postman or Insomnia

The spec is defined in `services/api-gateway/src/docs/swagger.ts` as a single
TypeScript file — easy to update when routes change.

---

## Service Ports

| Service              | Port | Description                           |
| -------------------- | ---- | ------------------------------------- |
| API Gateway          | 3000 | Entry point — also serves `/api-docs` |
| Booking Service      | 3001 | Seat reservation, booking lifecycle   |
| Payment Service      | 3002 | Razorpay integration, refunds         |
| Show Service         | 3003 | Movies, theatres, shows, seat layouts |
| User Service         | 3004 | Auth, profiles, JWT                   |
| Notification Service | —    | RabbitMQ consumer, no HTTP port       |

---

## API Reference

Full interactive docs at **http://localhost:3000/api-docs**. Quick reference below.

### Auth

```
POST /api/auth/register        { name, email, password }
POST /api/auth/login           { email, password }
POST /api/auth/refresh         { refreshToken }
POST /api/auth/logout          { refreshToken }
GET  /api/auth/me
```

### Users

```
GET    /api/users/profile
PATCH  /api/users/profile
PATCH  /api/users/change-password
DELETE /api/users/account
```

### Movies (admin only for writes)

```
GET    /api/movies             ?genre=&language=&search=&page=&limit=
GET    /api/movies/:movieId
POST   /api/movies             { title, description, genre, language, duration, rating, director, releaseDate }
PATCH  /api/movies/:movieId
DELETE /api/movies/:movieId
```

### Theatres (admin only for writes)

```
GET    /api/theatres           ?city=
GET    /api/theatres/:theatreId
POST   /api/theatres           { name, city, address, pincode, screens }
PATCH  /api/theatres/:theatreId
```

### Shows (admin only for writes)

```
GET    /api/shows              ?movieId=&theatreId=&city=&date=&language=&format=
GET    /api/shows/:showId
GET    /api/shows/:showId/seats
POST   /api/shows              { movieId, theatreId, screenId, showTime, language, format, pricing }
DELETE /api/shows/:showId
```

### Bookings (requires auth)

```
POST   /api/bookings           { showId, seatIds, idempotencyKey }
GET    /api/bookings
GET    /api/bookings/:bookingId
DELETE /api/bookings/:bookingId
```

### Payments

```
POST   /api/payments/orders              { bookingId, amount }
POST   /api/payments/verify             { razorpayOrderId, razorpayPaymentId, razorpaySignature }
POST   /api/payments/:paymentId/refund  { amount? }  — admin only
GET    /api/payments/booking/:bookingId
POST   /api/payments/webhook            — Razorpay calls this directly
```

### Create Booking — Request Body

```json
{
  "showId": "SHOW-001",
  "seatIds": ["SCR-XXXXXXXX-A1", "SCR-XXXXXXXX-A2"],
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
}
```

> Generate `idempotencyKey` on the client (UUID v4). Retrying the same request with the
> same key always returns the same booking — no double charges.

---

## Project Structure

```
cinebook/
├── scripts/
│   └── seed.ts                   # One-command DB seeder — movies, theatres, shows, users
├── services/
│   ├── api-gateway/              # JWT auth, rate limiting, circuit breaker, reverse proxy
│   │   └── src/
│   │       ├── config/           # env, logger, redis, circuitBreaker
│   │       ├── docs/
│   │       │   └── swagger.ts    # Full OpenAPI 3.0 spec — served at /api-docs
│   │       ├── middleware/       # correlationId, requestLogger, errorHandler
│   │       └── index.ts
│   ├── user-service/             # Registration, login, JWT, refresh tokens
│   │   └── src/
│   │       ├── models/           # User, RefreshToken
│   │       ├── services/         # authService, userService
│   │       ├── controllers/      # authController, userController
│   │       ├── routes/           # auth, user
│   │       └── __tests__/        # 35 tests
│   ├── booking-service/          # Seat reservation, OCC, expiry worker
│   │   └── src/
│   │       ├── models/           # Booking, Show
│   │       ├── services/         # bookingService, expiryWorker
│   │       ├── events/           # kafkaProducer, rabbitPublisher, kafkaConsumer
│   │       └── __tests__/        # 10 tests
│   ├── show-service/             # Movies, theatres, shows, seat layouts
│   │   └── src/
│   │       ├── models/           # Movie, Theatre, Show
│   │       ├── services/         # movieService, theatreService, showService
│   │       ├── controllers/      # movieController, theatreController, showController
│   │       ├── routes/           # index (movies, theatres, shows)
│   │       └── __tests__/        # 57 tests
│   ├── payment-service/          # Razorpay, webhooks, refunds
│   │   └── src/
│   │       ├── models/           # Payment
│   │       ├── services/         # paymentService
│   │       ├── events/           # kafkaProducer
│   │       └── __tests__/        # 28 tests
│   └── notification-service/     # RabbitMQ consumer, email, SMS
│       └── src/
│           ├── handlers/         # emailHandler, smsHandler
│           ├── config/           # env, logger
│           └── __tests__/        # 17 tests
├── docs/
│   ├── getting-started.md        # Local setup, seed, end-to-end flow
│   ├── architecture.md           # System design and data flow
│   ├── api-reference.md          # All endpoints with schemas
│   ├── event-contracts.md        # Kafka topics + RabbitMQ queue payloads
│   ├── efficiency-and-resilience.md  # Failure scenarios and performance
│   ├── deployment.md             # Free tier hosting guide
│   └── adr/
│       ├── 001-why-microservices.md       # Monolith vs microservices decision
│       ├── 002-why-kafka-and-rabbitmq.md  # Dual broker strategy
│       ├── 003-why-mongodb.md             # Document DB rationale
│       └── 004-idempotency-strategy.md    # Client key vs server dedup
├── infra/
│   └── docker-compose.infra.yml  # MongoDB, Redis, Kafka, Zookeeper, RabbitMQ
└── package.json
```

---

## Free Hosting Guide (Portfolio)

| Service      | Free Tier                                                           |
| ------------ | ------------------------------------------------------------------- |
| **MongoDB**  | [MongoDB Atlas](https://www.mongodb.com/atlas) — 512MB free forever |
| **Redis**    | [Upstash](https://upstash.com) — 10K req/day free                   |
| **Kafka**    | [Upstash Kafka](https://upstash.com/kafka) — 10K msg/day free       |
| **RabbitMQ** | [CloudAMQP](https://www.cloudamqp.com) — 1M msg/month free          |
| **Services** | [Railway](https://railway.app) — $5/month free credit               |
| **Email**    | [Resend](https://resend.com) — 3000 emails/month free               |
| **SMS**      | [Fast2SMS](https://fast2sms.com) — 50 free SMS on signup (India)    |

See [docs/deployment.md](docs/deployment.md) for step-by-step hosting instructions.

---

## Tech Stack

| Layer           | Technology                                                        |
| --------------- | ----------------------------------------------------------------- |
| Runtime         | Node.js 20, TypeScript 5                                          |
| Framework       | Express 4                                                         |
| Event streaming | Apache Kafka (KafkaJS) — durable, ordered, replayable             |
| Message queue   | RabbitMQ (amqplib) — fanout, priority, DLQ                        |
| Database        | MongoDB 7 + Mongoose                                              |
| Cache / Locks   | Redis 7                                                           |
| Auth            | JWT — access 15m + refresh 7d with rotation + family invalidation |
| Payments        | Razorpay — orders, webhook, refunds                               |
| Email           | Nodemailer + Ethereal (dev) / Resend (prod)                       |
| Logging         | Winston — JSON structured with sensitive field redaction          |
| Validation      | Joi (env) + express-validator (routes)                            |
| Testing         | Jest + ts-jest + Supertest — 147 tests, fully mocked              |
| API Docs        | Swagger UI (OpenAPI 3.0) — served at `/api-docs`                  |
| Infrastructure  | Docker + Docker Compose                                           |

---

## Author

**Jaspreet Singh** — jaspreet9273@gmail.com
