#!/usr/bin/env bash
# Read-only smoke test against a deployed RBE instance. Verifies the public
# contract without any token and without writing any data: auth boundaries
# return 401, health carries the synthetic-data marker, the SPA is served.
#
# Usage:
#   bash smoke_test.sh https://rbe.magnusmage.com          # full check
#   bash smoke_test.sh http://127.0.0.1:8000 --api-only    # backend only (no nginx/SPA)
set -u

BASE="${1:?usage: smoke_test.sh <base-url> [--api-only]}"
BASE="${BASE%/}"
MODE="${2:-full}"
PASS=0; FAIL=0
# TLS certificates are verified by default; SMOKE_INSECURE=1 only for
# checking a host before certbot has issued its certificate.
CURL_TLS=""
[ "${SMOKE_INSECURE:-0}" = "1" ] && CURL_TLS="-k"

check() { # name expected actual [extra_ok]
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf 'ok   %-46s %s\n' "$name" "$actual"; PASS=$((PASS+1))
  else
    printf 'FAIL %-46s got %s, want %s\n' "$name" "$actual" "$expected"; FAIL=$((FAIL+1))
  fi
}

code() { curl -s $CURL_TLS -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

# Control plane, no auth required
check "GET /health"        200 "$(code "$BASE/health")"
check "GET /docs"          200 "$(code "$BASE/docs")"
check "GET /openapi.json"  200 "$(code "$BASE/openapi.json")"

# Synthetic-data marker: every response must carry it
HDR=$(curl -s $CURL_TLS --max-time 15 -i "$BASE/health" | tr -d '\r' | grep -i '^x-data-mode:' | awk '{print $2}')
check "X-Data-Mode header" "synthetic" "${HDR:-missing}"

# Auth boundaries fail closed without tokens (calibrated against the app)
check "POST /tools/check_wage no token"  401 "$(code -X POST "$BASE/tools/check_wage" -H 'content-type: application/json' -d '{}')"
check "POST /tools/check_wage bad token" 401 "$(code -X POST "$BASE/tools/check_wage" -H 'authorization: Bearer wrong' -H 'content-type: application/json' -d '{}')"
check "GET /review/queue no token"       401 "$(code "$BASE/review/queue")"
check "POST webhook unsigned"            401 "$(code -X POST "$BASE/webhooks/elevenlabs/post-call" -H 'content-type: application/json' -d '{}')"

if [ "$MODE" != "--api-only" ]; then
  # SPA served with fallback routing (through nginx)
  check "GET / is HTML"          200 "$(code "$BASE/")"
  BODY=$(curl -s $CURL_TLS --max-time 15 "$BASE/")
  case "$BODY" in
    *"RBE Console"*) check "SPA shell served" yes yes ;;
    *)               check "SPA shell served" yes no  ;;
  esac
  check "GET /caller/ready (SPA fallback)" 200 "$(code "$BASE/caller/ready")"
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
