#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose --env-file /dev/null -f compose.classroom.yml --profile sonar)
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is unavailable. Start Docker Desktop / Docker Engine and check Docker permissions.' >&2
  exit 1
fi
trap 'echo "SonarQube failed. Check: docker compose --env-file /dev/null -f compose.classroom.yml logs --tail=100 sonarqube" >&2' ERR
echo 'Starting SonarQube; the first run can take several minutes...'
"${compose[@]}" up -d sonarqube
"${compose[@]}" run --rm --no-deps sonar-init
address=$("${compose[@]}" port sonarqube 9000)
port=${address##*:}
url="http://localhost:${port}"
printf '\nSonarQube is ready: %s\nLogin: admin / ClassroomSonarDemo123!\nGenerating coverage and scanning FarmWeather...\n\n' "$url"
"${compose[@]}" run --rm --no-deps coverage
"${compose[@]}" run --rm --no-deps sonar-scan
printf '\nScan submitted. Open: %s/dashboard?id=farmweather\nLogin: admin / ClassroomSonarDemo123!\nRefresh the dashboard while SonarQube processes the report.\nOpen this URL on the computer running Docker.\n' "$url"
