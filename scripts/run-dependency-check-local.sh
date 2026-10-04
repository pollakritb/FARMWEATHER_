#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_DIR="${ODC_MIRROR_DIR:-/tmp/farmweather-nvd-mirror}"
DATA_DIR="${ODC_DATA_DIR:-/tmp/farmweather-odc-data}"
REPORT_DIR="${ODC_REPORT_DIR:-$ROOT/security-reports/$(date +%F)/dependency-check}"
PORT="${ODC_MIRROR_PORT:-18765}"

if [[ ! -s "$MIRROR_DIR/nvdcve-modified.json.gz" ]]; then
  echo "NVD mirror missing. Run: python3 scripts/sync-nvd-mirror.py '$MIRROR_DIR'" >&2
  exit 1
fi

mkdir -p "$DATA_DIR" "$REPORT_DIR"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$MIRROR_DIR" >"$REPORT_DIR/mirror-http.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for attempt in 1 2 3 4 5; do
  if curl --silent --fail "http://127.0.0.1:$PORT/nvdcve-modified.meta" >/dev/null; then
    break
  fi
  sleep 1
done
curl --silent --fail "http://127.0.0.1:$PORT/nvdcve-modified.meta" >/dev/null

extra_args=()
if [[ "${ODC_LOCAL_ONLY:-0}" == "1" ]]; then
  extra_args+=(--disableNodeAudit)
fi

docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  --volume "$ROOT:/src:ro" \
  --volume "$DATA_DIR:/usr/share/dependency-check/data" \
  --volume "$REPORT_DIR:/report" \
  owasp/dependency-check:latest \
  --project FarmWeather \
  --scan /src/package-lock.json \
  --scan /src/package.json \
  --out /report \
  --format HTML --format JSON \
  --log /report/dependency-check.log \
  --nvdDatafeed "http://127.0.0.1:$PORT/nvdcve-{0}.json.gz" \
  --disableCentral --disableOssIndex \
  --disableHostedSuppressions --disableKnownExploited \
  --disableRetireJs --disableVersionCheck \
  "${extra_args[@]}"
