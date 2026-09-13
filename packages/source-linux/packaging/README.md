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

Where the packages live:

| Channel | Page |
| --- | --- |
| AUR | https://aur.archlinux.org/packages/sho-metrics-source-linux |
| COPR | https://copr.fedorainfracloud.org/coprs/emaspa/sho-metrics/ |
| PPA | https://launchpad.net/~sparvoli/+archive/ubuntu/sho-metrics |
| Release assets | https://github.com/emaspa/sho-metrics-linux/releases |

Credentials are not on the desktop. They live on the `openbox` host
(`ssh openbox`, already in `~/.ssh/config`), the same box OpenXLR publishes
from, which also happens to run the PPA's target release, Ubuntu 26.04:

| What | Where on openbox |
| --- | --- |
| COPR token | `~/.config/copr` |
| Launchpad OAuth token | `~/.config/launchpadlib-wireview.creds` |
| Package signing key | GPG `0E12EEBBC7B9A54D`, in the local keyring |
| dput, debsign, debhelper, lintian | installed system-wide |

copr-cli is not on the PATH over a non-interactive ssh session; call
`~/.local/bin/copr-cli`. The AUR is the exception to all of this and pushes
straight from the desktop over the default ssh key.

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
| AUR | `pkgver=0.3.0.linux.3` | `pkgrel` |
| RPM | `Version: 0.3.0^linux3` | `Release` |
| Debian | `0.3.0+linux3-0ppa1~ubuntu26.04.1` | the `0ppa1` part |

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

CI builds the packages. The Linux release workflow runs `make-dist.sh` for the
tag, then builds the three distro packages in containers and attaches
everything to the GitHub release:

```sh
gh workflow run linux-release.yml -R emaspa/sho-metrics-linux --ref linux \
    -f tag=v0.3.0-linux.3 -f plugin_version=0.3.0.3 \
    -f dry_run=true -f prerelease=false
```

Run it with `dry_run=true` first. That builds every package and lists the
staged assets without creating a tag or a release. Then run the same command
with `dry_run=false`.

One trap, learned the hard way: dispatching straight after a `git push` can
resolve the branch to the previous commit. Check first, and only dispatch once
they agree:

```sh
git rev-parse HEAD
gh api repos/emaspa/sho-metrics-linux/commits/linux -q .sha
```

A release carries these helper assets, all listed in `checksums.txt`:

| Asset | What |
| --- | --- |
| `sho-metrics-source-linux-<ver>.tar.gz` | daemon and contract, about 40 KB |
| `sho-metrics-source-linux-<ver>-node-modules.tar.gz` | dependencies from `npm ci --omit=dev` |
| `sho-metrics-source-linux-<ver>-1-any.pkg.tar.zst` | Arch package |
| `sho-metrics-source-linux-<ver>-1.fc43.noarch.rpm`, `...fc44...` | Fedora packages |
| `sho-metrics-source-linux_<ver>_all.deb` | Ubuntu 26.04 package |

Asset names are normalised when they are staged. GitHub rewrites characters
outside `[A-Za-z0-9._-]` on upload, which would mangle the RPM's `^` and the
deb's `+` and `~`, so those files are renamed to the fork version. What is
inside each package is untouched.

The three publishing channels below all build from the source tarball asset
rather than from a checkout, so the thing users install is the thing the
release published. `make-dist.sh` still works locally for testing:

```sh
cd packages/source-linux/packaging
./make-dist.sh 0.3.0-linux.3
```

It also writes `sho-metrics-source-linux_<debver>.orig.tar.gz`, which is not a
release asset. That one is for dpkg and is rebuilt on the machine that signs
the PPA upload.

Tar entries are sorted, timestamped from the tag's commit and stripped of uids,
and gzip runs with `-n`, so rebuilding from the same commit gives the same
bytes and the same checksums.

## AUR

Published as
[sho-metrics-source-linux](https://aur.archlinux.org/packages/sho-metrics-source-linux).
The clone lives at `~/aur-publish/sho-metrics-source-linux`, next to the
OpenXLR ones, and pushes over the default ssh key. Check access with
`ssh -T aur@aur.archlinux.org`.

### Publish

```sh
cd ~/aur-publish/sho-metrics-source-linux
cp ~/sho_metrics/packages/source-linux/packaging/aur/PKGBUILD .
cp ~/sho_metrics/packages/source-linux/packaging/aur/sho-metrics-source-linux.install .

updpkgsums                          # fills in sha256sums from the release asset
makepkg --printsrcinfo > .SRCINFO   # required, the AUR rejects pushes without it
makepkg -f                          # build it once before pushing

git add PKGBUILD .SRCINFO sho-metrics-source-linux.install
git commit -m "sho-metrics-source-linux 0.3.0.linux.3-1: initial release"
git push
```

`updpkgsums` downloads the release asset and writes its real checksum, so the
release has to exist first. The `PKGBUILD` in this repo carries the checksum
that was actually published; if you bump `_forkver` without running
`updpkgsums`, makepkg will refuse the mismatched tarball. Never paper over that
with `SKIP`, which makes makepkg accept any tarball silently.

Copy the updated `PKGBUILD` and `.SRCINFO` back into this repo after pushing,
so the two stay in step.

`build()` runs `npm ci` against the lockfile, which needs network during the
build. That is normal for AUR Node packages and it keeps the dependency set
identical to the lockfile. The user never runs npm.

For a packaging-only fix, bump `pkgrel` and push again. For a new fork tag,
change `_forkver` and `pkgver`, reset `pkgrel=1`, then `updpkgsums` and
regenerate `.SRCINFO`.

Users install it the usual way:

```sh
yay -S sho-metrics-source-linux
systemctl --user enable --now shometrics-linux-helper.service
```

## COPR

The project is https://copr.fedorainfracloud.org/coprs/emaspa/sho-metrics/,
built for fedora-43-x86_64 and fedora-44-x86_64, the two releases Bodhi lists
as current. It was created with:

```sh
ssh openbox '~/.local/bin/copr-cli create sho-metrics \
    --chroot fedora-43-x86_64 --chroot fedora-44-x86_64 \
    --description "..." --instructions "..."'
```

Internet access during builds stays off; the dependencies arrive inside the
source RPM. Add a chroot later with `copr-cli edit-chroot`, and add a repo to
one chroot rather than to the project, which would clear the project list.

### Publish

Build the source RPM from the release assets, then hand it to COPR. The SRPM
can be built anywhere, including Arch: `rpmbuild -bs` only packs the spec and
its sources, and the `%systemd_user_*` macros expand later inside the Fedora
build root.

```sh
mkdir -p rpmbuild/SOURCES
gh release download v0.3.0-linux.3 -R emaspa/sho-metrics-linux \
    -p "sho-metrics-source-linux-0.3.0-linux.3.tar.gz" \
    -p "sho-metrics-source-linux-0.3.0-linux.3-node-modules.tar.gz" \
    -D rpmbuild/SOURCES
rpmbuild --define "_topdir $PWD/rpmbuild" -bs packages/source-linux/packaging/rpm/sho-metrics-source-linux.spec

scp 'rpmbuild/SRPMS/sho-metrics-source-linux-0.3.0^linux3-1.src.rpm' openbox:~/sho-metrics-copr/
ssh openbox '~/.local/bin/copr-cli build --nowait emaspa/sho-metrics ~/sho-metrics-copr/sho-metrics-source-linux-0.3.0\^linux3-1.src.rpm'
ssh openbox '~/.local/bin/copr-cli watch-build <build id>'
```

Escape the `^` in the filename over ssh, or the remote shell treats it as a
pipe character.

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
`make-source-package.sh 0.3.0-linux.3 <series> <release number>`, which rewrites
the changelog suffix for you.

The PPA is https://launchpad.net/~sparvoli/+archive/ubuntu/sho-metrics, under
the Launchpad account `~sparvoli`, signed with key `0E12EEBBC7B9A54D`.

### How the PPA was created, without a browser

openbox holds an OAuth token at `~/.config/launchpadlib-wireview.creds`, left
over from the WireView PPA work and good for writes across the account. Loading
it is enough to authenticate:

```python
from launchpadlib.launchpad import Launchpad
from launchpadlib.credentials import Credentials
c = Credentials.load_from_path("/home/emanuele/.config/launchpadlib-wireview.creds")
lp = Launchpad(c, None, None, service_root="production", version="devel")
print(lp.me.name)   # sparvoli
```

Reads work fine through that object. `lp.me.createPPA(...)` does not: it
returns the person entry, raises nothing, and creates nothing, on launchpadlib
2.1.0. Do not trust its silence, and check `lp.me.ppas` afterwards.

Posting the operation by hand works and reports what happened. Launchpad signs
with OAuth 1.0 PLAINTEXT, so the signature is just the two secrets joined by an
encoded ampersand:

```
POST https://api.launchpad.net/devel/~sparvoli
Authorization: OAuth realm="https://api.launchpad.net/",
  oauth_consumer_key=..., oauth_token=...,
  oauth_signature_method="PLAINTEXT",
  oauth_signature="<consumer_secret>%26<access_secret>",
  oauth_timestamp=..., oauth_nonce=..., oauth_version="1.0"
body: ws.op=createPPA&name=sho-metrics&displayname=...&description=...
```

That returns `201 Created` with the new archive in the `Location` header. There
is no series setting to configure afterwards: a PPA builds whatever series an
upload's changelog names, which is why the changelog says `resolute`.

### Publish

openbox runs Ubuntu 26.04, which is the target series, so the source package is
built and signed there from a clean checkout of the tag:

```sh
ssh openbox
git clone --depth 1 --branch v0.3.0-linux.3 https://github.com/emaspa/sho-metrics-linux.git ~/sho-metrics-ppa/repo
cd ~/sho-metrics-ppa/repo
packages/source-linux/packaging/make-dist.sh 0.3.0-linux.3
export DEBEMAIL="sparvoli@gmail.com" DEBFULLNAME="Emanuele Sparvoli"
DPKG_FLAGS="-S -sa -k0E12EEBBC7B9A54D" \
    packages/source-linux/packaging/debian/make-source-package.sh 0.3.0-linux.3
dput ppa:sparvoli/sho-metrics \
    packages/source-linux/packaging/dist/deb-resolute/sho-metrics-source-linux_0.3.0+linux3-0ppa1~ubuntu26.04.1_source.changes
```

dput re-checks both signatures before it uploads, then ftps the five files up.
It warns that the upload includes an `.orig.tar.gz` the Debian revision does
not require; that is the `-sa` flag doing its job on a first upload of this
upstream version, and it is correct here.

Watch what Launchpad does with it, without waiting for the mail:

```sh
A=https://api.launchpad.net/devel/~sparvoli/+archive/ubuntu/sho-metrics
curl -s "$A?ws.op=getPublishedSources&source_name=sho-metrics-source-linux"
curl -s "$A?ws.op=getBuildRecords&source_name=sho-metrics-source-linux"
```

The source shows up a couple of minutes after the upload, first as `Pending`,
then `Published` once the publisher has run. The build record moves through
`Currently building`, `Uploading build`, and `Successfully built`. Querying the
collection endpoints can hand back a stale state, so confirm against the build
itself at `.../+build/<id>` before believing a result.

`DEBEMAIL` and `DEBFULLNAME` have to match the key, or the signature check
rejects the upload. `make-source-package.sh` unpacks the orig tarball, drops
`debian/` in, and runs `dpkg-buildpackage`, which signs both the `.dsc` and the
`.changes`. Verify with `gpg --verify *_source.changes` before uploading.

The `-sa` flag includes the orig tarball, which Launchpad needs the first time
it sees upstream version `0.3.0+linux3`. Later revisions of the same upstream
version can use `-sd` to skip re-uploading it. Launchpad emails a result within
minutes and will not accept the same version twice, so bump the `0ppa1` part
after a rejection.

Users then install with:

```sh
sudo add-apt-repository ppa:sparvoli/sho-metrics
sudo apt install sho-metrics-source-linux
```

For a new fork tag, add a changelog entry with
`dch -v 0.3.0+linux3-0ppa1~ubuntu26.04.1 -D resolute`, or edit
`debian/changelog` by hand, and commit it to the fork. Keep one entry per fork
revision and leave the distribution field at `resolute`;
`make-source-package.sh` rewrites it on the fly when you build for another
series, so the file in git stays the resolute one.

## What CI checks

Every release build, and every dry run, proves the following without anyone
remembering to:

- `makepkg` builds the Arch package in `archlinux:base-devel`, and its
  `check()` runs `server.mjs --check`, which loads the gRPC contract from the
  packaged path. A broken proto layout fails the release.
- `rpmbuild` builds the RPM in `fedora:43` and `fedora:44`, `%check` runs the
  same probe, and the job then asserts that the `%systemd_user_*` scriptlets
  actually expanded. That last one matters because the maintainer's Arch box
  has no `systemd-rpm-macros` and cannot expand them.
- `dpkg-buildpackage` builds the deb in `ubuntu:26.04` through the real
  debhelper sequence, and lintian runs over the result. Arch has no debhelper,
  so before this existed the `dh` sequence had never run anywhere.
- `make-dist.sh` refuses to build if the tag disagrees with `HELPER_VERSION`
  and `package.json`.

The four container builds run in parallel and finish in about a minute each.

Still not covered, and worth knowing:

- `namcap` and `rpmlint` are not run anywhere yet.
- Nothing installs the packages and starts the service. The Arch and Fedora
  builds run the daemon's self-check, which is not the same as a real install.
- Launchpad's own build of the source package. That is only visible after the
  first upload.
- lintian keeps two overridden findings, a missing man page and a file mode
  inside a vendored dependency. Both reasons are written down in
  `debian/sho-metrics-source-linux.lintian-overrides`.
