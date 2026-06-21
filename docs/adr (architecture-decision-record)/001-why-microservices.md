# ADR 001 — Why Microservices

**Date:** 2024  
**Status:** Accepted

## Context

We needed to choose an architectural style for the movie booking system.
The main options were a monolith, modular monolith, or microservices.

## Decision

We chose microservices.

## Reasons

**Independent scaling** — The booking service handles heavy traffic during show
releases. With microservices we can scale just that service without scaling the
entire application.

**Independent deployment** — A bug in the notification service should not require
redeploying the payment service. Each service deploys on its own schedule.

**Technology isolation** — Each service owns its data and can evolve independently.
The show service is read-heavy and can be cached aggressively. The booking service
is write-heavy and needs strong consistency guarantees.

**Fault isolation** — If the notification service crashes, bookings still work.
The API Gateway's circuit breaker prevents a slow downstream from cascading.

## Tradeoffs Accepted

- **Operational complexity** — More services to run, monitor, and debug.
  Mitigated with Docker Compose for local dev and structured logging with correlation IDs.

- **Distributed systems problems** — Network failures, partial failures, eventual consistency.
  Mitigated with idempotency keys, at-least-once Kafka delivery, and the circuit breaker.

- **Local development friction** — Running 6 services locally is heavier than a monolith.
  Mitigated with the infra docker-compose file that brings up all dependencies in one command.
