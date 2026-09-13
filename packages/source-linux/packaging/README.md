# Packaging the Linux helper for AUR, COPR and PPA

Three recipes that ship the same thing: the helper daemon, the gRPC contract it
loads at runtime, its Node dependencies, and a systemd user unit. The daemon
itself is unchanged across the three.

```
packaging/
  make-dist.sh                    builds the release tarballs
  common/sho-metrics-source-linux launcher installed as /usr/bin/...
  aur/PKGBUILD, .SRCINFO, .install
  rpm/sho-metrics-source-linux.spec
  debian/                         control, rules, changelog, copyright, ...
  debian/make-source-package.sh   assembles and signs the PPA upload
  dist/                           build output, not in git
```

## What gets installed

Same paths on all three distros:

| Path | What |
| --- | --- |
| `/usr/lib/sho-metrics-source-linux/server.mjs` | the daemon |
| `/usr/lib/sho-metrics-source-linux/node_modules/` | vendored deps |
| `/usr/lib/sho-metrics-source-linux/proto/shometrics/v1/` | the gRPC contract |
| `/usr/bin/sho-metrics-source-linux` | launcher for manual runs |
| `/usr/lib/systemd/user/shometrics-linux-helper.service` | the user unit |

Two constraints come from the plugin side and must not drift. The unit is named
`shometrics-linux-helper.service`, because the property inspector reads that
exact name through `systemctl --user show`. The socket stays at
`/tmp/shometrics-helper/ShoMetrics.Source.Windows.Grpc.v1`, hardcoded in the
plugin's transport.

The unit ships disabled. Every recipe tells the user to run it per account:

```sh
systemctl --user enable --now shometrics-linux-helper.service
```

That is deliberate. The daemon reads the desktop user's MangoHud logs and serves
a socket the plugin opens as that same user, so a system service would serve the
wrong account.

### How the contract gets found

`server.mjs` loads `shometrics/v1/helper_grpc_service.proto` at startup with
`@grpc/proto-loader`. In a git checkout the include directory is two levels up,
at `contracts/proto`. A package has no such layout, so the daemon now reads
`SHOMETRICS_PROTO_DIR` first and falls back to the checkout path when the
variable is unset. `install.sh` keeps working unchanged, and the packaged unit
sets the variable to `/usr/lib/sho-metrics-source-linux/proto`.

`server.mjs --check` loads the contract, enumerates sensors and exits without
binding the socket, so it is safe to run while the real daemon is serving. The
AUR and RPM recipes run it as their build-time test.

## Versioning

Fork releases are tagged `v0.3.0-linux.N`: upstream helper version 0.3.0, fork
revision N. Each packaging system needs that written its own way.

| | Version | Bump for a packaging-only fix |
| --- | --- | --- |
| AUR | `pkgver=0.3.0.linux.1` | `pkgrel` |
| RPM | `Version: 0.3.0^linux1` | `Release` |
| Debian | `0.3.0+linux1-0ppa1~ubuntu26.04.1` | the `0ppa1` part |

The separators are not interchangeable. Arch forbids `-` in `pkgver`. RPM's `^`
sorts above plain `0.3.0`, which is what a fork revision should do, and needs
rpm 4.15 or newer (Fedora 31 and up). Debian's `+` does the same job there. The
`~ubuntu26.04.1` suffix is there so the same source can be rebuilt for another
series later without a version clash. It uses the release number rather than
the codename because numbers sort in release order and codenames do not.

When `HELPER_VERSION` in `server.mjs` moves to 0.4.0, the next tag is
`v0.4.0-linux.1` and all three versions reset accordingly. `make-dist.sh`
refuses to build if the tag argument disagrees with `server.mjs` or
`package.json`.

## Every release starts here

Tag the fork, then build the tarballs:

```sh
cd packages/source-linux/packaging
./make-dist.sh 0.3.0-linux.1
```

That writes three files to `dist/`:

- `sho-metrics-source-linux-0.3.0-linux.1.tar.gz`, the daemon and the contract,
  about 40 KB
- `sho-metrics-source-linux-0.3.0-linux.1-node-modules.tar.gz`, dependencies
  installed from `package-lock.json` with `npm ci --omit=dev`
- `sho-metrics-source-linux_0.3.0+linux1.orig.tar.gz`, both of the above in one
  tree, for dpkg

Attach the first two to the GitHub release for the tag. The AUR and RPM recipes
download them from there. The third one stays local; `dput` uploads it with the
Debian source package.

Tar entries are sorted, timestamped from the tag's commit and stripped of uids,
and gzip runs with `-n`, so rebuilding from the same tag gives the same bytes
and the same checksums.

## AUR

The name `sho-metrics-source-linux` was free when this was written (checked
against the aurweb RPC; `shometrics` matched nothing at all).

### One-time setup

Create an account at https://aur.archlinux.org, add an SSH public key under My
Account, then:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/aur -C "aur"
cat >> ~/.ssh/config <<'EOF'
Host aur.archlinux.org
  IdentityFile ~/.ssh/aur
  User aur
EOF
git clone ssh://aur@aur.archlinux.org/sho-metrics-source-linux.git ~/src/aur-sho-metrics
```

The clone is empty for a new package. That is normal; the first push creates it.

### Publish

```sh
cd ~/src/aur-sho-metrics
cp ~/sho_metrics/packages/source-linux/packaging/aur/PKGBUILD .
cp ~/sho_metrics/packages/source-linux/packaging/aur/sho-metrics-source-linux.install .

updpkgsums                          # fills in sha256sums from the release asset
makepkg --printsrcinfo > .SRCINFO   # required, the AUR rejects pushes without it
makepkg -f                          # build it once before pushing

git add PKGBUILD .SRCINFO sho-metrics-source-linux.install
git commit -m "sho-metrics-source-linux 0.3.0.linux.1-1"
git push
```

The committed `PKGBUILD` carries a zeroed `sha256sums` placeholder because the
release asset does not exist until you upload it. `updpkgsums` replaces it.
Never push the placeholder, and never replace it with `SKIP`: makepkg would
then accept a tampered tarball silently.

`build()` runs `npm ci` against the lockfile, which needs network during the
build. That is normal for AUR Node packages and it keeps the dependency set
identical to the lockfile. The user never runs npm.

For a packaging-only fix, bump `pkgrel` and push again. For a new fork tag,
change `_forkver` and `pkgver`, reset `pkgrel=1`, then `updpkgsums` and
regenerate `.SRCINFO`.

## COPR

### One-time setup

Get an account at https://copr.fedorainfracloud.org (FAS login), then visit
https://copr.fedorainfracloud.org/api/ and paste the token block into
`~/.config/copr`. Recent copr-cli versions also offer `copr-cli login`, which
does the same through the browser; check `copr-cli login --help` before relying
on it.

Install the client with `dnf install copr-cli` on Fedora, or `pip install
copr-cli` anywhere else.

Create the project once, choosing chroots from `copr-cli list-chroots`:

```sh
copr-cli create sho-metrics \
    --chroot fedora-42-x86_64 --chroot fedora-43-x86_64 \
    --description "Sho Metrics Linux helper daemon"
```

Internet access during builds is not needed; the dependencies arrive in the
source RPM.

### Publish

Build the source RPM, then hand it to COPR. From the repository root:

```sh
mkdir -p rpmbuild/SOURCES
cp packages/source-linux/packaging/dist/sho-metrics-source-linux-0.3.0-linux.1*.tar.gz rpmbuild/SOURCES/
rpmbuild --define "_topdir $PWD/rpmbuild" -bs packages/source-linux/packaging/rpm/sho-metrics-source-linux.spec
copr-cli build emaspa/sho-metrics rpmbuild/SRPMS/sho-metrics-source-linux-0.3.0^linux1-1*.src.rpm
```

The `cp` step is only a shortcut for tarballs you just built. Once the release
assets are up, `spectool -g -R -C rpmbuild/SOURCES <spec>` (from rpmdevtools)
downloads them instead.

`rpmbuild -bs` only packs the spec and its sources, so an SRPM built on a
non-Fedora machine is fine: the `%systemd_user_*` macros expand inside the
Fedora build root, not here.

Users then install with:

```sh
sudo dnf copr enable emaspa/sho-metrics
sudo dnf install sho-metrics-source-linux
```

For a new fork tag, edit `%global forkver`, `Version` and the `%changelog` in
the spec, and refresh the `bundled(npm(...))` list if `package-lock.json`
changed:

```sh
python3 -c "
import json
d = json.load(open('packages/source-linux/package-lock.json'))
for k, v in sorted(d['packages'].items()):
    if k.startswith('node_modules/'):
        print('Provides:       bundled(npm(%s)) = %s' % (k[13:], v['version']))
"
```

## PPA

Target series is resolute (26.04 LTS), and only that one.

Resolute ships nodejs 22.22.1 in universe, which satisfies the package's
`nodejs (>= 20)` dependency with nothing added. Checked against
packages.ubuntu.com on 2026-09-13. Universe is enabled by default on Ubuntu
desktop installs, so most users need no extra step, but a minimal or server
install may need `sudo add-apt-repository universe` first.

Older series are a different story and are the reason this is resolute-only:
noble (24.04 LTS) still ships nodejs 18.19.1, too old for the daemon, and would
force users into a NodeSource repository. Questing (25.10) has 20.19.4 and would
work. To build for another series anyway, run
`make-source-package.sh 0.3.0-linux.1 <series> <release number>`, which rewrites
the changelog suffix for you.

### One-time setup

1. Create a Launchpad account and sign in.
2. Upload your OpenPGP public key: `gpg --send-keys --keyserver keyserver.ubuntu.com <FINGERPRINT>`,
   then add the fingerprint at https://launchpad.net/~/+editpgpkeys and confirm
   the encrypted mail Launchpad sends back.
3. Add your SSH public key at https://launchpad.net/~/+editsshkeys.
4. Create the PPA at https://launchpad.net/~YOURUSER/+activate-ppa. Name it
   `sho-metrics`.
5. Install the tooling on an Ubuntu machine or container:
   `sudo apt install devscripts debhelper dput dpkg-dev`.

### Publish

```sh
cd packages/source-linux/packaging
./make-dist.sh 0.3.0-linux.1
./debian/make-source-package.sh 0.3.0-linux.1
dput ppa:emaspa/sho-metrics dist/deb-resolute/sho-metrics-source-linux_0.3.0+linux1-0ppa1~ubuntu26.04.1_source.changes
```

`make-source-package.sh` unpacks the orig tarball, drops `debian/` in, and runs
`dpkg-buildpackage -S -sa`, which signs the upload with your default GPG key.
Use `-k<FINGERPRINT>` if you have several. Launchpad emails a result within
minutes and will not accept the same version twice, so bump the `0ppa1` part
after a rejection.

The `-sa` flag includes the orig tarball in the upload, which Launchpad needs
the first time it sees upstream version `0.3.0+linux1`. Later revisions of the
same upstream version can use `-sd` to skip re-uploading it.

Users then install with:

```sh
sudo add-apt-repository ppa:emaspa/sho-metrics
sudo apt install sho-metrics-source-linux
```

Set the PPA's supported series to resolute in its Launchpad settings, so a
mistargeted upload fails loudly instead of building against something else.

For a new fork tag, add a changelog entry with
`dch -v 0.3.0+linux2-0ppa1~ubuntu26.04.1 -D resolute`, or edit
`debian/changelog` by hand, and commit it to the fork. Keep one entry per fork
revision and leave the distribution field at `resolute`;
`make-source-package.sh` rewrites it on the fly when you build for another
series, so the file in git stays the resolute one.

## What was verified, and what was not

Run on this machine (Arch, CachyOS):

- A full `makepkg -f` build of the AUR package against a locally built source
  tarball. `check()` passed, reporting 108 sensors. The resulting
  `.pkg.tar.zst` has the layout above, the unit has its placeholders filled in,
  and running the packaged `server.mjs --check` out of the extracted package
  works.
- `systemd-analyze verify --user` on the rendered unit.
- `rpmbuild -bs` and a full `rpmbuild -bb` of the spec, including `%check`. The
  binary RPM has the same payload as the Arch package. Local rpm lacks
  `systemd-rpm-macros`, so the build needed
  `--define "_userunitdir /usr/lib/systemd/user"` and the scriptlets stayed
  unexpanded in the local artifact. The macro names were checked against
  systemd's `macros.systemd.in`: `%systemd_user_post` runs `systemctl
  --no-reload preset --global`, so the unit stays disabled unless a Fedora
  preset says otherwise.
- `dpkg-parsechangelog` on the changelog, which reads back version
  `0.3.0+linux1-0ppa1~ubuntu26.04.1` for distribution `resolute`; both payload
  targets of `debian/rules` run directly (they produce the same tree as the
  other two packages); and `dpkg-source -b` producing a clean `3.0 (quilt)`
  source package. The series rewrite in `make-source-package.sh` was run against
  the changelog on its own and parses back as questing 25.10.
- The AUR name check against the aurweb RPC, and the resolute nodejs version
  against packages.ubuntu.com.

Not possible here, so hand-reviewed only:

- The debhelper sequence. There is no debhelper, dpkg-buildpackage `-b` or
  lintian on Arch and no container runtime on this machine, so `dh` was never
  run. The `override_dh_auto_*` targets were run by hand instead. Watch the
  first Launchpad build log.
- `namcap` on the Arch package and `rpmlint` on the RPM. Neither is installed.
- Any actual install. Nothing was installed, and the running
  `shometrics-linux-helper.service` was left alone throughout.
- COPR and Launchpad uploads. No credentials were used and nothing was pushed to
  either service.
