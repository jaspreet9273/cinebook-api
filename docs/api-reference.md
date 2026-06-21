# API Reference

Base URL: `http://localhost:3000`

All protected routes require:

```
Authorization: Bearer <accessToken>
```

---

## Auth — `/api/auth`

### POST /api/auth/register

Create a new user account.

**Body**

```json
{
  "name": "Jaspreet Singh",
  "email": "jaspreet@example.com",
  "password": "Test1234",
  "phone": "9876543210"
}
```

**Response 201**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "userId": "usr_abc",
    "name": "Jaspreet Singh",
    "email": "...",
    "role": "user"
  }
}
```

---

### POST /api/auth/login

```json
{ "email": "jaspreet@example.com", "password": "Test1234" }
```

---

### POST /api/auth/refresh

```json
{ "refreshToken": "eyJ..." }
```

---

### POST /api/auth/logout

```json
{ "refreshToken": "eyJ..." }
```

---

### GET /api/auth/me 🔒

Returns the logged-in user's profile.

---

## Movies — `/api/movies`

### GET /api/movies

List all active movies.

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| genre | string | Filter by genre |
| language | string | Filter by language |
| search | string | Full-text search |
| page | number | Default 1 |
| limit | number | Default 20, max 50 |

---

### GET /api/movies/:movieId

Get movie details.

---

### POST /api/movies 🔒 (admin)

Create a movie.

**Body**

```json
{
  "title": "Inception",
  "description": "A mind-bending thriller",
  "genre": ["Sci-Fi", "Thriller"],
  "language": ["English", "Hindi"],
  "duration": 148,
  "rating": "UA",
  "director": "Christopher Nolan",
  "releaseDate": "2010-07-16",
  "posterUrl": "https://...",
  "cast": ["Leonardo DiCaprio", "Ellen Page"]
}
```

---

### PATCH /api/movies/:movieId 🔒 (admin)

Update movie fields.

---

### DELETE /api/movies/:movieId 🔒 (admin)

Deactivate a movie (soft delete).

---

## Theatres — `/api/theatres`

### GET /api/theatres?city=Chandigarh

List theatres by city.

---

### GET /api/theatres/:theatreId

Get theatre details including screens and seat layout.

---

### POST /api/theatres 🔒 (admin)

Create a theatre with screens.

**Body**

```json
{
  "name": "PVR Cinemas",
  "city": "Chandigarh",
  "address": "Sector 17, Chandigarh",
  "pincode": "160017",
  "amenities": ["Parking", "Food Court"],
  "screens": [
    {
      "name": "Screen 1",
      "totalSeats": 120,
      "formats": ["2D", "3D"],
      "rows": [
        { "row": "A", "count": 10, "type": "standard" },
        { "row": "B", "count": 10, "type": "standard" },
        { "row": "C", "count": 8, "type": "premium" },
        { "row": "D", "count": 4, "type": "recliner" }
      ]
    }
  ]
}
```

---

## Shows — `/api/shows`

### GET /api/shows

List upcoming shows.

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| movieId | string | Filter by movie |
| theatreId | string | Filter by theatre |
| date | string | YYYY-MM-DD |
| language | string | |
| format | string | 2D, 3D, IMAX, 4DX |

---

### GET /api/shows/:showId

Get show details (without seats).

---

### GET /api/shows/:showId/seats

Get full seat map for a show. Use this to render the seat selection UI.

**Response**

```json
{
  "showId": "SHOW-001",
  "availableSeats": 87,
  "seats": [
    {
      "seatId": "A1",
      "row": "A",
      "number": 1,
      "type": "standard",
      "price": 250,
      "status": "available"
    },
    {
      "seatId": "A2",
      "row": "A",
      "number": 2,
      "type": "standard",
      "price": 250,
      "status": "reserved"
    }
  ]
}
```

---

### POST /api/shows 🔒 (admin)

Create a show.

**Body**

```json
{
  "movieId": "MOV-ABC123",
  "theatreId": "THR-ABC123",
  "screenId": "SCR-ABC123",
  "showTime": "2024-12-25T14:30:00.000Z",
  "language": "Hindi",
  "format": "3D",
  "pricing": {
    "standard": 250,
    "premium": 400,
    "recliner": 600,
    "couple": 700
  }
}
```

---

## Bookings — `/api/bookings` 🔒

### POST /api/bookings

Create a booking. Seats are held for 10 minutes pending payment.

**⚠️ Generate `idempotencyKey` on the client (UUID v4). Retrying with the same key returns the same result — no double bookings.**

**Body**

```json
{
  "showId": "SHOW-ABC123",
  "seatIds": ["A1", "A2"],
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response 201**

```json
{
  "bookingId": "BKG-1234567890-ABCD1234",
  "status": "pending",
  "totalAmount": 510,
  "convenienceFee": 10,
  "currency": "INR",
  "expiresAt": "2024-12-25T15:00:00.000Z",
  "seats": [...],
  "isIdempotentReplay": false
}
```

---

### GET /api/bookings

List my bookings (paginated).

**Query params:** `page`, `limit`

---

### GET /api/bookings/:bookingId

Get booking details.

---

### DELETE /api/bookings/:bookingId

Cancel a booking.

**Body**

```json
{ "reason": "Changed plans" }
```

---

## Payments — `/api/payments` 🔒

### POST /api/payments/orders

Create a Razorpay order. Returns `razorpayOrderId` and `razorpayKeyId` for frontend checkout.

**Body**

```json
{ "bookingId": "BKG-...", "amount": 510 }
```

**Response**

```json
{
  "paymentId": "PAY-...",
  "razorpayOrderId": "order_xxx",
  "razorpayKeyId": "rzp_test_xxx",
  "amount": 510,
  "currency": "INR"
}
```

---

### POST /api/payments/verify

Verify payment after Razorpay checkout completes.

**Body**

```json
{
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "abc123..."
}
```

---

### POST /api/payments/:paymentId/refund 🔒 (admin)

Initiate a refund.

**Body**

```json
{ "amount": 510 }
```

---

### GET /api/payments/booking/:bookingId

Get payment status for a booking.

---

### POST /api/payments/webhook

Razorpay webhook endpoint. Must be public (use ngrok in dev).
Verifies `X-Razorpay-Signature` header.

---

## Health

### GET /health

Liveness probe. Always returns 200 if process is alive.

### GET /health/ready

Readiness probe. Returns 200 (ok) or 503 (degraded).
Checks Redis connectivity and circuit breaker states.

### GET /health/metrics

Prometheus-format metrics: uptime, heap, circuit breaker states.
