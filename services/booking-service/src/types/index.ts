// ─── Kafka Topics ────────────────────────────────────────────────────────────
export const KAFKA_TOPICS = {
  BOOKING_CREATED: "booking.created",
  BOOKING_CONFIRMED: "booking.confirmed",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_EXPIRED: "booking.expired",
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_SUCCESS: "payment.success",
  PAYMENT_FAILED: "payment.failed",
  SEATS_RESERVED: "seats.reserved",
  SEATS_RELEASED: "seats.released",
  NOTIFICATION_EMAIL: "notification.email",
  NOTIFICATION_SMS: "notification.sms",
} as const;

// ─── RabbitMQ Queues ─────────────────────────────────────────────────────────
export const RABBIT_QUEUES = {
  EMAIL_NOTIFICATIONS: "email.notifications",
  SMS_NOTIFICATIONS: "sms.notifications",
  BOOKING_DLQ: "booking.dead-letter",
  PAYMENT_DLQ: "payment.dead-letter",
} as const;

export const RABBIT_EXCHANGES = {
  NOTIFICATIONS: "notifications.fanout",
  BOOKING_EVENTS: "booking.events.topic",
  DLQ: "dead-letter.exchange",
} as const;

// ─── Event Payloads ───────────────────────────────────────────────────────────
export interface BaseEvent {
  eventId: string; // UUID v4
  correlationId: string; // Trace ID across services
  timestamp: string; // ISO 8601
  version: string; // Event schema version e.g. "1.0"
  source: string; // Service name
}

export interface BookingCreatedEvent extends BaseEvent {
  type: "booking.created";
  payload: {
    bookingId: string;
    userId: string;
    showId: string;
    movieId: string;
    theatreId: string;
    seatIds: string[];
    totalAmount: number;
    currency: string;
    expiresAt: string; // Booking hold expiry (e.g. 10 min)
  };
}

export interface BookingConfirmedEvent extends BaseEvent {
  type: "booking.confirmed";
  payload: {
    bookingId: string;
    userId: string;
    paymentId: string;
    confirmationCode: string;
    seats: Array<{ seatId: string; row: string; number: number; type: string }>;
    movieTitle: string;
    showTime: string;
    theatreName: string;
    userEmail: string;
    userPhone?: string;
  };
}

export interface BookingCancelledEvent extends BaseEvent {
  type: "booking.cancelled";
  payload: {
    bookingId: string;
    userId: string;
    reason: "user_cancelled" | "payment_failed" | "expired" | "admin";
    refundAmount?: number;
  };
}

export interface PaymentInitiatedEvent extends BaseEvent {
  type: "payment.initiated";
  payload: {
    paymentId: string;
    bookingId: string;
    userId: string;
    amount: number;
    currency: string;
    provider: "stripe" | "razorpay";
    providerOrderId: string;
  };
}

export interface PaymentSuccessEvent extends BaseEvent {
  type: "payment.success";
  payload: {
    paymentId: string;
    bookingId: string;
    userId: string;
    amount: number;
    providerTransactionId: string;
  };
}

export interface PaymentFailedEvent extends BaseEvent {
  type: "payment.failed";
  payload: {
    paymentId: string;
    bookingId: string;
    userId: string;
    reason: string;
    errorCode?: string;
  };
}

export interface SeatsReservedEvent extends BaseEvent {
  type: "seats.reserved";
  payload: {
    bookingId: string;
    showId: string;
    seatIds: string[];
    reservedUntil: string;
  };
}

export interface SeatsReleasedEvent extends BaseEvent {
  type: "seats.released";
  payload: {
    bookingId: string;
    showId: string;
    seatIds: string[];
    reason: "booking_cancelled" | "booking_expired" | "payment_failed";
  };
}

export type DomainEvent =
  | BookingCreatedEvent
  | BookingConfirmedEvent
  | BookingCancelledEvent
  | PaymentInitiatedEvent
  | PaymentSuccessEvent
  | PaymentFailedEvent
  | SeatsReservedEvent
  | SeatsReleasedEvent;
