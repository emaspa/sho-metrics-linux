# Changelog

All notable changes to ShoMetrics will be documented in this file.

## Unreleased

### Linux helper

Released as fork tags `v0.3.0-linux.4` and `v0.3.0-linux.5`.

- Serve the CPU metrics the plugin's curated widgets ask for. `cpu.power`,
  `cpu.usage_percent` and `cpu.model` did not exist, and `cpu.temp` resolved
  only on AMD, so the multi-metric CPU widget read N/A on Intel and showed no
  power anywhere. Package power comes from RAPL, so the packages now ship a
  udev rule making the energy counter readable; `install.sh` asks first, and
  without the rule the helper drops `cpu.power` rather than guessing.
- `cpu.base_frequency` is published only where cpufreq exposes a base clock,
  which `amd-pstate` does not. Reporting the boost ceiling there would be
  wrong, so the alias stays absent instead.
- Fix a restart loop on machines without lactd. The unit waited 90s for
  `/run/lactd.sock`, exactly systemd's default `TimeoutStartSec`, so where the
  socket never appeared systemd killed start-pre and `Restart=on-failure`
  looped the unit forever. One report reached restart counter 209.

## v0.3.0

### Stream Deck plugin

- Added used and free capacity display modes for RAM, VRAM, and disk usage widgets.
- Improved text rendering with bundled static Inter font weights.

### Windows Helper

- Windows Helper remains at v0.2.0. The attached installers are the original v0.2.0 files, unchanged and not rebuilt. Existing v0.2.0 installations do not need an update.

## v0.2.0

### Stream Deck plugin

- Improved the Stream Deck+ touch strip layouts: centered text, clearer sparkline values, and better gauge and progress bar spacing.
- Single-direction network and disk views now show the full word (Upload, Download, Read, Write) instead of short codes.
- Threshold colors now follow the metric's progress consistently.
- The Property Inspector now flags when the Helper needs updating and can open the Helper Control Panel directly.
- Keeps a healthy battery reading on screen across sleep and wake.

### Windows Helper

- More accurate hardware sensor health on machines using PawnIO.
- The Control Panel now stays a single window and brings itself to the front.
- The installer's finished page now recommends a restart.

Plus various minor visual and copy fixes.

## v0.1.0

First release.

- Initial Stream Deck plugin release.
- Includes ShoMetrics Windows Helper for hardware metrics that require native Windows access.

## v0.0.1

Pre-release.

- Early validation build for packaging, installation, and release workflow testing.
