# System Architecture

## Overview

CineBook is a production-grade movie ticket booking system built as a microservices architecture. Each service owns its domain, communicates asynchronously via Kafka and RabbitMQ, and is independently deployable.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Web/Mobile)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       API Gateway :3000                      │
│  • JWT verification        • Circuit breaker per service      │
│  • Rate limiting          • Request correlation IDs          │
│  • CORS / Helmet          • Graceful shutdown                │
│  • Reverse proxy          • /health/ready + /health/metrics  │
└───┬───────────┬───────────┬──────────────┬───────────────────┘
    │           │           │              │
    ▼           ▼           ▼              ▼
┌───────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐
│ User  │ │  Show   │ │Booking  │ │   Payment    │
│ :3004 │ │  :3003  │ │  :3001  │ │    :3002     │
│       │ │         │ │         │ │              │
│ Auth  │ │ Movies  │ │Seat lock│ │  Razorpay    │
│ JWT   │ │Theatres │ │Idempot. │ │  Webhook     │
│ Bcrypt│ │ Shows   │ │OCC      │ │  Refunds     │
└───┬───┘ └────┬────┘ └────┬────┘ └──────┬───────┘
    │          │           │             │
    └──────────┴─────┬─────┴─────────────┘
                     │ Kafka (async events)
                     ▼
        ┌────────────────────────┐
        │      Apache Kafka      │
        │  booking.created       │
        │  booking.confirmed      │
        │  booking.cancelled     │
        │  payment.success       │
        │  payment.failed        │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │       RabbitMQ         │
        │  notifications.fanout   │
        │  email.notifications    │
        │  sms.notifications      │
        │  dead-letter.exchange  │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Notification :3005     │
        │  Email (Nodemailer)    │
        │  SMS (Fast2SMS/Twilio) │
        │  Retry + DLQ           │
        └────────────────────────┘

Shared Infrastructure:
  MongoDB  — bookings, users, shows, movies, theatres, payments
  Redis    — JWT blacklist, distributed seat locks, rate limit store
```

## Service Responsibilities

| Service              | Port | Responsibility                                    |
| -------------------- | ---- | ------------------------------------------------- |
| api-gateway          | 3000 | Auth, routing, rate limiting, circuit breaking    |
| user-service         | 3004 | Registration, login, JWT issuance, refresh tokens |
| show-service         | 3003 | Movies, theatres, shows, seat layouts             |
| booking-service      | 3001 | Seat reservation, idempotent booking, hold expiry |
| payment-service      | 3002 | Razorpay orders, signature verification, refunds  |
| notification-service | 3005 | Email/SMS via RabbitMQ consumer                   |

## Data Flow: Booking a Ticket

```
1. User logs in          → user-service issues JWT
2. Browse shows          → show-service returns available shows
3. Select seats          → show-service returns seat map
4. Create booking        → booking-service:
                            a. Checks idempotency key (no duplicate)
                            b. Acquires Redis distributed lock on seats
                            c. Validates seats still available
                            d. MongoDB transaction: reserve seats + create booking
                            e. Releases lock
                            f. Publishes booking.created to Kafka
5. Initiate payment      → payment-service creates Razorpay order
6. User pays             → Razorpay checkout (frontend)
7. Verify payment        → payment-service:
                            a. Verifies HMAC-SHA256 signature
                            b. Marks payment success
                            c. Publishes payment.success to Kafka
8. Confirm booking       → booking-service consumes payment.success:
                            a. Updates booking status → confirmed
                            b. Publishes booking.confirmed to Kafka
9. Send notification     → notification-service consumes via RabbitMQ:
                            a. Sends confirmation email (Ethereal/Resend)
                            b. Sends SMS (Fast2SMS/Twilio)
```

## Key Production Patterns

### Idempotency

Every `POST /api/bookings` requires a client-generated `idempotencyKey` (UUID v4).
The server returns the same response for duplicate requests — no double bookings on retry.

### Optimistic Concurrency Control (OCC)

The `Show` document carries a `version` field. Seat reservation uses a MongoDB
`findOneAndUpdate` with `version: currentVersion` in the filter. If another request
updated the document concurrently, the version won't match and the update fails safely.

### Distributed Locking

Redis `SET NX EX` acquires a lock on seat combinations before reservation.
A Lua script ensures atomic check-and-delete on release (prevents releasing another process's lock).

### Circuit Breaker

The API Gateway maintains a circuit breaker per downstream service.
After 5 failures it opens (fail-fast 502), attempts a probe after 30s, closes on success.

### At-Least-Once Kafka

Consumers commit offsets manually only after successful processing.
Failed messages are retried; after max retries they go to a Dead Letter Queue.
