#!/bin/bash
set -euo pipefail
# This recipe installs packages inside an owned, network-none build container only.
if [[ "${CALLSIGN_ALLOW_EXTERNAL_EXECUTION:-}" != infrastructure || "${CALLSIGN_OWNED_MEDIA_BUILD:-}" != yes || ! -f /.dockerenv || ! -d /sources/debs ]]; then
  echo 'OWNED_OFFLINE_MEDIA_BUILD_REQUIRED' >&2; exit 78
fi
for interface in /sys/class/net/*; do
  [[ "${interface##*/}" == lo ]] || { echo 'NETWORK_NONE_REQUIRED' >&2; exit 78; }
done
(cd /sources && sha256sum --strict -c inputs.sha256)
export DEBIAN_FRONTEND=noninteractive
printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d
mkdir -p /tmp/offline-debs/partial
cp /sources/debs/*.deb /tmp/offline-debs/
apt-get -o Dir::State::lists=/sources/apt-lists -o Dir::Cache::archives=/tmp/offline-debs -o Debug::NoLocking=true --no-download --no-install-recommends --yes install build-essential pkg-config libssl-dev libxml2-dev libsqlite3-dev libjansson-dev uuid-dev libsrtp2-dev libedit-dev libncurses-dev libcurl4-openssl-dev unixodbc-dev odbc-postgresql libevent-dev libpq-dev libhiredis-dev zlib1g-dev libunbound-dev libnss3-tools ca-certificates python3 bzip2 xz-utils patch wget curl
rm -rf /tmp/offline-debs
mkdir -p /build/cache
cp /sources/cache/* /build/cache/
cp -a /sources/asterisk-22.11.0 /build/asterisk
cd /build/asterisk
./configure --with-pjproject-bundled --with-externals-cache=/build/cache --without-libjwt --without-dahdi --without-pri
make menuselect.makeopts
menuselect/menuselect --disable BUILD_NATIVE --disable-category MENUSELECT_CORE_SOUNDS --disable-category MENUSELECT_EXTRA_SOUNDS --disable-category MENUSELECT_MOH menuselect.makeopts
make -j2
make install
cp -a /sources/coturn-4.6.3 /build/coturn
cd /build/coturn
./configure --prefix=/usr/local --sysconfdir=/etc
make -j2
make install
mkdir -p /usr/share/doc/callsign-media-build
cp /build/asterisk/COPYING /usr/share/doc/callsign-media-build/ASTERISK-COPYING
cp /build/coturn/LICENSE /usr/share/doc/callsign-media-build/COTURN-LICENSE
/usr/sbin/asterisk -V
/usr/local/bin/turnserver --version
rm -rf /build
