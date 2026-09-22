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

echo "== Python 3.12 (via uv; no apt, no PPA, distro-independent)"
# apt is deliberately not used for Python: on releases without the package,
# apt regex-matches the dots in "python3.12" and can select something
# entirely different (seen in the field: postgresql-plpython3-12). uv
# downloads a standalone CPython instead, on any distro.
if command -v python3.12 >/dev/null; then
  echo "   system interpreter already satisfies it: $(python3.12 --version)"
elif command -v python3.11 >/dev/null; then
  echo "   system interpreter already satisfies it: $(python3.11 --version)"
else
  if ! command -v uv >/dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
    command -v uv >/dev/null || die "uv install failed; see https://docs.astral.sh/uv/"
    echo "   installed uv $(uv --version)"
  else
    echo "   uv already present: $(uv --version)"
  fi
  # System location, NOT root's home: the rbe service user must be able
  # to traverse to the interpreter, and the unit's ProtectHome=true
  # (kept on purpose) blocks /root and /home entirely.
  UV_PYTHON_INSTALL_DIR=/opt/uv/python uv python install 3.12
  echo "   Python 3.12 provisioned under /opt/uv/python (deploy.sh creates the venv with it)"
fi

echo "Done. Re-run: bash preflight.sh"
