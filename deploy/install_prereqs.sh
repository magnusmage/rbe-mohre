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
  if ! apt-get install -y python3.12 python3.12-venv 2>/dev/null; then
    # Older Ubuntu: 3.12 is not in the default archive
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:deadsnakes/ppa
    apt-get update
    apt-get install -y python3.12 python3.12-venv
  fi
  echo "   installed: $(python3.12 --version)"
fi

echo "Done. Re-run: bash preflight.sh"
