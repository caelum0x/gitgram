# Deprecated Production Compose Guide

This file is retained only as a historical reference for the old full-docker single-VPS experiment.

Do not use it as the launch source of truth.

Use `docs/runbook.md` instead.

Why:

- launch is manual-first and PM2-driven
- `docker-compose.prod.yml` includes paths and services that are not the canonical launch contract
- the canonical launch scope is Gitgram backend + Gitgram web + AITM API on one operator-managed host, with PostgreSQL and Redis treated as shared infra

What remains useful here:

- the repository still contains `docker-compose.prod.yml` if you want a non-canonical all-docker rehearsal
- the root `.env.*.example` files are still the operator-facing env templates
