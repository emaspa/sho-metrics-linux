#!/usr/bin/env bash
# Assembles and signs the Debian source package for a PPA upload.
#
#   ./make-source-package.sh 0.3.0-linux.1              # noble, Ubuntu 24.04
#   ./make-source-package.sh 0.3.0-linux.1 plucky 25.04 # another series
#
# Run this on Ubuntu (or in a container of the target series). It needs dpkg-dev,
# debhelper and devscripts, plus the GPG key Launchpad knows about. Run
# ../make-dist.sh first: this script consumes packaging/dist/*.orig.tar.gz.
set -euo pipefail

forkver="${1:-}"
series="${2:-noble}"
ubuntuver="${3:-24.04}"
if [[ -z ${forkver} ]]; then
    echo "usage: $0 <fork version, e.g. 0.3.0-linux.1> [series] [ubuntu version]" >&2
    exit 1
fi

name=sho-metrics-source-linux
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dist="${here}/../dist"
debver="${forkver/-linux./+linux}"
orig="${dist}/${name}_${debver}.orig.tar.gz"

if [[ ! -f ${orig} ]]; then
    echo "missing ${orig}, run ../make-dist.sh ${forkver} first" >&2
    exit 1
fi

work="${dist}/deb-${series}"
rm -rf "${work}"
mkdir -p "${work}"
cp "${orig}" "${work}/"
tar -C "${work}" -xzf "${orig}"
cp -r "${here}" "${work}/${name}-${debver}/debian"
rm -f "${work}/${name}-${debver}/debian/make-source-package.sh"

# One changelog lives in git, for noble. Other series get the same entry with the
# series suffix swapped, which is what a PPA rebuild across series needs.
if [[ ${series} != noble ]]; then
    (
        cd "${work}/${name}-${debver}"
        sed -i -e "1s/~ubuntu[0-9.]*1)/~ubuntu${ubuntuver}.1)/" \
               -e "1s/) [a-z]*;/) ${series};/" debian/changelog
    )
fi

cd "${work}/${name}-${debver}"
head -1 debian/changelog
dpkg-buildpackage -S -sa

echo
echo "Built in ${work}:"
ls "${work}"/*.dsc "${work}"/*_source.changes
