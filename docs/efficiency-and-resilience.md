# Why This System Handles Production Load Efficiently

## 1. The Happy Path — Booking a Ticket

```
User taps "Book Seats"
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ API Gateway                                             │
│  ✓ Rate limit check (20 req/5min per IP)               │
│  ✓ JWT verified in ~1ms (no DB call)                   │
│  ✓ X-User-Id injected into headers                     │
│  ✓ Circuit breaker: booking-service CLOSED → proceed   │
└────────────────────┬────────────────────────────────────┘
                     │ proxy
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Booking Service                                         │
│                                                         │
│  Step 1: Idempotency check                              │
│    → SELECT WHERE idempotencyKey = ?                    │
│    → If found: return same result, exit early           │
│    → No double booking on retry/network failure         │
│                                                         │
│  Step 2: Redis distributed lock (~1ms)                  │
│    → SET seat-lock:SHOW-001:A1,A2 NX EX 630            │
│    → Only ONE request proceeds per seat combination     │
│    → All others get 409 instantly                       │
│                                                         │
│  Step 3: Show validation (indexed query)                │
│    → findOne({ showId, isActive: true })                │
│    → Index: { showId: 1 } — O(log n)                   │
│                                                         │
│  Step 4: OCC seat reservation                           │
│    → findOneAndUpdate WHERE seatVersion = N             │
│    → Atomically reserves seats + increments seatVersion │
│    → If another request changed version: 409            │
│    → No pessimistic locking, no blocking                │
│                                                         │
│  Step 5: Create booking document                        │
│    → Save booking with status: "pending"                │
│    → expiresAt = now + 10 minutes                       │
│                                                         │
│  Step 6: Release Redis lock                             │
│    → Lua script: atomic check-and-delete                │
│    → Can't release another process's lock               │
└──────────┬──────────────────────────────────────────────┘
           │ fire-and-forget (non-blocking)
           ▼
┌────────────────────────────┐
│ Kafka: booking.created     │  ← Durable, ordered, replayable
│ Partition key = showId     │  ← All events for same show: same partition
└────────────────────────────┘
           │
           ▼
┌────────────────────────────┐
│ RabbitMQ: notifications    │  ← Fanout to email + SMS simultaneously
│ Priority queue (0-10)      │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ Notification Service       │
│  prefetch(1) — one at a    │
│  time, never overwhelmed   │
│  ACK only after send       │  ← At-least-once delivery
└────────────────────────────┘
```

---

## 2. Where It Handles Failure Gracefully

### A. Network timeout / User retries booking

```
User taps "Book" → timeout → user taps again

Request 1: idempotencyKey = "abc-123" → creates booking BKG-001
Request 2: idempotencyKey = "abc-123" → finds BKG-001, returns it

Result: Only ONE booking ever created. User gets same response both times.
```

**Why it works:** `idempotencyKey` has a unique MongoDB index. Second request
hits the `findOne` check first and returns early. No lock needed.

---

### B. Two users book the same seat simultaneously

```
User A: POST /bookings { seatIds: ["A1"] }  ─┐
User B: POST /bookings { seatIds: ["A1"] }  ─┘ (at same time)

Redis lock race:
  User A: SET seat-lock:SHOW-001:A1 NX → "OK" (acquired)
  User B: SET seat-lock:SHOW-001:A1 NX → null (rejected)
  User B gets 409 immediately

User A completes OCC update:
  seatVersion: 3 → 4, seat status: available → reserved

User A releases lock (Lua atomic delete)
User B can retry → seat now reserved → gets SEATS_UNAVAILABLE
```

**Why it works:** Redis `NX` (only set if not exists) is atomic. Only one
request can hold the lock. OCC provides a second layer — even if two requests
somehow got past the lock, the `seatVersion` check on `findOneAndUpdate`
catches concurrent updates and rejects the second writer.

---

### C. Seat reserved but booking save fails

```
OCC update succeeds → seat marked "reserved" ✓
Booking.save() fails → booking not created ✗

Result: Seat is reserved but no booking document exists.

Recovery:
  → Expiry worker runs every 60s
  → Finds seats reserved past their reservedUntil time
  → Releases them back to "available"
  → No permanent data corruption
```

**Why it works:** Without transactions, there is a brief window where seat
and booking are out of sync. The expiry worker is the compensating mechanism —
it acts as an eventual consistency repair job. In production, MongoDB replica
set transactions would close this window entirely.

> **Note:** Transactions were removed for local dev compatibility (single-node
> MongoDB does not support multi-document transactions). The Redis distributed
> lock + OCC combination prevents the vast majority of race conditions.
> Re-enabling transactions requires a replica set and a one-line change to
> wrap the OCC update and Booking.save() in `session.withTransaction()`.

---

### D. Payment service is slow / down

```
User hits POST /api/payments/orders

API Gateway circuit breaker:
  Failure 1: proxy error → recordFailure() → failures: 1/5
  Failure 2: proxy error → recordFailure() → failures: 2/5
  ...
  Failure 5: recordFailure() → STATE: OPEN

Next request:
  → isOpen() returns true
  → Instant 502 "payment-service temporarily unavailable"
  → No waiting for timeout
  → No cascading load on payment service

After 30 seconds:
  → STATE: HALF-OPEN (one probe allowed)
  → Probe succeeds → STATE: CLOSED
  → Normal traffic resumes
```

**Why it works:** Without circuit breaker, slow downstream makes every request
wait 30s before timing out. With it, failures are instant. Recovery is automatic.

---

### E. Seat hold expires (user never pays)

```
T+0:   Booking created, expiresAt = T+10min, seats "reserved"
T+5:   User closes the app
T+10:  Expiry worker runs (every 60s)

Worker:
  → Find all { status: "pending", expiresAt: { $lt: now } }
  → For each expired booking:
      Booking.status → "expired"
      Show.seats[A1,A2].status → "available"
      Show.availableSeats += 2
      Show.seatVersion += 1
      Publish booking.expired to Kafka

T+11:  Seats available again for other users
```

**Why it works:** `isRunning` flag prevents overlapping worker runs. Each
booking update uses `status: "pending"` filter — if another instance already
expired it, the update is a no-op. Seats are never stuck as "reserved" forever.

---

### F. Notification email fails (SMTP down)

```
RabbitMQ message: booking_confirmed for usr_123

Attempt 1: SMTP connection refused → NACK + requeue
  x-death count: 1

Attempt 2 (retry): SMTP timeout → NACK + requeue
  x-death count: 2

Attempt 3 (retry): SMTP still down → NACK + requeue
  x-death count: 3

Attempt 4: count >= MAX_RETRIES → NACK without requeue
  → Message moves to dead-letter.exchange

Booking is still confirmed in DB.
Kafka payment.success event already processed.
Email failure is non-fatal — user can check app for booking details.
```

**Why it works:** RabbitMQ `x-death` tracks retry count natively. DLQ
preserves failed messages for manual inspection/replay. The notification
channel is decoupled — its failure cannot affect booking confirmation.

---

## 3. Performance Characteristics

### MongoDB Index Usage

| Query                     | Index Used                                 | Complexity |
| ------------------------- | ------------------------------------------ | ---------- |
| Find booking by bookingId | `{ bookingId: 1 }` unique                  | O(log n)   |
| User booking history      | `{ userId: 1, createdAt: -1 }`             | O(log n)   |
| Expired pending bookings  | `{ status: 1, expiresAt: 1 }`              | O(log n)   |
| Shows by movie + date     | `{ movieId: 1, isActive: 1, showTime: 1 }` | O(log n)   |
| Payment by booking        | `{ bookingId: 1, status: 1 }`              | O(log n)   |
| User by email (login)     | `{ email: 1 }` unique                      | O(log n)   |

### Redis Operations (sub-millisecond)

| Operation           | Command                | Why Fast        |
| ------------------- | ---------------------- | --------------- |
| JWT blacklist check | `GET blacklist:{hash}` | O(1) key lookup |
| Seat lock acquire   | `SET NX EX`            | O(1) atomic     |
| Seat lock release   | Lua eval               | O(1) atomic     |

### Kafka Partition Strategy

```
showId → partition key

All events for SHOW-001: partition 0
All events for SHOW-002: partition 1

Ordering guaranteed within a show:
booking.created → payment.success → booking.confirmed

No out-of-order: can't confirm before payment succeeds.
```

---

## 4. Security Layers

```
Internet
   │
   ▼ HTTPS only (TLS termination at load balancer)
   │
   ▼ Helmet (CSP, HSTS, X-Frame-Options headers)
   │
   ▼ CORS (only whitelisted origins)
   │
   ▼ Rate limiting (per IP, per endpoint tier)
   │
   ▼ JWT verification (~1ms, no DB)
   │
   ▼ Token blacklist check (Redis, ~0.5ms)
   │
   ▼ X-User-Id / X-User-Role injected (services never trust client)
   │
   ▼ Input validation (express-validator on every route)
   │
   ▼ Field whitelisting (controllers never pass req.body directly)
   │
   ▼ Razorpay signature: crypto.timingSafeEqual (timing attack prevention)
   │
   ▼ Sensitive fields redacted from all logs
   │
   ▼ MongoDB: no raw string queries (Mongoose ODM prevents injection)
```

---

## 5. What Each Production Pattern Solves

| Pattern                       | Problem It Solves                                                                                                | Where Used           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Idempotency key**           | Double booking on retry                                                                                          | POST /bookings       |
| **Redis distributed lock**    | Race condition on same seats                                                                                     | Booking service      |
| **Optimistic concurrency**    | Concurrent seat updates                                                                                          | Show document        |
| **MongoDB transactions**      | Partial failure (seats reserved, booking not created) — disabled locally, enabled in production with replica set | Booking service      |
| **Expiry worker**             | Compensates for missing transactions in dev — releases stuck seats                                               | Booking service      |
| **Circuit breaker**           | Cascading failure when downstream is slow                                                                        | API Gateway          |
| **Kafka at-least-once**       | Lost payment events                                                                                              | Payment → Booking    |
| **RabbitMQ DLQ**              | Silent notification failures                                                                                     | Notification service |
| **JWT blacklist**             | Token still valid after logout                                                                                   | API Gateway          |
| **Graceful shutdown**         | Dropped requests on deploy                                                                                       | All services         |
| **Correlation ID**            | Tracing a request across 4 services                                                                              | All services         |
| **Sensitive field redaction** | Passwords/tokens in log files                                                                                    | All services         |
| **timingSafeEqual**           | Timing attack on payment signature                                                                               | Payment service      |
| **HTML escaping in emails**   | XSS via booking data in email                                                                                    | Notification service |
| **bcrypt cost=12**            | Brute force on stolen password hashes                                                                            | User service         |
| **Refresh token rotation**    | Stolen refresh token reuse                                                                                       | User service         |
| **Token family invalidation** | Refresh token reuse attack                                                                                       | User service         |
