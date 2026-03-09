#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd npm
require_cmd curl
require_cmd systemctl

if ! sudo -n true >/dev/null 2>&1; then
  echo "sudo must be passwordless for deploy user (required for systemctl restart)." >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "[deploy] syncing repository to origin/$BRANCH"
git fetch origin --prune
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd

echo "[deploy] installing root dependencies"
npm ci --no-audit --no-fund

echo "[deploy] building web app"
cd "$WEB_DIR"
npm ci --no-audit --no-fund
rm -rf .next
npm run build

cd "$ROOT_DIR"

echo "[deploy] reloading systemd and restarting services"
sudo systemctl daemon-reload
sudo systemctl restart meepo-web
sudo systemctl restart meepo-bot

echo "[deploy] validating service health"
if ! sudo systemctl is-active --quiet meepo-web; then
  echo "meepo-web is not active" >&2
  sudo journalctl -u meepo-web -n 200 --no-pager || true
  exit 1
fi

if ! sudo systemctl is-active --quiet meepo-bot; then
  echo "meepo-bot is not active" >&2
  sudo journalctl -u meepo-bot -n 200 --no-pager || true
  exit 1
fi

if ! curl -fsS http://127.0.0.1:3000 >/dev/null; then
  echo "Web health check failed at http://127.0.0.1:3000" >&2
  exit 1
fi

echo "[deploy] success: $BRANCH deployed"