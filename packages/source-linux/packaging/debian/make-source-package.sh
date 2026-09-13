#!/usr/bin/env bash
# Assembles and signs the Debian source package for a PPA upload.
#
#   ./make-source-package.sh 0.3.0-linux.2                # resolute, 26.04 LTS
#   ./make-source-package.sh 0.3.0-linux.2 questing 25.10 # another series
#
# Run this on Ubuntu (or in a container of the target series). It needs dpkg-dev,
# debhelper and devscripts, plus the GPG key Launchpad knows about. Run
# ../make-dist.sh first: this script consumes packaging/dist/*.orig.tar.gz.
#
# DPKG_FLAGS overrides what dpkg-buildpackage is told to do. The default builds
# a signed source package, which is what Launchpad accepts. CI sets
# DPKG_FLAGS="-b -us -uc" to build an unsigned binary .deb instead.
set -euo pipefail

forkver="${1:-}"
series="${2:-resolute}"
ubuntuver="${3:-26.04}"
if [[ -z ${forkver} ]]; then
    echo "usage: $0 <fork version, e.g. 0.3.0-linux.2> [series] [ubuntu version]" >&2
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

# One changelog lives in git, for resolute. Other series get the same entry with
# the suffix swapped, which is what a PPA rebuild across series needs.
if [[ ${series} != resolute ]]; then
    (
        cd "${work}/${name}-${debver}"
        sed -i -e "1s/~ubuntu[0-9.]*1)/~ubuntu${ubuntuver}.1)/" \
               -e "1s/) [a-z]*;/) ${series};/" debian/changelog
    )
fi

cd "${work}/${name}-${debver}"
head -1 debian/changelog
read -r -a dpkg_flags <<< "${DPKG_FLAGS:--S -sa}"
dpkg-buildpackage "${dpkg_flags[@]}"

echo
echo "Built in ${work}:"
find "${work}" -maxdepth 1 -type f \( -name "*.dsc" -o -name "*.changes" -o -name "*.deb" -o -name "*.tar.*" \) -printf "%12s  %f\n" | sort -k2
