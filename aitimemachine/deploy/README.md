# Deprecated AITM-Only Deploy Notes

This directory still contains useful fallback artifacts:

- `ecosystem.config.cjs`
- `aitm-api.service`
- `nginx.conf`

But this README is no longer the launch source of truth.

Use `docs/runbook.md` for:

- the manual publish order for `@gitgram/timemachine` and `@gitgram/timemachine-mcp`
- the canonical AITM API deploy commands
- PM2 as the primary control plane
- `systemd` only as a fallback path
