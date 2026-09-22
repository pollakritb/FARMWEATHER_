import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const baseUrl = (process.argv[2] ?? process.env.API_BASE_URL ?? 'https://farmweather.vercel.app').replace(/\/$/, '');
const openapi = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const expectedOperations = new Set(
  Object.entries(openapi.paths).flatMap(([path, pathItem]) =>
    Object.keys(pathItem)
      .filter((method) => methods.has(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  ),
);
const coveredOperations = new Set();

async function request(method, path, options = {}) {
  const {
    operationPath = path,
    token,
    body,
    expected = [200],
  } = options;
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : undefined;
  } catch {
    payload = raw;
  }

  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path}: expected ${expected.join('/')} but received ${response.status}\n${raw}`);
  }

  const operation = `${method} ${operationPath}`;
  coveredOperations.add(operation);
  console.log(`[PASS] ${operation} -> ${response.status}`);
  return { status: response.status, payload };
}

const suffix = Date.now().toString(36);
const username = `live_${suffix}`;
const password = `Fw_${suffix}!`;
const newPassword = `Fw_new_${suffix}!`;
const plotBody = {
  name: `OpenAPI ${suffix}`,
  latitude: 14.0208,
  longitude: 100.525,
  province: 'Pathum Thani',
  cropType: 'RICE',
  plantedAt: '2026-07-01',
};

let token;
let plotId;

try {
  await request('GET', '/api/health');
  const registered = await request('POST', '/api/auth/register', {
    body: { username, password },
    expected: [201],
  });
  token = registered.payload?.token;
  const user = registered.payload?.user;
  if (!token || !user?.id) throw new Error('Register response did not include token and user.id');

  const loggedIn = await request('POST', '/api/auth/login', {
    body: { username, password },
  });
  token = loggedIn.payload?.token;
  if (!token) throw new Error('Login response did not include a token');

  await request('GET', '/api/auth/me', { token });
  await request('GET', '/api/profile', { token });
  await request('PATCH', '/api/profile', {
    token,
    body: { displayName: 'OpenAPI Live Test', phone: '0800000000', province: 'Pathum Thani' },
  });

  if (user.role === 'ADMIN') {
    await request('GET', '/api/admin/users', { token });
    const farmerName = `farmer_${suffix}`;
    const farmer = await request('POST', '/api/auth/register', {
      body: { username: farmerName, password },
      expected: [201],
    });
    await request('PATCH', `/api/admin/users/${farmer.payload.user.id}/role`, {
      operationPath: '/api/admin/users/{id}/role',
      token,
      body: { role: 'ADMIN' },
    });
  } else {
    await request('GET', '/api/admin/users', { token, expected: [403] });
    await request('PATCH', `/api/admin/users/${user.id}/role`, {
      operationPath: '/api/admin/users/{id}/role',
      token,
      body: { role: 'ADMIN' },
      expected: [403],
    });
  }

  await request('GET', '/api/crops', { token });
  await request('GET', '/api/plots', { token });
  const created = await request('POST', '/api/plots', { token, body: plotBody, expected: [201] });
  plotId = created.payload?.id;
  if (!plotId) throw new Error('Create plot response did not include id');

  await request('GET', `/api/plots/${plotId}`, {
    operationPath: '/api/plots/{id}',
    token,
  });
  await request('PATCH', `/api/plots/${plotId}`, {
    operationPath: '/api/plots/{id}',
    token,
    body: { name: `OpenAPI updated ${suffix}` },
  });
  await request('PATCH', `/api/plots/${plotId}/active`, {
    operationPath: '/api/plots/{id}/active',
    token,
    body: { active: false },
  });

  await request('POST', `/api/plots/${plotId}/weather/current/refresh`, {
    operationPath: '/api/plots/{plotId}/weather/current/refresh',
    token,
    expected: [201],
  });
  await request('GET', `/api/plots/${plotId}/weather/current`, {
    operationPath: '/api/plots/{plotId}/weather/current',
    token,
  });
  await request('POST', `/api/plots/${plotId}/weather/refresh`, {
    operationPath: '/api/plots/{plotId}/weather/refresh',
    token,
    expected: [201],
  });
  await request('GET', `/api/plots/${plotId}/weather/hourly`, {
    operationPath: '/api/plots/{plotId}/weather/hourly',
    token,
  });
  await request('GET', `/api/plots/${plotId}/weather/history/hourly`, {
    operationPath: '/api/plots/{plotId}/weather/history/hourly',
    token,
  });
  await request('GET', `/api/plots/${plotId}/weather/history/observations`, {
    operationPath: '/api/plots/{plotId}/weather/history/observations',
    token,
  });

  await request('POST', `/api/plots/${plotId}/analysis/run`, {
    operationPath: '/api/plots/{plotId}/analysis/run',
    token,
    expected: [201],
  });
  await request('GET', `/api/plots/${plotId}/analysis`, {
    operationPath: '/api/plots/{plotId}/analysis',
    token,
  });
  await request('GET', `/api/plots/${plotId}/analysis/history`, {
    operationPath: '/api/plots/{plotId}/analysis/history',
    token,
  });
  const notifications = await request('GET', `/api/plots/${plotId}/notifications`, {
    operationPath: '/api/plots/{plotId}/notifications',
    token,
  });
  const notificationId = notifications.payload?.[0]?.id;
  await request('PATCH', `/api/notifications/${notificationId ?? randomUUID()}/read`, {
    operationPath: '/api/notifications/{id}/read',
    token,
    expected: notificationId ? [200] : [404],
  });

  await request('DELETE', `/api/plots/${plotId}`, {
    operationPath: '/api/plots/{id}',
    token,
    expected: [204],
  });
  plotId = undefined;

  const forgot = await request('POST', '/api/auth/forgot-password', {
    body: { username },
    expected: [201],
  });
  const resetToken = forgot.payload?.resetToken;
  await request('POST', '/api/auth/reset-password', {
    body: { token: resetToken ?? randomUUID(), newPassword },
    expected: resetToken ? [201] : [400],
  });
  const relogin = await request('POST', '/api/auth/login', {
    body: { username, password: resetToken ? newPassword : password },
  });
  token = relogin.payload?.token;
  await request('POST', '/api/auth/logout', { token, expected: [204] });

  const missing = [...expectedOperations].filter((operation) => !coveredOperations.has(operation));
  if (missing.length) throw new Error(`OpenAPI operations not covered:\n${missing.join('\n')}`);
  console.log(`\nAll ${expectedOperations.size} OpenAPI operations were exercised against ${baseUrl}.`);
} catch (error) {
  console.error(`\n[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (plotId && token) {
    try {
      await fetch(`${baseUrl}/api/plots/${plotId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort cleanup; the original failure is more useful.
    }
  }
}
