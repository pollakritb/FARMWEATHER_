# FarmWeather: OWASP Dependency-Check via local NVD mirror

Scan date: 2026-10-03 05:18 UTC (12:18 Asia/Bangkok)

## Result

- Tool: OWASP Dependency-Check Docker image `owasp/dependency-check:latest`, engine 13.0.0.
- Scope: root `package.json` and `package-lock.json`, including development dependencies.
- NVD source: complete 2002–2026 JSON 2.0 feeds served from `127.0.0.1:18765`. Feed's last modification was 2026-10-02 16:32 UTC.
- Analyzed dependency records: 680.
- Vulnerable dependency records: 2; advisory matches: 4 (3 high, 1 moderate).

| Package | Advisory | Severity | CVSS 3.1 |
| --- | --- | --- | ---: |
| `braces@3.0.3` | `GHSA-vfj7-8cjw-p6xm` | High | 7.5 |
| `fast-uri@3.1.6` | `GHSA-58mr-gqgx-xq4g` | High | 7.5 |
| `fast-uri@3.1.6` | `GHSA-qw65-cvwx-89v3` | High | 7.5 |
| `fast-uri@3.1.6` | `GHSA-hrr3-gc8f-f4qj` | Moderate | 4.8 |

Both packages are development dependency paths in the current lockfile. The scanner's JSON report has no analysis exception, and its HTTP log confirms it requested all yearly feeds from localhost. The npm Node Audit analyzer was also enabled; it contacts the npm registry, so this run is a **local NVD mirror scan, not an entirely offline scan**.

The separate `npm audit` report in this folder counts 42 vulnerable package nodes (40 high, 2 moderate) for the full tree, including parent packages marked vulnerable because of a transitive dependency. It also flags `js-yaml@5.3.0` under `@nestjs/swagger`, which Dependency-Check did not report. Treat the tools as complementary; do not interpret the 2-package Dependency-Check result as clearance of the npm audit findings. See `npm-audit-all.json` and `npm-audit-production.json` for those results.

## Reproduce on this Linux machine

Prerequisites: Docker daemon access, Python 3, `curl`, and about 500 MB of free disk space. Run from the repository root:

```bash
python3 scripts/sync-nvd-mirror.py /tmp/farmweather-nvd-mirror
./scripts/run-dependency-check-local.sh
```

The first command mirrors OWASP's NVD 2.0 feed to `/tmp/farmweather-nvd-mirror`; later runs compare `.meta` files and download changed feeds. The second command starts a temporary Python HTTP server bound to `127.0.0.1:18765`, runs the Dependency-Check container with host networking and `--nvdDatafeed 'http://127.0.0.1:18765/nvdcve-{0}.json.gz'`, and stops the server after the scan. It keeps the scanner database in `/tmp/farmweather-odc-data` to make later scans faster. No ZAP or application server is used.

To avoid the npm registry during a scan, run `ODC_LOCAL_ONLY=1 ./scripts/run-dependency-check-local.sh`. This disables the Node Audit analyzer and reduces coverage of npm advisories. Refresh the mirrored feeds before a new security review. `/tmp` may be cleared by the operating system.

Output files are in `security-reports/2026-10-03/dependency-check/`:

- `dependency-check-report.html`: human-readable report.
- `dependency-check-report.json`: machine-readable findings and source timestamps.
- `dependency-check.log`: detailed scanner execution log.
- `mirror-http.log`: localhost mirror request log.

References: [OWASP mirroring documentation](https://dependency-check.github.io/DependencyCheck/data/mirrornvd.html), [Dependency-Check CLI arguments](https://dependency-check.github.io/DependencyCheck/dependency-check-cli/arguments.html).
