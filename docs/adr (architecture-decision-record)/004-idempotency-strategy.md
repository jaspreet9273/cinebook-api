# ADR 004 — Idempotency Strategy

**Date:** 2024  
**Status:** Accepted

## Context

Movie ticket booking has a classic double-spend problem. If a user taps "Book"
and the network times out, they might tap again. Without idempotency, this creates
two bookings and charges the user twice.

We needed a strategy that handles retries safely at every layer.

## Decision

Client-supplied idempotency keys on booking creation, combined with server-side
deduplication stored in MongoDB.

## How it works

**1. Client generates a UUID v4 before sending the request:**
```
POST /api/bookings
{ "showId": "...", "seatIds": [...], "idempotencyKey": "550e8400-..." }
```

The key is generated once per booking attempt on the client (React/mobile app).
On retry (network timeout, app crash), the same key is resent.

**2. Server checks for existing booking with that key:**
```typescript
const existing = await Booking.findOne({ idempotencyKey });
if (existing) return { booking: existing, isNew: false };
```

The response includes `isIdempotentReplay: true` so the client knows it's a replay.

**3. The key is stored with a unique index in MongoDB:**
```typescript
idempotencyKey: { type: String, required: true, unique: true }
```

A duplicate key error on concurrent requests is caught and handled gracefully.

## Why client-supplied keys?

The alternative is server-generated keys — the client first requests a key,
then uses it. This adds a round-trip and complexity.

Client-supplied keys are simpler: the client generates a UUID before any
network call, uses it in the request, and retries with the same UUID.
This is the same pattern used by Stripe and Razorpay.

## Scope

Idempotency keys apply to:
- `POST /api/bookings` — prevents duplicate bookings
- Kafka events — the Kafka producer uses `idempotent: true` mode which deduplicates
  at the broker level using sequence numbers
- RabbitMQ consumers — notification handlers are idempotent by design
  (sending a duplicate confirmation email is acceptable; charging twice is not)

## Tradeoffs Accepted

- **Client must generate UUIDs** — This is a small frontend requirement but is
  standard practice (Stripe, Razorpay, Twilio all require it).

- **Keys are never expired** — Idempotency keys live as long as the booking document.
  In a higher-scale system you'd expire keys after 24 hours using a Redis TTL.
  For this project the MongoDB unique index is sufficient.
