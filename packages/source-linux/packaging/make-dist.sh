#!/usr/bin/env bash
# Builds the release tarballs that the AUR, COPR and PPA recipes consume.
#
#   ./make-dist.sh 0.3.0-linux.2
#
# Writes three files to packaging/dist:
#
#   sho-metrics-source-linux-<ver>.tar.gz               daemon + contract, no deps
#   sho-metrics-source-linux-<ver>-node-modules.tar.gz  vendored node_modules
#   sho-metrics-source-linux_<debver>.orig.tar.gz       both of the above, for dpkg
#
# The first two go on the GitHub release. The third stays local; dput uploads it
# with the Debian source package.
set -euo pipefail

forkver="${1:-}"
if [[ -z ${forkver} ]]; then
    echo "usage: $0 <fork version, e.g. 0.3.0-linux.2> [outdir]" >&2
    exit 1
fi
if [[ ! ${forkver} =~ ^[0-9]+\.[0-9]+\.[0-9]+-linux\.[0-9]+$ ]]; then
    echo "version must look like 0.3.0-linux.2" >&2
    exit 1
fi

name=sho-metrics-source-linux
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(git -C "${here}" rev-parse --show-toplevel)"
src="${repo}/packages/source-linux"
out="${2:-${here}/dist}"
base="${forkver%%-*}"                   # 0.3.0
debver="${forkver/-linux./+linux}"      # 0.3.0+linux2

# Read the constant rather than running the daemon: a fresh checkout has no
# node_modules yet, and importing @grpc/grpc-js would fail before --version.
helper_version="$(grep -oP 'const HELPER_VERSION = "\K[^"]+' "${src}/server.mjs")"
pkg_version="$(node -p "require('${src}/package.json').version")"
if [[ ${helper_version} != "${base}" || ${pkg_version} != "${base}" ]]; then
    echo "version mismatch: tag says ${base}, server.mjs says ${helper_version}, package.json says ${pkg_version}" >&2
    exit 1
fi

stage="$(mktemp -d)"
trap 'rm -rf "${stage}"' EXIT
tree="${stage}/${name}-${forkver}"
mkdir -p "${tree}/proto" "${tree}/systemd" "${out}"

cp "${src}/server.mjs" "${src}/package.json" "${src}/package-lock.json" "${src}/README.md" "${tree}/"
cp "${src}/systemd/shometrics-linux-helper.service" "${tree}/systemd/"
cp "${here}/common/${name}" "${tree}/"
chmod 0755 "${tree}/${name}"
cp -r "${repo}/contracts/proto/shometrics" "${tree}/proto/"
cp "${repo}/LICENSE" "${tree}/"
# It carries a shebang, so lintian expects it executable.
chmod 0755 "${tree}/server.mjs"

# Same bytes for the same tag: sorted entries, no uids, commit date as mtime,
# gzip without its own timestamp.
mtime="$(git -C "${repo}" log -1 --format=%cI)"
tar_flags=(--sort=name --owner=0 --group=0 --numeric-owner --mtime="${mtime}" --format=gnu)
pack() { tar -C "$1" "${tar_flags[@]}" -cf - "$2" | gzip -9n > "$3"; }

pack "${stage}" "${name}-${forkver}" "${out}/${name}-${forkver}.tar.gz"

echo "==> Vendoring dependencies from package-lock.json"
vendor="${stage}/vendor"
mkdir -p "${vendor}"
cp "${src}/package.json" "${src}/package-lock.json" "${vendor}/"
(
    cd "${vendor}"
    npm_config_cache="${stage}/npm-cache" npm ci --omit=dev --ignore-scripts --no-fund --no-audit >/dev/null
)
# Publishing metadata that npm ships and lintian rejects. None of it is read at
# runtime, so drop it rather than carry overrides for it.
find "${vendor}/node_modules" -type f \
    \( -name ".npmignore" -o -name ".gitignore" -o -name ".gitattributes" \
       -o -name ".travis.yml" -o -name ".editorconfig" \) -delete
pack "${vendor}" node_modules "${out}/${name}-${forkver}-node-modules.tar.gz"

# dpkg wants the upstream directory named after the Debian version, and Launchpad
# builders have no network, so the Debian orig carries node_modules already.
debtree="${stage}/${name}-${debver}"
cp -r "${tree}" "${debtree}"
cp -r "${vendor}/node_modules" "${debtree}/"
pack "${stage}" "${name}-${debver}" "${out}/${name}_${debver}.orig.tar.gz"

echo
echo "Wrote to ${out}:"
(cd "${out}" && sha256sum "${name}-${forkver}.tar.gz" "${name}-${forkver}-node-modules.tar.gz" "${name}_${debver}.orig.tar.gz")
echo
echo "Attach the first two to the GitHub release for tag v${forkver}."
