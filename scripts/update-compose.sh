#!/usr/bin/env bash
set -euo pipefail

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

echo "Using: ${COMPOSE_CMD[*]}"
echo "Pulling latest images..."
"${COMPOSE_CMD[@]}" pull

echo "Restarting services with updated images..."
"${COMPOSE_CMD[@]}" up -d --force-recreate

echo "Done."
