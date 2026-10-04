import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const reportPath = process.argv[3] ?? 'security-owasp-smoke.json';
const suffix = randomBytes(5).toString('hex');
const password = `FwSecure_${suffix}Aa1!`;
const checks = [];

async function check(name, method, path, { token, body, expected, verify, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = raw; }
  const passed = expected.includes(response.status) && (!verify || verify(payload, response));
  checks.push({ name, method, path, expected, status: response.status, passed });
  if (!passed) throw new Error(`${name}: expected ${expected.join('/')} and valid response, received ${response.status}`);
  return payload;
}

let failure;
try {
  await check('Health endpoint responds', 'GET', '/api/health', { expected: [200] });
  await check('Missing bearer token is rejected', 'GET', '/api/plots', { expected: [401] });
  await check('Unexpected role field is rejected during registration', 'POST', '/api/auth/register', {
    body: { username: `mass_${suffix}`, password, role: 'ADMIN' }, expected: [400],
  });
  const a = await check('Register account A', 'POST', '/api/auth/register', {
    body: { username: `usera_${suffix}`, password }, expected: [201],
    verify: (payload) => payload.user.role === 'FARMER',
  });
  const b = await check('Register account B', 'POST', '/api/auth/register', {
    body: { username: `userb_${suffix}`, password }, expected: [201],
    verify: (payload) => payload.user.role === 'FARMER',
  });
  await check('Bad login password is rejected', 'POST', '/api/auth/login', {
    body: { username: `userb_${suffix}`, password: `${password}bad` }, expected: [401],
  });
  await check('Tampered bearer token is rejected', 'GET', '/api/auth/me', {
    token: `${b.token}x`, expected: [401],
  });
  await check('Farmer cannot list users', 'GET', '/api/admin/users', {
    token: b.token, expected: [403],
  });
  await check('Farmer cannot change roles', 'PATCH', `/api/admin/users/${b.user.id}/role`, {
    token: b.token, body: { role: 'ADMIN' }, expected: [403],
  });
  await check('Unexpected role field is rejected on profile', 'PATCH', '/api/profile', {
    token: b.token, body: { role: 'ADMIN' }, expected: [400],
  });
  const plot = await check('Account A creates a plot', 'POST', '/api/plots', {
    token: a.token, expected: [201],
    body: { name: 'Security test plot', latitude: 14.02, longitude: 100.52,
      cropType: 'RICE', plantedAt: '2026-07-01' },
    verify: (payload) => Boolean(payload.id),
  });
  await check('Owner can read plot', 'GET', `/api/plots/${plot.id}`, {
    token: a.token, expected: [200], verify: (payload) => payload.id === plot.id,
  });
  await check('Account B cannot list A plot', 'GET', '/api/plots', {
    token: b.token, expected: [200], verify: (payload) => !payload.some((item) => item.id === plot.id),
  });
  for (const [name, method, path, body] of [
    ['read', 'GET', `/api/plots/${plot.id}`],
    ['update', 'PATCH', `/api/plots/${plot.id}`, { name: 'Stolen' }],
    ['delete', 'DELETE', `/api/plots/${plot.id}`],
    ['read weather', 'GET', `/api/plots/${plot.id}/weather/hourly`],
    ['read current weather', 'GET', `/api/plots/${plot.id}/weather/current`],
    ['read weather history', 'GET', `/api/plots/${plot.id}/weather/history/hourly`],
    ['run analysis', 'POST', `/api/plots/${plot.id}/analysis/run`],
    ['read analysis', 'GET', `/api/plots/${plot.id}/analysis`],
    ['read notifications', 'GET', `/api/plots/${plot.id}/notifications`],
  ]) {
    await check(`Account B cannot ${name} A plot`, method, path, {
      token: b.token, body, expected: [403, 404],
    });
  }
  await check('Cross-account attempts did not alter owner plot', 'GET', `/api/plots/${plot.id}`, {
    token: a.token, expected: [200], verify: (payload) => payload.name === 'Security test plot',
  });
  await check('Unknown reset token is rejected', 'POST', '/api/auth/reset-password', {
    body: { token: 'x'.repeat(43), newPassword: 'AnotherStrongPassword123' }, expected: [400],
  });
  await check('Logout revokes the session', 'POST', '/api/auth/logout', {
    token: a.token, expected: [204],
  });
  await check('Revoked session cannot access profile', 'GET', '/api/auth/me', {
    token: a.token, expected: [401],
  });
  await check('Untrusted origin is not granted CORS access', 'GET', '/api/health', {
    expected: [200], headers: { origin: 'https://untrusted.example' },
    verify: (_payload, response) => response.headers.get('access-control-allow-origin') !== 'https://untrusted.example',
  });
  await check('Security response headers are present', 'GET', '/api/health', {
    expected: [200],
    verify: (_payload, response) => response.headers.get('x-content-type-options') === 'nosniff',
  });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

const report = {
  target: baseUrl,
  generatedAt: new Date().toISOString(),
  mode: 'isolated in-memory API with demo weather',
  summary: { passed: checks.filter((item) => item.passed).length,
    failed: checks.filter((item) => !item.passed).length, total: checks.length },
  checks,
  ...(failure ? { failure } : {}),
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.summary.passed}/${report.summary.total} checks passed; report: ${reportPath}`);
if (failure) {
  console.error(failure);
  process.exitCode = 1;
}
