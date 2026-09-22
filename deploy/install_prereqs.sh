#!/usr/bin/env bash
# Installs the two build prerequisites the pre-flight most often finds
# missing on Ubuntu VMs: Node.js 20 (NodeSource) and Python 3.12
# (deadsnakes PPA). Idempotent: anything already satisfied is skipped.
# Touches nothing else; nginx, certbot and running services are not
# involved. Run as root, then re-run preflight.sh.
set -euo pipefail

die() { printf 'install_prereqs: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"
command -v apt-get >/dev/null || die "apt-get not found: this helper targets Ubuntu/Debian; install Node 20 and Python 3.11+ your distro's way"

echo "== Node.js 20"
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -ge 20 ]; then
  echo "   already satisfied: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "   installed: $(node --version)"
fi

echo "== Python 3.12"
if command -v python3.12 >/dev/null; then
  echo "   already satisfied: $(python3.12 --version)"
elif command -v python3.11 >/dev/null; then
  echo "   already satisfied: $(python3.11 --version)"
else
  # Never pass python3.12 to apt-get blind: on releases without the
  # package, apt regex-matches the dots and can select something entirely
  # different (seen in the field: postgresql-plpython3-12). Check the
  # archive first and add deadsnakes only when it is genuinely absent.
  if ! apt-cache show python3.12 >/dev/null 2>&1; then
    echo "   python3.12 not in this release's archive; adding deadsnakes PPA"
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:deadsnakes/ppa
    apt-get update
  fi
  apt-cache show python3.12 >/dev/null 2>&1 || die "python3.12 unavailable even via deadsnakes; install Python 3.11+ manually (or use uv: https://docs.astral.sh/uv/)"
  apt-get install -y python3.12 python3.12-venv
  command -v python3.12 >/dev/null || die "python3.12 install did not produce the interpreter"
  echo "   installed: $(python3.12 --version)"
fi

echo "Done. Re-run: bash preflight.sh"
