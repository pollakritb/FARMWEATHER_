# FarmWeather security assessment — 2026-10-03

## Scope and method

- Target: locally built FarmWeather API and web UI, on `127.0.0.1:3100` with in-memory storage and on `127.0.0.1:3101` with a separate temporary PostgreSQL database. Demo weather was enabled; no TMD production service was contacted.
- Dependency review: `npm audit --omit=dev --json` and `npm audit --json` against the current lockfile.
- Dynamic review: ZAP stable image, passive baseline scan of the web UI, unauthenticated OpenAPI API scan, and authenticated OpenAPI API scan using a temporary farmer account and seeded plot.
- Authorization review: 28 HTTP assertions per storage mode, covering two accounts, object ownership, role checks, mass assignment, token rejection, logout, CORS, and security headers.
- ZAP OpenAPI inputs point only to the isolated test instance. The authenticated input omits logout and plot deletion to preserve its session and seeded plot during the scan. The temporary bearer token is not in these reports.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Production dependency audit | 2 moderate package findings; 0 high or critical | [JSON](npm-audit-production.json) |
| Full dependency audit | 42 package findings: 40 high, 2 moderate, 0 critical | [JSON](npm-audit-all.json) |
| Two-account API checks, memory | 28/28 passed | [JSON](authorization-smoke.json) |
| Two-account API checks, PostgreSQL | 28/28 passed | [JSON](authorization-postgres.json) |
| ZAP passive baseline | 3 medium, 3 low, 5 informational alert types; no high | [HTML](zap-baseline.html), [JSON](zap-baseline.json), [log](zap-baseline.log) |
| ZAP active API scan without authentication | 34 OpenAPI URLs imported; mostly HTTP 401 on protected endpoints | [HTML](zap-api.html), [JSON](zap-api.json), [log](zap-api.log) |
| ZAP active API scan with authentication | 33 OpenAPI URLs imported; 1 low and 3 informational alert types; no 401 observed | [HTML](zap-api-authenticated.html), [JSON](zap-api-authenticated.json), [log](zap-api-authenticated.log) |

`npm audit` counts affected package entries and dependency paths, not distinct vulnerabilities. ZAP exit code 2 means warnings were reported; its logs show no configured FAIL alerts.

## Findings and recommended work

1. **Dependency advisories.** The production audit traces its two moderate entries to one `js-yaml` advisory through `@nestjs/swagger` ([GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm)). The full audit additionally includes high findings in development tool chains rooted at Nest CLI/schematics, Jest/types, and Tailwind. Review compatible upgrades and rerun the build, unit tests, and audits. The audit's suggested fixes include major package changes, so review them before applying.
2. **Browser content policy.** ZAP reports medium alerts for broad CSP `font-src https:` and `style-src 'unsafe-inline'`; its evidence matches the response policy configured in [`src/main.ts`](../../src/main.ts). Restrict allowed font hosts and remove inline style permission if the UI can work without it.
3. **External Leaflet assets.** ZAP reports missing Subresource Integrity on the stylesheet and script loaded from `unpkg.com` in [`public/index.html`](../../public/index.html). Pin the assets with valid integrity hashes or serve a vetted local copy.
4. **Forms can submit sensitive fields as URL parameters if JavaScript does not handle submission.** ZAP produced URLs containing `password`, `confirmPassword`, and reset `token`. The HTML forms in [`public/index.html`](../../public/index.html) have no explicit `method`, while [`public/app.js`](../../public/app.js) normally calls `preventDefault()`. Add an explicit non-GET fallback to forms containing credentials and verify behavior when JavaScript fails or is disabled. The ZAP URLs used synthetic values; no real credential was observed in a URL.
5. **Header hardening.** ZAP reports low alerts for missing Permissions Policy and Cross-Origin-Embedder-Policy. Check browser feature needs before setting these headers; the latter can affect third-party map assets.
6. **API scan alert context.** The authenticated scan's only low alert is “Unexpected Content-Type” at `/`, which serves the intended HTML UI even though the API scanner expects JSON. This is an expected target mismatch, not evidence of an API content-type defect.

## Authorization observations

The two-account checks found no cross-account access to plots, weather, analysis, or notifications in either storage mode. Farmer requests to admin operations returned 403; unknown fields such as `role` were rejected; a tampered token and a logged-out token were rejected. These checks cover representative endpoints and do not prove that every API operation is free of authorization flaws.

The authenticated ZAP run had no 401 responses in its client-error alert set, indicating its temporary bearer header reached the API. It recorded 8 HTTP 400, 3 HTTP 403, 40 HTTP 404, and 16 HTTP 429 responses. Some errors are expected for negative probes and missing resources. The 429 responses show the app's rate limit was reached and limit the completeness of that automated scan.

## Limits

- The tests targeted local HTTP instances. Deployment TLS, reverse proxy, cloud configuration, and production secrets were not assessed.
- TMD integrations were not exercised because demo weather was enabled.
- The API scan did not perform an authenticated browser flow or a dedicated DOM XSS assessment.
- Active scanner results require manual review and cannot certify compliance with every OWASP Top 10 category.

## Reproduce

Build with `npm run build`, start an isolated instance, then run `node scripts/security-owasp-smoke.mjs <base-url> <report-path>`. The exact dependency and ZAP inputs and outputs are preserved in this directory. The ZAP authentication setup metadata is in [authenticated-scan-setup.json](authenticated-scan-setup.json); the bearer token was stored only in a temporary file outside the repository.

Relevant methodology: [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/), [ZAP baseline scan](https://www.zaproxy.org/docs/docker/baseline-scan/), [ZAP API scan](https://www.zaproxy.org/docs/docker/api-scan/), [npm audit](https://docs.npmjs.com/cli/audit/).
