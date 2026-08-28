import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const spec = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'));
const results = [];

function resolve(schema) {
  if (!schema?.$ref) return schema;
  return schema.$ref.slice(2).split('/').reduce((value, key) => value[key], spec);
}

function validate(value, input, path = '$') {
  const schema = resolve(input);
  const errors = [];
  if (!schema) return errors;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${path}: expected object`];
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: missing`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], child, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}: undocumented`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    value.forEach((item, index) => errors.push(...validate(item, schema.items, `${path}[${index}]`)));
  } else if (schema.type === 'string' && typeof value !== 'string') errors.push(`${path}: expected string`);
  else if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors.push(`${path}: expected finite number`);
  else if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${path}: expected integer`);
  else if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: enum mismatch`);
  return errors;
}

function responseSchema(pathTemplate, method, status) {
  let response = spec.paths[pathTemplate][method.toLowerCase()].responses[String(status)];
  response = resolve(response);
  return response?.content?.['application/json']?.schema;
}

async function request(name, method, pathTemplate, path, { body, token, expected = [200] } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  const schemaErrors = validate(parsed, responseSchema(pathTemplate, method, response.status));
  const pass = expected.includes(response.status) && schemaErrors.length === 0;
  const result = { name, method, path, status: response.status, pass, schemaErrors, body: parsed };
  results.push(result);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${response.status}${schemaErrors.length ? ` ${schemaErrors.join('; ')}` : ''}`);
  return result;
}

const username = `reg_${Date.now().toString().slice(-9)}`;
const password = 'Test123!';
const register = await request('register test account', 'POST', '/api/auth/register', '/api/auth/register', {
  body: { username, password }, expected: [201],
});
const token = register.body.token;
const created = await request('create Plot response schema', 'POST', '/api/plots', '/api/plots', {
  token,
  body: {
    name: 'แปลง regression', latitude: 14.0208, longitude: 100.525,
    province: 'ปทุมธานี', cropType: 'RICE', plantedAt: '2026-07-01',
  },
  expected: [201],
});
const plotId = created.body.id;
const before = { ...created.body };

await request('get Plot response schema', 'GET', '/api/plots/{id}', `/api/plots/${plotId}`, { token, expected: [200] });
const patched = await request('partial PATCH preserves Plot fields', 'PATCH', '/api/plots/{id}', `/api/plots/${plotId}`, {
  token, body: { name: 'แปลง regression แก้ชื่อ' }, expected: [200],
});
for (const key of ['latitude', 'longitude', 'province', 'cropType', 'plantedAt', 'active']) {
  if (patched.body[key] !== before[key]) {
    patched.pass = false;
    patched.schemaErrors.push(`$.${key}: changed or disappeared during partial update`);
  }
}

await request('active PATCH complete Plot response', 'PATCH', '/api/plots/{id}/active', `/api/plots/${plotId}/active`, {
  token, body: { active: false }, expected: [200],
});
await request('current weather finite distance', 'GET', '/api/plots/{plotId}/weather/current', `/api/plots/${plotId}/weather/current`, {
  token, expected: [200],
});
await request('refresh current weather finite distance', 'POST', '/api/plots/{plotId}/weather/current/refresh', `/api/plots/${plotId}/weather/current/refresh`, {
  token, expected: [201],
});
await request('observation history schema', 'GET', '/api/plots/{plotId}/weather/history/observations', `/api/plots/${plotId}/weather/history/observations`, {
  token, expected: [200],
});
await request('hourly forecast after partial PATCH', 'POST', '/api/plots/{plotId}/weather/refresh', `/api/plots/${plotId}/weather/refresh`, {
  token, expected: [201],
});
await request('analysis after partial PATCH', 'POST', '/api/plots/{plotId}/analysis/run', `/api/plots/${plotId}/analysis/run`, {
  token, expected: [201],
});
await request('delete regression plot', 'DELETE', '/api/plots/{id}', `/api/plots/${plotId}`, { token, expected: [204] });
await request('logout regression account', 'POST', '/api/auth/logout', '/api/auth/logout', { token, expected: [204] });

const summary = {
  baseUrl,
  testedAt: new Date().toISOString(),
  requests: results.length,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
};
await writeFile(new URL('../farmweather-regression-report.json', import.meta.url), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
if (summary.failed) process.exitCode = 1;
