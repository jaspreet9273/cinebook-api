# ADR 003 — Why MongoDB

**Date:** 2024  
**Status:** Accepted

## Context

We needed a database for the booking system. The main options were
PostgreSQL (relational) or MongoDB (document).

## Decision

MongoDB for all services.

## Reasons

**Seat layout as embedded documents** — A show's seat map is a nested structure
(rows → seats → status). In MongoDB this is a single document with an array of
embedded seat objects. In PostgreSQL this would require a `shows` table, a `seats`
table, and a join on every seat availability query.

**Atomic array updates** — MongoDB's `$set` with `arrayFilters` lets us update
specific seat statuses within a show document atomically in a single operation.
Replicating this in SQL requires locking individual seat rows.

**Flexible schema during development** — The seat layout, pricing, and metadata
structures evolved during development. MongoDB's flexible schema meant no migration
files for every field addition.

**Multi-document transactions** — MongoDB 4.0+ supports ACID transactions across
documents, which we use for the critical seat reservation + booking creation operation.

**Atlas free tier** — MongoDB Atlas provides a generous 512MB free tier that's
sufficient for a portfolio project with real traffic.

## Tradeoffs Accepted

- **No joins** — We denormalize data (e.g. storing movieId in booking instead of
  a foreign key). This means some data duplication but avoids cross-service queries.

- **No strict schema enforcement** — We use Mongoose schemas with validators to
  compensate, but MongoDB won't reject malformed documents at the DB level.

- **Optimistic concurrency must be manual** — PostgreSQL has `SELECT FOR UPDATE`.
  In MongoDB we implement OCC ourselves using a `version` field on the Show document.
  This is more explicit but requires discipline.

## Why not PostgreSQL?

The nested seat structure is genuinely a better fit for a document model.
The booking creation transaction (reserve seats + create booking) works well
with MongoDB's multi-document transactions. PostgreSQL would have been a valid
choice but would require more schema design upfront and more complex queries
for seat availability.
