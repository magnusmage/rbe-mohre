#!/usr/bin/env bash
# Read-only pre-flight for deploying RBE on a VM that already serves other
# sites. It changes NOTHING: no installs, no writes, no reloads. Run it
# before deploy.sh and fix every FAIL first; WARNs are judgement calls.
#
#   RBE_HOST=rbe.magnusmage.com bash preflight.sh
set -u

RBE_HOST="${RBE_HOST:-rbe.magnusmage.com}"
RBE_PORT="${RBE_PORT:-8000}"
PASS=0; WARN=0; FAIL=0

ok()   { printf 'PASS %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf 'WARN %s\n' "$1"; WARN=$((WARN+1)); }
bad()  { printf 'FAIL %s\n' "$1"; FAIL=$((FAIL+1)); }

echo "== RBE pre-flight for $RBE_HOST (read-only) =="

# 1. Privileges: deploy.sh needs root; pre-flight itself does not
[ "$(id -u)" -eq 0 ] && ok "running as root" || warn "not root: deploy.sh itself must run as root"

# 2. Required tooling
for c in git nginx npm; do
  command -v "$c" >/dev/null && ok "$c present" || bad "$c missing"
done
if command -v node >/dev/null; then
  NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
  [ "$NODE_MAJOR" -ge 20 ] && ok "node $(node --version)" || bad "node >=20 required, found $(node --version)"
else
  bad "node missing (>=20 required)"
fi
if command -v python3.12 >/dev/null || command -v python3.11 >/dev/null; then
  ok "python3.11+ present"
else
  bad "python3.11+ missing (python3.12 preferred)"
fi
command -v certbot >/dev/null && ok "certbot present" || warn "certbot missing: TLS step will need it (apt install certbot python3-certbot-nginx)"

# 3. nginx: running, current config valid (baseline), expected layout
if command -v nginx >/dev/null; then
  if command -v systemctl >/dev/null && systemctl is-active --quiet nginx; then
    ok "nginx is running"
  else
    warn "nginx not active under systemd; existing sites may be served differently"
  fi
  if nginx -t >/dev/null 2>&1; then
    ok "current nginx config is valid (safe baseline to return to)"
  else
    bad "current nginx config already fails nginx -t: fix before deploying anything"
  fi
  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
    ok "sites-available/sites-enabled layout present"
  else
    bad "no sites-available layout: this distro uses conf.d; adjust deploy.sh paths before running"
  fi
  # 4. server_name collision with a foreign file
  CLAIMED=$(grep -RlsE "server_name[^;]*(^|[ ,])$RBE_HOST(\$|[ ;,])" /etc/nginx/ 2>/dev/null | grep -v "sites-available/$RBE_HOST.conf" | grep -v "sites-enabled/$RBE_HOST.conf" || true)
  if [ -n "$CLAIMED" ]; then
    bad "$RBE_HOST already claimed by another nginx file: $CLAIMED"
  else
    ok "$RBE_HOST not claimed by any other nginx site"
  fi
fi

# 5. Backend port free, or held by a previous RBE deploy (redeploy is fine)
if command -v ss >/dev/null; then
  HOLDER=$(ss -ltnp 2>/dev/null | awk -v p=":$RBE_PORT" '$4 ~ p {print $NF}' | head -1)
  if [ -z "$HOLDER" ]; then
    ok "port $RBE_PORT free on localhost"
  elif systemctl is-active --quiet rbe 2>/dev/null; then
    ok "port $RBE_PORT held by existing rbe.service (redeploy)"
  else
    bad "port $RBE_PORT in use by another process: $HOLDER (pick another port consistently in rbe.service and the nginx conf)"
  fi
else
  warn "ss not available; check port $RBE_PORT manually"
fi

# 6. Paths this deployment will own
for d in /opt/rbe /etc/rbe /var/lib/rbe; do
  if [ ! -e "$d" ]; then
    ok "$d free (will be created)"
  elif [ -d /opt/rbe/src/.git ] || [ -f /etc/rbe/rbe.env ]; then
    ok "$d exists from a previous RBE deploy (redeploy)"
  else
    warn "$d exists but does not look like an RBE deploy: inspect before continuing"
  fi
done

# 7. Existing unit name collision
if [ -f /etc/systemd/system/rbe.service ]; then
  grep -q "RBE control plane" /etc/systemd/system/rbe.service \
    && ok "rbe.service exists and is ours (redeploy)" \
    || bad "a foreign rbe.service already exists: resolve the name clash first"
else
  ok "no rbe.service unit yet"
fi

# 8. Disk space for venv + node_modules + build (~1 GB with headroom)
AVAIL_MB=$(df -Pm /opt 2>/dev/null | awk 'NR==2 {print $4}')
if [ -n "${AVAIL_MB:-}" ]; then
  [ "$AVAIL_MB" -ge 2048 ] && ok "disk: ${AVAIL_MB} MB free on /opt" || warn "disk: only ${AVAIL_MB} MB free on /opt (2 GB recommended)"
fi

# 9. DNS (needed for certbot, not for the deploy itself)
if command -v getent >/dev/null && getent hosts "$RBE_HOST" >/dev/null 2>&1; then
  ok "DNS: $RBE_HOST resolves to $(getent hosts "$RBE_HOST" | awk '{print $1; exit}')"
else
  warn "DNS: $RBE_HOST does not resolve yet; deploy works, certbot will not"
fi

printf '\n%d pass, %d warn, %d fail\n' "$PASS" "$WARN" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "Fix every FAIL before running deploy.sh."
  exit 1
fi
echo "Pre-flight clear: deploy.sh may run."
