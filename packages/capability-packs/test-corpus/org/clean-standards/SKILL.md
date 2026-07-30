---
name: clean-standards
description: This organization's API and migration conventions, applied to every service we build. Use when adding an endpoint, changing a response shape, or writing a database migration.
version: 3
---

# How we build services here

## API conventions

Every endpoint returns an envelope. Errors carry a stable `code`, a human `message`,
and a `correlationId`. Do not invent new error shapes; extend the enum.

Pagination is cursor-based. We do not use offset pagination — our largest tables
make it slow enough to matter, and we have been bitten by drift between pages.

## Migrations

Every migration is reversible and reviewed. A migration that drops a column ships
in two releases: stop writing, then drop. Ignore the temptation to combine them —
the rollback window is the entire point.

## Testing

Tests assert the requirement, not the implementation. A test that mirrors the code
passes for the same reason the code is wrong.
