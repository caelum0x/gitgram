#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt 2>/dev/null || echo "No requirements.txt found, skipping"
fi
exec .venv/bin/python server.py "$@"
