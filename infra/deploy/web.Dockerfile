# Rebuild for the competition trust/certificate; no host node_modules/source/cache mount required.
ARG PREPARED_RUNTIME_IMAGE
ARG NGINX_IMAGE
FROM ${PREPARED_RUNTIME_IMAGE} AS build
ARG VITE_SERVICE_TRUST_SHA256
ENV VITE_SERVICE_TRUST_SHA256=${VITE_SERVICE_TRUST_SHA256} VITE_PROTOCOL_PROFILE=service
RUN node -e 'if(!/^[a-f0-9]{64}$/.test(process.env.VITE_SERVICE_TRUST_SHA256||""))process.exit(1)' \
 && pnpm --filter @callsign/web exec vite build --outDir /tmp/web-dist
FROM ${NGINX_IMAGE} AS web
ARG VITE_SERVICE_TRUST_SHA256
LABEL org.callsign.trust-sha256=${VITE_SERVICE_TRUST_SHA256}
COPY --from=build /tmp/web-dist /usr/share/nginx/html
COPY infra/deploy/nginx.conf /etc/nginx/conf.d/default.conf
