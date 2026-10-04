#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose --env-file /dev/null -f compose.classroom.yml --profile sonar)
"${compose[@]}" up -d sonarqube
"${compose[@]}" run --rm sonar-init
"${compose[@]}" run --rm --no-deps coverage
"${compose[@]}" run --rm --no-deps sonar-scan
