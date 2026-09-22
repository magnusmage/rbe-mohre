#!/usr/bin/env bash
# Deploys RBE to this server: control plane under systemd on 127.0.0.1:8000,
# built SPA served by nginx for one server_name. Idempotent; safe to re-run.
# It never edits another site's nginx config and reloads nginx only after
# `nginx -t` passes.
#
# Usage (as root, on the target VM):
#   RBE_REF=stage2-2026-10-14 bash deploy.sh
#
# Environment (all optional):
#   RBE_HOST  domain to serve            (default rbe.magnusmage.com)
#   RBE_REPO  git URL to deploy from     (default github.com/magnusmage/rbe-mohre)
#   RBE_REF   tag or branch to check out (default main)
set -euo pipefail

RBE_HOST="${RBE_HOST:-rbe.magnusmage.com}"
RBE_REPO="${RBE_REPO:-https://github.com/magnusmage/rbe-mohre.git}"
RBE_REF="${RBE_REF:-main}"
SRC=/opt/rbe/src
VENV=/opt/rbe/venv

say() { printf '\n== %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (systemd, nginx and /opt writes)"
command -v git >/dev/null   || die "git is required"
command -v nginx >/dev/null || die "nginx is required"
command -v npm >/dev/null   || die "Node.js 20+ with npm is required"

PY=""
for c in python3.12 python3.11; do
  command -v "$c" >/dev/null && PY="$c" && break
done
[ -n "$PY" ] || die "python3.11+ is required (e.g. apt install python3.12-venv, or use uv)"

say "pre-flight (read-only checks; SKIP_PREFLIGHT=1 to skip)"
if [ "${SKIP_PREFLIGHT:-0}" != "1" ]; then
  RBE_HOST="$RBE_HOST" bash "$(dirname "$0")/preflight.sh" || die "pre-flight failed; nothing was changed"
fi

say "system user and directories"
id rbe >/dev/null 2>&1 || useradd --system --home /opt/rbe --shell /usr/sbin/nologin rbe
mkdir -p /opt/rbe /var/lib/rbe /etc/rbe
chown rbe:rbe /var/lib/rbe

say "source at $RBE_REF"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --tags origin
else
  git clone "$RBE_REPO" "$SRC"
fi
git -C "$SRC" checkout --detach "$RBE_REF"
git -C "$SRC" log --format='deployed commit: %h %s' -1

say "python environment"
[ -x "$VENV/bin/pip" ] || "$PY" -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SRC/requirements.txt"

say "web console build"
( cd "$SRC/web" \
  && npm ci --no-audit --no-fund \
  && VITE_API_BASE_URL="https://$RBE_HOST" npm run build )
[ -f "$SRC/web/dist/index.html" ] || die "web build produced no dist/index.html"

say "secrets file"
if [ ! -f /etc/rbe/rbe.env ]; then
  install -o root -g rbe -m 640 "$SRC/deploy/rbe.env.example" /etc/rbe/rbe.env
  die "created /etc/rbe/rbe.env from the template; fill in every value, then re-run"
fi
# APP_ENV=production makes settings.check() refuse to boot with blanks,
# but fail here with a clear message instead of a crash loop.
if grep -qE '^(AGENT_TOOL_TOKEN|REVIEWER_TOKEN|ELEVENLABS_API_KEY|ELEVENLABS_AGENT_ID|ELEVENLABS_WEBHOOK_SECRET)=$' /etc/rbe/rbe.env; then
  die "/etc/rbe/rbe.env still has empty values; fill them in, then re-run"
fi

say "systemd service"
install -m 644 "$SRC/deploy/systemd/rbe.service" /etc/systemd/system/rbe.service
systemctl daemon-reload
systemctl enable rbe >/dev/null
systemctl restart rbe
sleep 2
systemctl is-active --quiet rbe || { journalctl -u rbe -n 20 --no-pager; die "rbe.service failed to start"; }

say "nginx site (scoped to $RBE_HOST; other sites untouched)"
SITE=/etc/nginx/sites-available/$RBE_HOST.conf
sed "s/rbe\.magnusmage\.com/$RBE_HOST/g" "$SRC/deploy/nginx/rbe.magnusmage.com.conf" > "$SITE"
ln -sf "$SITE" "/etc/nginx/sites-enabled/$RBE_HOST.conf"
nginx -t || die "nginx -t failed; NOT reloading (existing sites keep running)"
systemctl reload nginx

say "smoke test (local)"
bash "$SRC/deploy/smoke_test.sh" "http://127.0.0.1:8000" --api-only

say "done"
cat <<EOF
Next steps:
  1. Point DNS: A record for $RBE_HOST to this server's IP.
  2. TLS:       certbot --nginx -d $RBE_HOST   (touches only this server block)
  3. Verify:    bash $SRC/deploy/smoke_test.sh https://$RBE_HOST
  4. ElevenLabs: set tool base URL and post-call webhook to https://$RBE_HOST
EOF
