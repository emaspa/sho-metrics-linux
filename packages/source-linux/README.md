# Sho Metrics source: Linux helper

The Linux counterpart of `packages/source-windows`: a small Node daemon that
serves hardware sensors to the Sho Metrics plugin over the
`MetricSourceService` gRPC contract in `contracts/proto`.

```
Sho Metrics plugin (OpenDeck)  --gRPC over unix socket-->  server.mjs
    |                                                          |- /sys/class/hwmon
 OpenDeck                                                      |- lactd (NVIDIA)
                                                               |- ~/mangohud_logs
```

Sensor sources:

- **Every hwmon sensor** in `/sys/class/hwmon`: CPU (k10temp/coretemp), board
  fans and voltages (it87/nct67xx), NVMe temps, DDR5 SPD temps, power meters
  like the WireView Pro (per-pin 12VHPWR current), and anything else with a
  driver
- **NVIDIA GPUs via [LACT](https://github.com/ilya-zlobintsev/LACT)**: core
  temp, hotspot, VRAM junction and per-chip temps (readings NVML refuses to
  expose on Blackwell), fan RPM/PWM, power draw and limit, clocks, VRAM usage,
  utilization. `lact` with the `lactd` system service enabled; v0.10+ for
  Blackwell hotspot
- **AMD GPUs** through plain hwmon (amdgpu)
- **In-game FPS via [MangoHud](https://github.com/flightlessmango/MangoHud)**:
  FPS, 1% lows, and frametime while a MangoHud-enabled game runs
- **Stable aliases** (`cpu.temp`, `gpu.temp`, `gpu.power`, ...) so the plugin's
  curated CPU/GPU widgets work

## Install

Requirements: Node.js 20 or newer.

Arch:

```sh
paru -S sho-metrics-source-linux
```

Fedora 43 and 44:

```sh
sudo dnf copr enable emaspa/sho-metrics
sudo dnf install sho-metrics-source-linux
```

Ubuntu 26.04 and every other distro: download the `.deb` or the Arch or Fedora
package from
[Releases](https://github.com/emaspa/sho-metrics-linux/releases), or install
from a checkout:

```sh
cd packages/source-linux
./install.sh
```

Then enable the service for your user:

```sh
systemctl --user enable --now shometrics-linux-helper.service
```

`install.sh` writes `~/.config/systemd/user/shometrics-linux-helper.service`
pointing at the checkout, and enables and starts it for you. Re-run it after
pulling a new revision. The distro packages install the same unit name and use
the same socket, so the plugin cannot tell which one you used. How they are
built and published is in `packaging/README.md`.

The daemon listens on
`/tmp/shometrics-helper/ShoMetrics.Source.Windows.Grpc.v1` (unix socket; the
endpoint name matches the Windows named pipe so the plugin uses one endpoint
name on both platforms). Install the plugin from
[Releases](https://github.com/emaspa/sho-metrics-linux/releases) and restart
OpenDeck.

### FPS setup (optional)

Configure MangoHud to auto-log where the daemon looks
(`~/.config/MangoHud/MangoHud.conf`):

```ini
autostart_log=1
log_interval=1000
output_folder=/home/YOU/mangohud_logs
# no_display=1   # log invisibly, Shift_R+F12 toggles the overlay
```

Then get MangoHud into your games. Per game: `mangohud %command%` in Steam
launch options. Steam-wide: launch Steam with `MANGOHUD=1` in its environment.
The `MANGOHUD_LOG_DIR` environment variable moves the watched directory (set it
in a systemd drop-in for the service).

## Development

- The wire contract is `contracts/proto/shometrics/v1/`; `server.mjs` loads it
  at runtime with `@grpc/proto-loader`, so contract changes are picked up on
  restart. The plugin side regenerates from the same files. `SHOMETRICS_PROTO_DIR`
  overrides the include directory, which is how distro packages point at their
  own copy of the contract.
- `node server.mjs --check` loads the contract, enumerates sensors and exits
  without binding the socket, so it is safe to run while the service is up.
  `--version` prints `HELPER_VERSION`.
- The plugin keeps the historical `windows-helper` source id and
  `local:windows-helper` profile id on all platforms for stored-settings
  compatibility; `supportsHelperSourceOnPlatform()` in the hub gates Linux.
- The service status the plugin reports comes from
  `systemctl --user show shometrics-linux-helper.service`, so install via
  `install.sh` (or keep the unit name) for correct "not installed / stopped /
  running" guidance in the property inspector.
- Sensors re-enumerate every 60 s, and immediately when `lactd` appears after
  boot. To see daemon logs: `journalctl --user -u shometrics-linux-helper -f`.

## History

This daemon started as the standalone
[shometrics-linux-helper](https://github.com/emaspa/shometrics-linux-helper)
repository, which also carries the port's development history and diagnostics
tools. It moved into this fork as `packages/source-linux` so plugin and helper
ship as one versioned product.
