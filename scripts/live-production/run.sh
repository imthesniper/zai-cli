#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! command -v docker >/dev/null; then
  echo "Docker is required. Do not run the live editing script on your VPS host." >&2
  exit 2
fi
if [ ! -t 0 ] || [ ! -t 1 ]; then
  echo "An interactive terminal is required for private OAuth login." >&2
  exit 2
fi
echo "Building an isolated ZC test image. Only repository source, not host account data, is copied."
docker build --pull -f scripts/live-production/Dockerfile -t zc-live-production-smoke:0.2.0 .
echo "Running with no host mounts, no Docker socket, a non-root user, and read-only root filesystem."
docker run --rm -it \
  --user 10001:10001 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --read-only \
  --pids-limit=128 \
  --memory=3g \
  --cpus=2 \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=256m \
  --tmpfs /home/zctest:rw,nosuid,nodev,mode=0700,uid=10001,gid=10001,size=512m \
  --network bridge \
  --env ZC_LIVE_CONTAINER=1 \
  zc-live-production-smoke:0.2.0 "$@"
