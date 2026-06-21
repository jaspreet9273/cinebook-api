# ADR 002 — Kafka for Events, RabbitMQ for Notifications

**Date:** 2024  
**Status:** Accepted

## Context

We needed a messaging system for async communication between services.
We evaluated using Kafka alone, RabbitMQ alone, or both.

## Decision

Use both — Kafka for domain events, RabbitMQ for notifications.

## Reasons

### Kafka for domain events (booking.created, payment.success, etc.)

**Ordering guarantees** — Kafka partitions messages by key (showId). All events
for the same show land on the same partition, ensuring seat state changes are
processed in order.

**Replay** — Kafka retains messages for 7 days. If the notification service is
down for an hour, it replays missed events on restart without any data loss.

**Exactly-once semantics** — The booking service uses an idempotent transactional
producer. Combined with manual offset commits on the consumer, we get reliable
at-least-once processing with idempotent handlers.

**Audit log** — Kafka acts as a durable, ordered log of everything that happened
in the system — valuable for debugging and compliance.

### RabbitMQ for notifications (email, SMS)

**Flexible routing** — RabbitMQ fanout exchange delivers the same notification to
both the email queue and SMS queue simultaneously. Adding a push notification queue
later requires zero changes to publishers.

**Per-message TTL and DLQ** — RabbitMQ has native support for message expiry,
dead letter exchanges, and per-queue retry policies — ideal for notification
delivery where we want automatic DLQ after 3 failures.

**Lighter weight** — RabbitMQ is simpler to operate for task-queue patterns.
Notifications are fire-and-forget — we don't need Kafka's log retention or
ordering guarantees here.

## Tradeoffs Accepted

- Two message brokers to operate and monitor instead of one.
- Developers need to understand both systems.

## Why not just Kafka for everything?

Kafka's fanout pattern (one message → multiple consumers) requires each consumer
to be in a different consumer group, which works but is less ergonomic than
RabbitMQ's exchange/queue model for notification routing. RabbitMQ's management UI
is also more developer-friendly for inspecting individual queued messages.
