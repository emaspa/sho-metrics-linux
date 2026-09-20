# Sho Metrics source: Linux helper

The Linux counterpart of `packages/source-windows`: a small Node daemon that
serves hardware sensors to the Sho Metrics plugin over the
`MetricSourceService` gRPC contract in `contracts/proto`.

```
Sho Metrics plugin (OpenDeck)  --gRPC over unix socket-->  server.mjs
    |                                                          |- /sys/class/hwmon
 OpenDeck                                                      |- /sys/class/drm
                                                               |- /sys/class/power_supply
                                                               |- /sys/class/powercap
                                                               |- lactd (NVIDIA)
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
- **AMD and Intel GPUs** from `/sys/class/drm`: load, temperature, power,
  core clock and, where the card has dedicated memory, VRAM usage. Plain
  world-readable files, so no daemon and no added privileges
- **Batteries and mains** from `/sys/class/power_supply`: draw in watts,
  voltage, energy, health, cycle count, charge status, and whether the adapter
  is plugged in
- **In-game FPS via [MangoHud](https://github.com/flightlessmango/MangoHud)**:
  FPS, 1% lows, and frametime while a MangoHud-enabled game runs
- **CPU package power via RAPL** (`/sys/class/powercap`), on both Intel and
  AMD. The kernel ships the energy counter root-only, so this one needs the
  udev rule below
- **Stable aliases** (`cpu.temp`, `gpu.temp`, `gpu.power`, ...) so the plugin's
  curated CPU/GPU widgets work

The curated CPU widgets read five aliases:

| Alias | Source | Needs |
| --- | --- | --- |
| `cpu.temp` | hwmon `k10temp` (AMD), `coretemp` (Intel), `zenpower` | nothing |
| `cpu.usage_percent` | `/proc/stat` | nothing |
| `cpu.model` | `/proc/cpuinfo` | nothing |
| `cpu.base_frequency` | cpufreq `base_frequency` | `intel_pstate`; `amd-pstate` does not publish a base clock, so the alias is absent |
| `cpu.power` | RAPL, or `zenpower` where loaded | the udev rule |

`cpu.frequency` is published alongside them. It is the live clock, averaged
over the cores cpufreq reports one for, and it reads `scaling_cur_freq`,
falling back to `cpuinfo_cur_freq`, which some drivers keep root-only.
Per-core load and clock are published as `linux-cpu.coreN.usage_percent` and
`linux-cpu.coreN.frequency` for the hardware tree.

A missing source drops its alias rather than reporting a wrong number. The
widget shows N/A for that field and the rest keep working.

The curated GPU widgets read a matching set:

| Alias | AMD | Intel |
| --- | --- | --- |
| `gpu.temp` | amdgpu hwmon `edge` | `coretemp` package, because the integrated GPU shares the CPU die |
| `gpu.usage_percent` | `gpu_busy_percent` | RC6 residency, inverted |
| `gpu.power` | amdgpu hwmon `PPT` | RAPL `uncore` rail, which needs the udev rule |
| `gpu.vram_used` / `gpu.vram_total` | `mem_info_vram_*` | absent: an integrated GPU allocates out of system RAM |
| `gpu.model` | `/usr/share/hwdata/pci.ids` | same |

LACT owns these aliases for any card it manages, so an NVIDIA GPU keeps
reporting through LACT. This source fills in the machines LACT does not cover.
Where a discrete and an integrated GPU sit side by side, the discrete one takes
the aliases. Every card is published under `linux-drm.cardN.*` as well, which
the "Other" metric type can select directly.

Intel load comes from RC6 residency, the share of the interval the render
engine spent power gated. `intel_gpu_top` reads the same counter through the
i915 perf PMU, which needs `kernel.perf_event_paranoid` lowered. The sysfs file
needs nothing.

### Batteries

A laptop's battery is published under `linux-power.BAT0.*`: `power` in watts,
`capacity`, `voltage`, `energy`, `energy_full`, `health`, `cycle_count`,
`temp` and a `status` string. The mains adapter gets `linux-power.AC.online`.
Each reading appears only where the driver publishes it, so a battery that
reports no cycle count simply has no cycle count metric.

The plugin reads the charge percentage itself through systeminformation and
serves it as `system.battery_percent`, so the helper does not compete for that
alias and publishes the readings the plugin has no equivalent for.

Drivers disagree on units. Most report energy in uWh. Some track charge in uAh
instead, which only becomes watt-hours once multiplied by the voltage, and the
helper handles both. Charging and discharging differ only in the sign of
`current_now`, so power is reported as a magnitude.

A phone plugged into a charging port also appears here as `type=Battery`. Those
carry `scope=Device` and are skipped, so your handset's charge never gets
reported as the machine's.

### CPU power and the udev rule

Reading RAPL fast enough to compute watts is the PLATYPUS side channel
(CVE-2020-8694), so the kernel leaves `energy_uj` at mode 0400. The helper runs
as your user and cannot read it. The packages install
`/usr/lib/udev/rules.d/60-sho-metrics-rapl.rules`, which makes the counter
readable. `install.sh` asks first.

The same rule covers `gpu.power` on Intel, which reads the `uncore` rail of the
same counter.

Any local account can then read the counter. On a single-user desktop that is
your own user. On a shared machine, skip the rule. To undo it, delete the file,
run `udevadm control --reload` and reboot. The helper then reports
`sysfs:rapl` as `NOT_INSTALLED` and drops `cpu.power` and, on Intel,
`gpu.power`; nothing else changes. `SHOMETRICS_SKIP_UDEV=1 ./install.sh` skips
the prompt.

## Install

Requirements: Node.js 20 or newer.

Arch:

```sh
yay -S sho-metrics-source-linux
```

Fedora 43 and 44:

```sh
sudo dnf copr enable emaspa/sho-metrics
sudo dnf install sho-metrics-source-linux
```

Ubuntu 26.04 (PPA):

```sh
sudo add-apt-repository ppa:sparvoli/sho-metrics
sudo apt install sho-metrics-source-linux
```

Every other distro: download the `.deb` or the Arch or Fedora package from
[Releases](https://github.com/emaspa/sho-metrics-linux/releases), or install
from a checkout:

```sh
cd packages/source-linux
./install.sh
```

Then enable the service for your user (the checkout `install.sh` already
enables and starts it):

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
