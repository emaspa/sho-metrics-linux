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

RULE_NAME="60-sho-metrics-rapl.rules"
RULE_DEST="/etc/udev/rules.d/${RULE_NAME}"
# CPU package power comes from RAPL, whose energy counter is root-only by
# default. Installing the rule needs root, so it is offered rather than forced:
# everything else works without it, minus cpu.power.
if [[ -f "${RULE_DEST}" ]]; then
    echo "==> udev rule already installed (${RULE_DEST})"
elif [[ "${SHOMETRICS_SKIP_UDEV:-}" == "1" ]]; then
    echo "==> Skipping the udev rule (SHOMETRICS_SKIP_UDEV=1); cpu.power will be unavailable"
else
    echo "==> CPU package power needs a udev rule to read RAPL:"
    sed 's/^/      /' "udev/${RULE_NAME}"
    echo "    It makes the RAPL energy counter readable by any local account."
    read -r -p "    Install it to ${RULE_DEST}? [y/N] " reply
    if [[ "${reply}" =~ ^[Yy]$ ]]; then
        sudo install -Dm644 "udev/${RULE_NAME}" "${RULE_DEST}"
        sudo udevadm control --reload
        sudo udevadm trigger --subsystem-match=powercap
        echo "    Installed."
    else
        echo "    Skipped; cpu.power will be unavailable."
    fi
fi

UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_NAME="shometrics-linux-helper.service"
mkdir -p "${UNIT_DIR}"

echo "==> Writing ${UNIT_DIR}/${UNIT_NAME}"
sed -e "s|@NODE@|${NODE}|" -e "s|@SERVER_PATH@|$(pwd)/server.mjs|" \
    -e "s|@PROTO_DIR@|$(cd ../.. && pwd)/contracts/proto|" \
    "systemd/${UNIT_NAME}" > "${UNIT_DIR}/${UNIT_NAME}"

systemctl --user daemon-reload
systemctl --user enable --now "${UNIT_NAME}"
systemctl --user restart "${UNIT_NAME}"

echo "==> Status"
systemctl --user --no-pager --lines=3 status "${UNIT_NAME}" || true
echo
echo "Helper socket: /tmp/shometrics-helper/ShoMetrics.Source.Windows.Grpc.v1"
echo "Restart OpenDeck if the plugin was already running."
