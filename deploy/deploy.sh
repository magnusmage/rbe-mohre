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
if [ -z "$PY" ] && ! command -v uv >/dev/null; then
  die "python3.11+ or uv is required: run deploy/install_prereqs.sh first"
fi

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
# A venv whose interpreter resolves into /root or /home is unusable by the
# service: user rbe cannot traverse there and the unit's ProtectHome=true
# blocks it regardless. Detect and rebuild such a venv.
if [ -x "$VENV/bin/python" ]; then
  PYREAL=$(readlink -f "$VENV/bin/python")
  case "$PYREAL" in
    /root/*|/home/*)
      echo "existing venv resolves to $PYREAL (invisible to the service); rebuilding"
      rm -rf "$VENV" ;;
  esac
fi
if [ ! -x "$VENV/bin/pip" ]; then
  if [ -n "$PY" ]; then
    "$PY" -m venv "$VENV"
  else
    # uv-provisioned standalone CPython in a system path; --seed puts pip
    # in the venv so the rest of this script is identical either way
    UV_PYTHON_INSTALL_DIR=/opt/uv/python uv venv --seed --python 3.12 "$VENV"
  fi
fi
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SRC/requirements.txt"
# Prove the interpreter is executable AS THE SERVICE USER before systemd
# tries: catches ownership and traversal problems with a clear message.
runuser -u rbe -- "$VENV/bin/python" -c "import sys; print('venv ok for rbe:', sys.version.split()[0])" \
  || die "user rbe cannot execute $VENV/bin/python; check the interpreter path above"

say "web console build (same-origin: the edge serves it)"
( cd "$SRC/web" \
  && npm ci --no-audit --no-fund \
  && npm run build )
[ -f "$SRC/web/dist/index.html" ] || die "web build produced no dist/index.html"

say "secrets file"
if [ ! -f /etc/rbe/rbe.env ]; then
  install -o root -g rbe -m 640 "$SRC/deploy/rbe.env.example" /etc/rbe/rbe.env
  die "created /etc/rbe/rbe.env from the template; fill in every value, then re-run"
fi
# APP_ENV=production makes settings.check() refuse to boot with blanks,
# but fail here with a clear message naming each offender instead of a
# crash loop. Whitespace-only and CRLF-damaged values count as empty.
MISSING=""
for k in AGENT_TOOL_TOKEN REVIEWER_TOKEN ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID ELEVENLABS_WEBHOOK_SECRET; do
  v=$(grep -E "^$k=" /etc/rbe/rbe.env | tail -1 | cut -d= -f2- | tr -d '[:space:]\r')
  [ -n "$v" ] || MISSING="$MISSING $k"
done
[ -z "$MISSING" ] || die "empty or missing in /etc/rbe/rbe.env:$MISSING"

say "systemd service"
install -m 644 "$SRC/deploy/systemd/rbe.service" /etc/systemd/system/rbe.service
systemctl daemon-reload
systemctl enable rbe >/dev/null
systemctl restart rbe
sleep 2
systemctl is-active --quiet rbe || { journalctl -u rbe -n 20 --no-pager; die "rbe.service failed to start"; }

if [ "${SKIP_NGINX:-0}" = "1" ]; then
  say "nginx step skipped (SKIP_NGINX=1): you manage the site config yourself"
  echo "  reference config: $SRC/deploy/nginx/rbe.magnusmage.com.conf"
  echo "  it must serve $SRC/web/dist and proxy the API paths to 127.0.0.1:8000"
else
  say "nginx site (scoped to $RBE_HOST; other sites untouched)"
  SITE=/etc/nginx/sites-available/$RBE_HOST.conf
  if [ -f "$SITE" ] && ! grep -qE "nginx site for .+ only\. Scoped by server_name" "$SITE" 2>/dev/null; then
    die "$SITE exists but was not written by this script; keep your own config and re-run with SKIP_NGINX=1, or remove it first"
  fi
  sed "s/rbe\.magnusmage\.com/$RBE_HOST/g" "$SRC/deploy/nginx/rbe.magnusmage.com.conf" > "$SITE"
  ln -sf "$SITE" "/etc/nginx/sites-enabled/$RBE_HOST.conf"
  nginx -t || die "nginx -t failed; NOT reloading (existing sites keep running)"
  systemctl reload nginx
fi

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
