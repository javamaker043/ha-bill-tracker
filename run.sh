#!/usr/bin/env bash
set -e

CONFIG_PATH=/data/options.json

if [ -f "$CONFIG_PATH" ]; then
  export REMINDER_LOOKAHEAD_DAYS=$(jq -r '.reminder_lookahead_days // 3' "$CONFIG_PATH" 2>/dev/null || echo 3)
  export NOTIFY_SERVICE=$(jq -r '.notify_service // "notify.notify"' "$CONFIG_PATH" 2>/dev/null || echo "notify.notify")
fi

echo "[household-hub] starting on port ${PORT:-8099}"
exec node /app/src/server.js
