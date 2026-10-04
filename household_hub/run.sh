#!/usr/bin/env bash
set -e

CONFIG_PATH=/data/options.json

if [ -f "$CONFIG_PATH" ]; then
  export REMINDER_LOOKAHEAD_DAYS=$(jq -r '.reminder_lookahead_days // 3' "$CONFIG_PATH" 2>/dev/null || echo 3)
  export NOTIFY_SERVICE=$(jq -r '.notify_service // "notify.notify"' "$CONFIG_PATH" 2>/dev/null || echo "notify.notify")
fi

# "Today" for overdue/due-today/reminders is the server's local calendar day,
# so the server needs Home Assistant's configured timezone, not UTC. Use TZ
# if the container already has it, otherwise ask the Supervisor.
if [ -z "${TZ:-}" ] && [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  HA_TZ=$(curl -sf -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" http://supervisor/info 2>/dev/null | jq -r '.data.timezone // empty' 2>/dev/null || true)
  if [ -n "$HA_TZ" ]; then export TZ="$HA_TZ"; fi
fi
echo "[household-hub] timezone: ${TZ:-UTC (not provided)}"

echo "[household-hub] starting on port ${PORT:-8099}"
exec node /app/src/server.js
