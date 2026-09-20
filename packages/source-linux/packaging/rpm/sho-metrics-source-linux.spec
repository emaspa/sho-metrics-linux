%global forkver 0.3.0-linux.7
%global libdir  %{_prefix}/lib/%{name}

Name:           sho-metrics-source-linux
Version:        0.3.0^linux7
Release:        1%{?dist}
Summary:        Linux hardware sensor helper daemon for the Sho Metrics OpenDeck plugin

License:        GPL-3.0-only
URL:            https://github.com/emaspa/sho-metrics-linux
Source0:        %{url}/releases/download/v%{forkver}/%{name}-%{forkver}.tar.gz
Source1:        %{url}/releases/download/v%{forkver}/%{name}-%{forkver}-node-modules.tar.gz

BuildArch:      noarch
BuildRequires:  systemd-rpm-macros
BuildRequires:  nodejs >= 1:20
Requires:       nodejs >= 1:20

Recommends:     lact
Suggests:       mangohud

# Dependencies ship inside the package, taken from package-lock.json at release
# time. Builders here have no network by default, so nothing calls npm.
Provides:       bundled(npm(@grpc/grpc-js)) = 1.14.4
Provides:       bundled(npm(@grpc/proto-loader)) = 0.8.1
Provides:       bundled(npm(@js-sdsl/ordered-map)) = 4.4.2
Provides:       bundled(npm(@protobufjs/aspromise)) = 1.1.2
Provides:       bundled(npm(@protobufjs/base64)) = 1.1.2
Provides:       bundled(npm(@protobufjs/codegen)) = 2.0.5
Provides:       bundled(npm(@protobufjs/eventemitter)) = 1.1.1
Provides:       bundled(npm(@protobufjs/fetch)) = 1.1.1
Provides:       bundled(npm(@protobufjs/float)) = 1.0.2
Provides:       bundled(npm(@protobufjs/path)) = 1.1.2
Provides:       bundled(npm(@protobufjs/pool)) = 1.1.0
Provides:       bundled(npm(@protobufjs/utf8)) = 1.1.2
Provides:       bundled(npm(@types/node)) = 26.5.1
Provides:       bundled(npm(ansi-regex)) = 5.0.1
Provides:       bundled(npm(ansi-styles)) = 4.3.0
Provides:       bundled(npm(cliui)) = 8.0.1
Provides:       bundled(npm(color-convert)) = 2.0.1
Provides:       bundled(npm(color-name)) = 1.1.4
Provides:       bundled(npm(emoji-regex)) = 8.0.0
Provides:       bundled(npm(escalade)) = 3.2.0
Provides:       bundled(npm(get-caller-file)) = 2.0.5
Provides:       bundled(npm(is-fullwidth-code-point)) = 3.0.0
Provides:       bundled(npm(lodash.camelcase)) = 4.3.0
Provides:       bundled(npm(long)) = 5.3.2
Provides:       bundled(npm(protobufjs)) = 7.6.6
Provides:       bundled(npm(require-directory)) = 2.1.1
Provides:       bundled(npm(string-width)) = 4.2.3
Provides:       bundled(npm(strip-ansi)) = 6.0.1
Provides:       bundled(npm(undici-types)) = 8.9.0
Provides:       bundled(npm(wrap-ansi)) = 7.0.0
Provides:       bundled(npm(y18n)) = 5.0.8
Provides:       bundled(npm(yargs)) = 17.7.3
Provides:       bundled(npm(yargs-parser)) = 21.1.1

%description
A Node daemon that reads Linux hardware sensors and serves them to the Sho
Metrics OpenDeck plugin over a gRPC unix socket. It covers every sensor in
/sys/class/hwmon (CPU and board temperatures, fans, voltages, power meters),
NVIDIA GPUs through LACT, AMD GPUs through amdgpu hwmon, and in-game FPS from
MangoHud logs.

The daemon runs as a systemd user service, not a system service, because it
reads the desktop user's MangoHud logs and serves a socket the plugin opens as
that same user. Enable it per user:

    systemctl --user enable --now shometrics-linux-helper.service

%prep
%setup -q -n %{name}-%{forkver} -a 1

%build
sed -e "s|@NODE@|%{_bindir}/node|" \
    -e "s|@SERVER_PATH@|%{libdir}/server.mjs|" \
    -e "s|@PROTO_DIR@|%{libdir}/proto|" \
    systemd/shometrics-linux-helper.service > shometrics-linux-helper.service

%install
mkdir -p %{buildroot}%{libdir}
cp -a server.mjs package.json proto node_modules %{buildroot}%{libdir}/
# npm leaves whatever umask it ran under; normalise before packaging.
find %{buildroot}%{libdir} -type d -exec chmod 0755 {} +
find %{buildroot}%{libdir} -type f -exec chmod 0644 {} +
chmod 0755 %{buildroot}%{libdir}/server.mjs

install -Dpm 0755 %{name} %{buildroot}%{_bindir}/%{name}
install -Dpm 0644 shometrics-linux-helper.service \
    %{buildroot}%{_userunitdir}/shometrics-linux-helper.service
install -Dpm 0644 udev/60-sho-metrics-rapl.rules \
    %{buildroot}%{_udevrulesdir}/60-sho-metrics-rapl.rules

%check
SHOMETRICS_PROTO_DIR=%{buildroot}%{libdir}/proto \
    node %{buildroot}%{libdir}/server.mjs --check

%post
%systemd_user_post shometrics-linux-helper.service

%preun
%systemd_user_preun shometrics-linux-helper.service

%files
%license LICENSE
%doc README.md
%{_bindir}/%{name}
%{libdir}/
%{_userunitdir}/shometrics-linux-helper.service
%{_udevrulesdir}/60-sho-metrics-rapl.rules

%changelog
* Sun Sep 20 2026 Emanuele Sparvoli <sparvoli@gmail.com> - 0.3.0^linux7-1
- Live CPU clock and per-core load and clock (fork tag v0.3.0-linux.7)

* Sun Sep 20 2026 Emanuele Sparvoli <sparvoli@gmail.com> - 0.3.0^linux6-1
- AMD and Intel GPU sensors from /sys/class/drm (fork tag v0.3.0-linux.6)

* Sat Sep 19 2026 Emanuele Sparvoli <sparvoli@gmail.com> - 0.3.0^linux5-1
- CPU package power, load, model; CPU temperature on Intel (fork tag v0.3.0-linux.5)

* Sat Sep 19 2026 Emanuele Sparvoli <sparvoli@gmail.com> - 0.3.0^linux4-1
- Fix a restart loop on machines without lactd (fork tag v0.3.0-linux.4)

* Sun Sep 13 2026 Emanuele Sparvoli <sparvoli@gmail.com> - 0.3.0^linux3-1
- First COPR build of the Linux helper daemon (fork tag v0.3.0-linux.3)
