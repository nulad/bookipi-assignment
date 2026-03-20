#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_ID="${RECONCILIATION_SMOKE_USER_ID:-reconcile-smoke-$(date +%s)@example.com}"
FAILED_AT="${RECONCILIATION_SMOKE_FAILED_AT:-2026-03-20T10:00:00.000Z}"

log() {
  printf '[reconciliation-smoke] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command docker
require_command npm

cd "$ROOT_DIR"

log "starting Redis and Postgres"
npm run infra:up

log "applying schema"
npm run db:schema:api

log "initializing active sale state"
npm run sale:init:api

log "reading active sale id from Redis"
SALE_ID="$(docker exec bookipi-redis redis-cli --raw GET flashsale:active_sale_id | tr -d '\r')"

if [[ -z "$SALE_ID" ]]; then
  printf 'Failed to resolve active sale id from Redis\n' >&2
  exit 1
fi

RECORD_PAYLOAD="$(printf '{"eventType":"purchase_persistence_failed","saleId":"%s","userId":"%s","failedAt":"%s","errorName":"Error","errorMessage":"reconciliation smoke test"}' "$SALE_ID" "$USER_ID" "$FAILED_AT")"

log "enqueueing synthetic failure record for ${USER_ID}"
docker exec bookipi-redis redis-cli RPUSH flashsale:purchase_persistence_failures "$RECORD_PAYLOAD" >/dev/null

log "inspect mode output"
npm run purchase:reconcile:api -- --limit 10

log "apply mode output"
npm run purchase:reconcile:api -- --apply --limit 10

log "verifying Postgres purchase row"
PURCHASE_COUNT="$(docker exec bookipi-postgres psql -U bookipi -d bookipi -t -A -c "SELECT COUNT(*) FROM purchases WHERE sale_id = '${SALE_ID}' AND user_id = '${USER_ID}';" | tr -d '\r')"

if [[ "$PURCHASE_COUNT" != "1" ]]; then
  printf 'Expected 1 repaired purchase row, got %s\n' "$PURCHASE_COUNT" >&2
  exit 1
fi

log "verifying Redis queue drained for this record"
QUEUE_COUNT="$(docker exec bookipi-redis redis-cli LLEN flashsale:purchase_persistence_failures | tr -d '\r')"
ARCHIVE_MATCHES="$(docker exec bookipi-redis redis-cli --raw LRANGE flashsale:purchase_persistence_failures_archive 0 -1 | grep -c "$USER_ID" || true)"

if [[ "$ARCHIVE_MATCHES" -lt 1 ]]; then
  printf 'Expected archived reconciliation record for %s\n' "$USER_ID" >&2
  exit 1
fi

log "success"
printf 'saleId=%s\n' "$SALE_ID"
printf 'userId=%s\n' "$USER_ID"
printf 'queueLength=%s\n' "$QUEUE_COUNT"
printf 'archiveMatches=%s\n' "$ARCHIVE_MATCHES"
