# Supply the locally audited offline build image; this file does not download or compile dependencies.
ARG MEDIA_BUILD_IMAGE
FROM ${MEDIA_BUILD_IMAGE} AS asterisk
LABEL org.opencontainers.image.title="CallSign Asterisk" org.opencontainers.image.version="22.11.0"
USER 1000:1000
CMD ["/usr/sbin/asterisk", "-f", "-n"]
FROM ${MEDIA_BUILD_IMAGE} AS turn
LABEL org.opencontainers.image.title="CallSign coturn" org.opencontainers.image.version="4.6.3"
USER 1000:1000
CMD ["/usr/local/bin/turnserver", "-c", "/etc/coturn/turnserver.conf"]
