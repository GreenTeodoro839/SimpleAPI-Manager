# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /src

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS server-builder
WORKDIR /src/apps/manager-server

COPY apps/manager-server/go.mod apps/manager-server/go.sum ./
RUN go mod download

COPY apps/manager-server ./
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/simpleapi-manager ./cmd/simpleapi-manager

FROM --platform=$BUILDPLATFORM alpine:3.20 AS simpleapi-downloader
ARG TARGETOS
ARG TARGETARCH
ARG SIMPLEAPI_VERSION=v0.3.1
ARG SIMPLEAPI_CONFIG_REF=v0.3.1
RUN apk add --no-cache ca-certificates curl tar
RUN set -eux; \
    if [ "$TARGETOS" != "linux" ]; then echo "unsupported target os: $TARGETOS" >&2; exit 1; fi; \
    case "$TARGETARCH" in amd64|arm64) ;; *) echo "unsupported target arch: $TARGETARCH" >&2; exit 1 ;; esac; \
    asset="proxy-${TARGETOS}-${TARGETARCH}.tar.gz"; \
    base_url="https://github.com/GreenTeodoro839/SimpleAPI/releases/download/${SIMPLEAPI_VERSION}"; \
    mkdir -p /out; \
    curl -fsSL "$base_url/checksums-sha256.txt" -o /tmp/checksums-sha256.txt; \
    curl -fsSL "$base_url/$asset" -o "/tmp/$asset"; \
    cd /tmp; \
    checksum_line="$(grep "  $asset\$" checksums-sha256.txt)"; \
    printf '%s\n' "$checksum_line" | sha256sum -c -; \
    tar -xzf "$asset" -C /out proxy; \
    mv /out/proxy /out/simpleapi; \
    chmod +x /out/simpleapi; \
    curl -fsSL "https://raw.githubusercontent.com/GreenTeodoro839/SimpleAPI/${SIMPLEAPI_CONFIG_REF}/config.yaml" -o /out/simpleapi-config.example.yaml

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tini && \
    addgroup -S app && \
    adduser -S -D -H -G app -u 10001 app && \
    mkdir -p /app /data && \
    chown -R app:app /app /data

COPY --from=server-builder --chown=app:app /out/simpleapi-manager /app/simpleapi-manager
COPY --from=web-builder --chown=app:app /src/apps/web/dist /app/panel
COPY --from=simpleapi-downloader --chown=app:app /out/simpleapi /app/simpleapi
COPY --from=simpleapi-downloader --chown=app:app /out/simpleapi-config.example.yaml /app/simpleapi-config.example.yaml
COPY --chown=app:app docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV HTTP_ADDR=0.0.0.0:18318
ENV DATA_DIR=/data
ENV PANEL_PATH=/app/panel
ENV SIMPLEAPI_LISTEN=0.0.0.0:8317
ENV SIMPLEAPI_LOG_LEVEL=info
ENV SIMPLEAPI_MANAGER_AUTO_CONNECT=true

USER app
EXPOSE 18318 8317
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:18318/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
