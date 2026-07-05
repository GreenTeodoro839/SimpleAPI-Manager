#!/bin/sh
set -eu

log() {
  printf '[entrypoint] %s\n' "$*"
}

generate_token() {
  first="$(tr -d '-' < /proc/sys/kernel/random/uuid)"
  second="$(tr -d '-' < /proc/sys/kernel/random/uuid)"
  printf '%s%s\n' "$first" "$second" | cut -c1-32
}

run_as_app() {
  if [ "$(id -u)" = "0" ]; then
    su-exec app:app "$@"
  else
    "$@"
  fi
}

fix_data_permissions() {
  if [ "$(id -u)" != "0" ]; then
    return 0
  fi
  for path in "$DATA_DIR" "$SIMPLEAPI_DATA_DIR" "$SIMPLEAPI_CONFIG_DIR" "$SIMPLEAPI_ADMIN_KEY_DIR"; do
    if [ -n "$path" ] && [ "$path" != "/" ] && [ -e "$path" ]; then
      chown -R app:app "$path"
    fi
  done
}

shutdown() {
  trap - INT TERM
  if [ "${manager_pid:-}" ] && kill -0 "$manager_pid" 2>/dev/null; then
    kill "$manager_pid" 2>/dev/null || true
  fi
  if [ "${simpleapi_pid:-}" ] && kill -0 "$simpleapi_pid" 2>/dev/null; then
    kill "$simpleapi_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap shutdown INT TERM

DATA_DIR="${DATA_DIR:-/data}"
PANEL_PATH="${PANEL_PATH:-/app/panel}"
HTTP_ADDR="${HTTP_ADDR:-0.0.0.0:18318}"
SIMPLEAPI_DATA_DIR="${SIMPLEAPI_DATA_DIR:-$DATA_DIR/simpleapi}"
SIMPLEAPI_CONFIG="${SIMPLEAPI_CONFIG:-$SIMPLEAPI_DATA_DIR/config.yaml}"
SIMPLEAPI_LISTEN="${SIMPLEAPI_LISTEN:-0.0.0.0:8317}"
SIMPLEAPI_LOG_LEVEL="${SIMPLEAPI_LOG_LEVEL:-info}"
SIMPLEAPI_ADMIN_KEY_FILE="${SIMPLEAPI_ADMIN_KEY_FILE:-$SIMPLEAPI_DATA_DIR/admin_key}"
SIMPLEAPI_CONFIG_DIR="$(dirname "$SIMPLEAPI_CONFIG")"
SIMPLEAPI_ADMIN_KEY_DIR="$(dirname "$SIMPLEAPI_ADMIN_KEY_FILE")"

mkdir -p "$DATA_DIR" "$SIMPLEAPI_DATA_DIR" "$SIMPLEAPI_CONFIG_DIR" "$SIMPLEAPI_ADMIN_KEY_DIR"
fix_data_permissions

if [ ! -f "$SIMPLEAPI_CONFIG" ]; then
  cp /app/simpleapi-config.example.yaml "$SIMPLEAPI_CONFIG"
  if [ "$(id -u)" = "0" ]; then
    chown app:app "$SIMPLEAPI_CONFIG"
  fi
  log "initialized SimpleAPI config at $SIMPLEAPI_CONFIG"
else
  log "using existing SimpleAPI config at $SIMPLEAPI_CONFIG"
fi

if [ -z "${PROXY_ADMIN_KEY:-}" ]; then
  if [ -n "${SIMPLEAPI_ADMIN_KEY:-}" ]; then
    PROXY_ADMIN_KEY="$SIMPLEAPI_ADMIN_KEY"
    export PROXY_ADMIN_KEY
  elif [ -f "$SIMPLEAPI_ADMIN_KEY_FILE" ]; then
    PROXY_ADMIN_KEY="$(cat "$SIMPLEAPI_ADMIN_KEY_FILE")"
    export PROXY_ADMIN_KEY
  else
    PROXY_ADMIN_KEY="$(generate_token)"
    export PROXY_ADMIN_KEY
    umask 077
    printf '%s\n' "$PROXY_ADMIN_KEY" > "$SIMPLEAPI_ADMIN_KEY_FILE"
    if [ "$(id -u)" = "0" ]; then
      chown app:app "$SIMPLEAPI_ADMIN_KEY_FILE"
    fi
    log "SimpleAPI admin key generated: $PROXY_ADMIN_KEY"
  fi
fi

if [ "${SIMPLEAPI_MANAGER_AUTO_CONNECT:-true}" = "true" ]; then
  SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_URL="${SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_URL:-http://127.0.0.1:8317}"
  SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_PATH="${SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_PATH:-/v0/management}"
  SIMPLEAPI_MANAGER_SIMPLEAPI_ADMIN_KEY="${SIMPLEAPI_MANAGER_SIMPLEAPI_ADMIN_KEY:-$PROXY_ADMIN_KEY}"
  export SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_URL
  export SIMPLEAPI_MANAGER_SIMPLEAPI_BASE_PATH
  export SIMPLEAPI_MANAGER_SIMPLEAPI_ADMIN_KEY
fi

set -- /app/simpleapi -config "$SIMPLEAPI_CONFIG" -listen "$SIMPLEAPI_LISTEN" -log-level "$SIMPLEAPI_LOG_LEVEL"
if [ "${SIMPLEAPI_LOG_JSON:-false}" = "true" ]; then
  set -- "$@" -log-json
fi
run_as_app "$@" &
simpleapi_pid="$!"
log "started SimpleAPI on $SIMPLEAPI_LISTEN"

set -- /app/simpleapi-manager -listen "$HTTP_ADDR" -data "$DATA_DIR" -panel "$PANEL_PATH"
if [ -n "${SIMPLEAPI_MANAGER_ADMIN_KEY:-}" ]; then
  set -- "$@" -admin-key "$SIMPLEAPI_MANAGER_ADMIN_KEY"
fi
run_as_app "$@" &
manager_pid="$!"
log "started SimpleAPI Manager on $HTTP_ADDR"

while :; do
  if ! kill -0 "$simpleapi_pid" 2>/dev/null; then
    set +e
    wait "$simpleapi_pid"
    status="$?"
    set -e
    shutdown
    exit "$status"
  fi
  if ! kill -0 "$manager_pid" 2>/dev/null; then
    set +e
    wait "$manager_pid"
    status="$?"
    set -e
    shutdown
    exit "$status"
  fi
  sleep 1
done
