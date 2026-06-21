# Getting Started

## Prerequisites

- Node.js 20+
- Docker Desktop (for Kafka, RabbitMQ, Redis, MongoDB)
- mongosh (for seeding)

---

## Step 1 — Clone and install

```bash
git clone <your-repo>
cd cinebook
```

Install dependencies for each service:

```bash
cd services/api-gateway          && npm install && cd ../..
cd services/user-service         && npm install && cd ../..
cd services/show-service         && npm install && cd ../..
cd services/booking-service      && npm install && cd ../..
cd services/payment-service      && npm install && cd ../..
cd services/notification-service && npm install && cd ../..
```

---

## Step 2 — Start infrastructure

```bash
cd infra
docker compose -f docker-compose.infra.yml up -d
```

Wait ~30 seconds for Kafka to initialize. Check all containers are healthy:

```bash
docker compose -f docker-compose.infra.yml ps
```

Infrastructure UIs:

- Kafka UI → http://localhost:8080
- RabbitMQ → http://localhost:15672 (admin / password)

---

## Step 3 — Configure environment

Each service has a `.env` file with working defaults for local development.

**The only thing you must set** is Razorpay keys in `services/payment-service/.env`:

```dotenv
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
```

Get free test keys at https://dashboard.razorpay.com (Settings → API Keys).

---

## Step 4 — Run tests (optional but recommended)

Verify everything is wired up correctly before starting services:

```bash
cd services/user-service         && npm test && cd ../..
cd services/booking-service      && npm test && cd ../..
cd services/show-service         && npm test && cd ../..
cd services/payment-service      && npm test && cd ../..
cd services/notification-service && npm test && cd ../..
```

Expected output: **147 tests passing** across all 5 services. Tests are fully mocked — no infrastructure needed to run them.

---

## Step 5 — Start services

Open 6 terminal tabs, one per service:

```bash
# Tab 1
cd services/api-gateway && npm run dev

# Tab 2
cd services/user-service && npm run dev

# Tab 3
cd services/show-service && npm run dev

# Tab 4
cd services/booking-service && npm run dev

# Tab 5
cd services/payment-service && npm run dev

# Tab 6
cd services/notification-service && npm run dev
```

All services should show a connected message within a few seconds.

---

## Step 6 — Seed test data

```bash
# Register an admin user
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"Admin1234"}' | jq .

# Promote to admin via mongosh
mongosh movie_booking --eval \
  'db.users.updateOne({email:"admin@test.com"},{$set:{role:"admin"}})'

# Login and capture token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Admin1234"}' | jq -r .accessToken)

# Create a movie
curl -s -X POST http://localhost:3000/api/movies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Inception",
    "description": "A mind-bending thriller",
    "genre": ["Sci-Fi","Thriller"],
    "language": ["English","Hindi"],
    "duration": 148,
    "rating": "UA",
    "director": "Christopher Nolan",
    "releaseDate": "2010-07-16"
  }' | jq .

# Create a theatre
curl -s -X POST http://localhost:3000/api/theatres \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PVR Cinemas",
    "city": "Chandigarh",
    "address": "Sector 17",
    "pincode": "160017",
    "screens": [{
      "name": "Screen 1",
      "totalSeats": 30,
      "formats": ["2D","3D"],
      "rows": [
        {"row":"A","count":10,"type":"standard"},
        {"row":"B","count":10,"type":"premium"},
        {"row":"C","count":10,"type":"recliner"}
      ]
    }]
  }' | jq .
```

Note the `movieId`, `theatreId`, and `screenId` from the responses, then create a show:

```bash
curl -s -X POST http://localhost:3000/api/shows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "movieId": "MOV-XXXXXXXX",
    "theatreId": "THR-XXXXXXXX",
    "screenId": "SCR-XXXXXXXX",
    "showTime": "2025-12-25T14:30:00.000Z",
    "language": "English",
    "format": "2D",
    "pricing": {"standard":250,"premium":400,"recliner":600,"couple":700}
  }' | jq .
```

---

## Step 7 — End-to-end booking flow

```bash
# Register a regular user
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jaspreet","email":"jaspreet@test.com","password":"Test1234"}' | jq .

USER_TOKEN=<accessToken from above>

# Browse shows
curl -s "http://localhost:3000/api/shows" | jq .

# View seat map
curl -s "http://localhost:3000/api/shows/SHOW-XXXXXXXX/seats" | jq .

# Create booking (generate a UUID for idempotencyKey)
curl -s -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "showId": "SHOW-XXXXXXXX",
    "seatIds": ["SCR-XXXXXXXX-A1","SCR-XXXXXXXX-A2"],
    "idempotencyKey": "'$(uuidgen)'"
  }' | jq .

# Create payment order
curl -s -X POST http://localhost:3000/api/payments/orders \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "BKG-XXXXXXXX",
    "amount": 510
  }' | jq .
```

> After creating a payment order, use the returned `razorpayOrderId` and `razorpayKeyId`
> to open the Razorpay checkout modal on the frontend. Once paid, call `POST /api/payments/verify`
> with the signature returned by Razorpay.

---

## Step 8 — Preview email notifications (dev)

The notification service uses Ethereal for email in development — no real emails are sent.
Look for a log line like:

```
{"message":"Email sent","previewUrl":"https://ethereal.email/message/XXXX"}
```

Open that URL in your browser to see the rendered email.

---

## Port Reference

| Service              | Port        |
| -------------------- | ----------- |
| API Gateway          | 3000        |
| Booking Service      | 3001        |
| Payment Service      | 3002        |
| Show Service         | 3003        |
| User Service         | 3004        |
| Notification Service | — (no HTTP) |
| MongoDB              | 27017       |
| Redis                | 6379        |
| Kafka                | 9092        |
| Kafka UI             | 8080        |
| RabbitMQ             | 5672        |
| RabbitMQ UI          | 15672       |

---

## Common Issues

**Kafka not ready** — Wait 30s after `infra:up` before starting services. If booking-service
logs `ECONNREFUSED`, restart it after Kafka is healthy.

**Port already in use** — Another process is using the port. Find and kill it:

```bash
lsof -ti:3001 | xargs kill
```

**MongoDB connection refused** — Make sure Docker Desktop is running and `infra:up` completed successfully.

**Seat IDs not found** — Seat IDs include the screen prefix (e.g. `SCR-XXXXXXXX-A1`). Get
the correct IDs from `GET /api/shows/:showId/seats` before booking.
