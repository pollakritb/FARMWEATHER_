# FarmWeather fix and regression report

Date: 2026-08-29 (Asia/Bangkok)

## Implemented fixes

- Plot partial updates now preserve every omitted field and database updates return the persisted complete row.
- Production refuses to start without `DATABASE_URL` unless disposable in-memory mode is explicitly enabled.
- Password-reset tokens are never returned when `NODE_ENV=production`.
- TMD observation lookup rejects missing/non-finite plot coordinates instead of serializing `NaN` as `stationDistanceKm: null`.
- The OpenAPI `Plot` response schema is now a single complete object schema and no longer combines `allOf` with a base schema that rejects added fields.
- The frontend waits for crops/profile/bootstrap to finish before showing the dashboard, and any authenticated `401` clears the session, closes the plot dialog, and returns to the login screen.
- The forgot-password UI no longer presents an empty token form when production omits the development reset token.

## Verification

- Jest: 7 suites passed, 16 tests passed.
- ESLint: passed.
- Nest build: passed.
- Frontend JavaScript syntax check: passed.
- Targeted OpenAPI regression: 12/12 requests passed on the built localhost server.
- Browser regression: registration, crop loading, plot creation, current weather, hourly forecast, and clean recovery to login after an instance restart passed.

Targeted API cases:

- `POST /api/plots` complete `Plot` response
- `GET /api/plots/{id}` complete `Plot` response
- `PATCH /api/plots/{id}` preserves omitted fields
- `PATCH /api/plots/{id}/active` returns a complete `Plot`
- current observation and refresh return a finite `stationDistanceKm`
- observation history matches the documented schema
- forecast refresh and analysis still succeed after a partial plot update

## Production deployment blocker

The authenticated Vercel CLI account cannot access the project behind `farmweather.vercel.app`. The available scope contains only the `clearpath` project, and `vercel project inspect farmweather` reports that no such accessible project exists. Therefore these fixes have not been deployed to that production URL.

Before production deployment, the owner must provide access to the correct Vercel project and configure at least `DATABASE_URL`, `AUTH_SECRET`, and production TMD settings. The production URL cannot be truthfully marked fixed until deployment and the targeted regression are rerun against it.
