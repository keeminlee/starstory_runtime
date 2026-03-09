#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! sudo -n true >/dev/null 2>&1; then
  echo "sudo must be passwordless for runtime asset install." >&2
  exit 1
fi

echo "[runtime] installing systemd unit files"
sudo install -m 0644 "$ROOT_DIR/meepo-web.service" /etc/systemd/system/meepo-web.service
sudo install -m 0644 "$ROOT_DIR/meepo-bot.service" /etc/systemd/system/meepo-bot.service

echo "[runtime] ensuring /etc/meepo exists"
sudo install -d -m 0750 /etc/meepo

if [[ ! -f /etc/meepo/meepo-web.env ]]; then
  echo "[runtime] creating /etc/meepo/meepo-web.env from template"
  sudo install -m 0640 "$ROOT_DIR/meepo-web.env.example" /etc/meepo/meepo-web.env
fi

if [[ ! -f /etc/meepo/meepo-bot.env ]]; then
  echo "[runtime] creating /etc/meepo/meepo-bot.env from template"
  sudo install -m 0640 "$ROOT_DIR/meepo-bot.env.example" /etc/meepo/meepo-bot.env
fi

echo "[runtime] reloading systemd"
sudo systemctl daemon-reload

echo "[runtime] install complete"