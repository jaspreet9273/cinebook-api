# Event Contracts

This document defines all Kafka topics and RabbitMQ queues used across services.

---

## Kafka Topics

### `booking.created`

**Publisher:** booking-service  
**Consumers:** payment-service  
**When:** A booking is created and seats are held (status: pending)

```json
{
  "eventId": "uuid-v4",
  "correlationId": "uuid-v4",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0",
  "source": "booking-service",
  "type": "booking.created",
  "payload": {
    "bookingId": "BKG-1234567890-ABCD1234",
    "userId": "usr_abc123",
    "showId": "SHOW-ABC123",
    "movieId": "MOV-ABC123",
    "theatreId": "THR-ABC123",
    "seatIds": ["A1", "A2"],
    "totalAmount": 510,
    "currency": "INR",
    "expiresAt": "2024-01-01T00:10:00.000Z"
  }
}
```

---

### `booking.confirmed`

**Publisher:** booking-service  
**Consumers:** notification-service  
**When:** Payment is verified and booking is confirmed

```json
{
  "type": "booking.confirmed",
  "payload": {
    "bookingId": "BKG-...",
    "userId": "usr_...",
    "paymentId": "PAY-...",
    "confirmationCode": "CONF-XXXX",
    "seats": [{ "seatId": "A1", "row": "A", "number": 1, "type": "standard" }],
    "movieTitle": "Inception",
    "showTime": "2024-12-25T14:30:00.000Z",
    "theatreName": "PVR Cinemas",
    "userEmail": "user@example.com"
  }
}
```

---

### `booking.cancelled`

**Publisher:** booking-service  
**Consumers:** notification-service, payment-service (for refund)  
**When:** User cancels, payment fails, or hold expires

```json
{
  "type": "booking.cancelled",
  "payload": {
    "bookingId": "BKG-...",
    "userId": "usr_...",
    "reason": "user_cancelled | payment_failed | expired | admin",
    "refundAmount": 510
  }
}
```

---

### `payment.initiated`

**Publisher:** payment-service  
**When:** Razorpay order created

---

### `payment.success`

**Publisher:** payment-service  
**Consumers:** booking-service (to confirm booking)  
**When:** Razorpay signature verified

```json
{
  "type": "payment.success",
  "payload": {
    "paymentId": "PAY-...",
    "bookingId": "BKG-...",
    "userId": "usr_...",
    "amount": 510,
    "razorpayPaymentId": "pay_xxx"
  }
}
```

---

### `payment.failed`

**Publisher:** payment-service  
**Consumers:** booking-service (to cancel booking and release seats)

```json
{
  "type": "payment.failed",
  "payload": {
    "paymentId": "PAY-...",
    "bookingId": "BKG-...",
    "userId": "usr_...",
    "reason": "Signature verification failed",
    "errorCode": "INVALID_SIGNATURE"
  }
}
```

---

## Kafka Partition Strategy

Messages are keyed by `showId` where possible. This ensures all events for the
same show land on the same partition, preserving ordering for seat state changes.

---

## RabbitMQ

### Exchange: `notifications.fanout`

**Type:** fanout  
**Durable:** yes  
**Publisher:** booking-service, payment-service  
**Bound queues:** `email.notifications`, `sms.notifications`

Every notification published to this exchange is delivered to **both** queues.
Each consumer decides whether to act based on `message.type`.

---

### Queue: `email.notifications`

**Consumer:** notification-service  
**DLQ:** `dead-letter.exchange`  
**Max retries:** 3

Message shape:

```json
{
  "type": "email",
  "to": "user@example.com",
  "templateId": "booking_confirmed",
  "variables": {
    "bookingId": "BKG-...",
    "movieTitle": "Inception",
    "showTime": "25 Dec 2024, 2:30 PM",
    "theatreName": "PVR Cinemas",
    "seats": "A1, A2",
    "confirmationCode": "CONF-XXXX",
    "amount": 510
  },
  "correlationId": "uuid-v4"
}
```

---

### Queue: `sms.notifications`

**Consumer:** notification-service  
Same shape as email but `"type": "sms"` and `to` is a phone number.

---

### Queue: `booking.dead-letter`

Messages that failed all retries land here for manual inspection or replay.

---

## Email Templates

| templateId          | When sent                    |
| ------------------- | ---------------------------- |
| `booking_pending`   | Seats held, awaiting payment |
| `booking_confirmed` | Payment successful           |
| `booking_cancelled` | Booking cancelled            |
| `booking_reminder`  | 2 hours before show          |
