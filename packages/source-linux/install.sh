#!/usr/bin/env bash
# Installs the Sho Metrics Linux helper as a systemd user service from this
# checkout. Safe to re-run after pulling a new revision.
set -euo pipefail
cd "$(dirname "$0")"

NODE="$(command -v node)"
if [[ -z "${NODE}" ]]; then
    echo "node not found on PATH (Node 20+ required)" >&2
    exit 1
fi

echo "==> Installing dependencies"
npm install --omit=dev --no-fund --no-audit

UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_NAME="shometrics-linux-helper.service"
mkdir -p "${UNIT_DIR}"

echo "==> Writing ${UNIT_DIR}/${UNIT_NAME}"
sed -e "s|@NODE@|${NODE}|" -e "s|@SERVER_PATH@|$(pwd)/server.mjs|" \
    "systemd/${UNIT_NAME}" > "${UNIT_DIR}/${UNIT_NAME}"

systemctl --user daemon-reload
systemctl --user enable --now "${UNIT_NAME}"
systemctl --user restart "${UNIT_NAME}"

echo "==> Status"
systemctl --user --no-pager --lines=3 status "${UNIT_NAME}" || true
echo
echo "Helper socket: /tmp/shometrics-helper/ShoMetrics.Source.Windows.Grpc.v1"
echo "Restart OpenDeck if the plugin was already running."
