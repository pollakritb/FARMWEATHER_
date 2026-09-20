import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url)));
const items = [];
const covered = new Set();
function resolve(value) {
  if (Array.isArray(value)) return value.map(resolve);
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) return resolve(value.$ref.split('/').slice(1).reduce((o, k) => o[k], spec));
  // OpenAPI numeric formats are annotations, not JSON Schema string formats.
  return Object.fromEntries(Object.entries(value)
    .filter(([k, v]) => !(k === 'format' && ['double', 'float', 'int32', 'int64'].includes(v)))
    .map(([k, v]) => [k, resolve(v)]));
}
function add(method, path, { body, expected, save = '', publicRequest = false, suffix = '' } = {}) {
  const operation = spec.paths[path][method.toLowerCase()];
  if (!operation) throw new Error(`Missing contract: ${method} ${path}`);
  covered.add(`${method} ${path}`);
  expected ??= Number(Object.keys(operation.responses).find(s => s.startsWith('2')));
  const url = path.replace(/\{plotId\}/g, '{{plotId}}').replace(/\{id\}/g,
    path.includes('/admin/') ? '{{userId}}' : path.includes('/notifications/') ? '{{notificationId}}' : '{{plotId}}');
  const schemas = Object.fromEntries(Object.entries(operation.responses).flatMap(([status, r]) => {
    const schema = resolve(r).content?.['application/json']?.schema;
    return schema ? [[status, resolve(schema)]] : [];
  }));
  items.push({ name: `${String(items.length + 1).padStart(2, '0')} ${method} ${path}${suffix}`, request: {
    method, url: '{{baseUrl}}' + url,
    auth: publicRequest || operation.security?.length === 0 ? { type: 'noauth' } : undefined,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
  }, event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    `pm.test('Expected HTTP status', () => pm.expect(pm.response.code).to.eql(${expected}));`,
    `const schemas = ${JSON.stringify(schemas)};`,
    "if (schemas[pm.response.code]) pm.test('OpenAPI response schema', () => pm.response.to.have.jsonSchema(schemas[pm.response.code]));",
    save,
  ] } }] });
}
const credentials = { username: '{{username}}', password: '{{password}}' };
const saveAuth = "if (pm.response.code < 300) { const b = pm.response.json(); pm.collectionVariables.set('token', b.token); pm.collectionVariables.set('userId', b.user.id); }";
add('GET', '/api/health');
add('GET', '/api/plots', { publicRequest: true, expected: 401, suffix: ' (unauthorized)' });
add('POST', '/api/auth/register', { body: credentials, save: saveAuth });
add('POST', '/api/auth/login', { body: credentials, save: saveAuth });
add('GET', '/api/auth/me');
add('GET', '/api/profile');
add('PATCH', '/api/profile', { body: { displayName: 'Postman API Test', province: 'Pathum Thani' } });
add('GET', '/api/admin/users', { expected: 403 });
add('PATCH', '/api/admin/users/{id}/role', { body: { role: 'FARMER' }, expected: 403 });
add('GET', '/api/crops');
add('GET', '/api/plots');
add('POST', '/api/plots', { body: { name: 'Postman {{username}}', latitude: 14.0208, longitude: 100.525, province: 'Pathum Thani', cropType: 'RICE', plantedAt: '{{today}}' }, save: "if (pm.response.code === 201) pm.collectionVariables.set('plotId', pm.response.json().id);" });
add('GET', '/api/plots/{id}');
add('PATCH', '/api/plots/{id}', { body: { name: 'Postman updated {{username}}' } });
add('PATCH', '/api/plots/{id}/active', { body: { active: false } });
for (const [method, path] of [
  ['POST', '/weather/current/refresh'], ['GET', '/weather/current'],
  ['POST', '/weather/refresh'], ['GET', '/weather/hourly'],
  ['GET', '/weather/history/hourly'], ['GET', '/weather/history/observations'],
  ['POST', '/analysis/run'], ['GET', '/analysis'], ['GET', '/analysis/history'],
]) add(method, '/api/plots/{plotId}' + path);
add('GET', '/api/plots/{plotId}/notifications', { save: "if (pm.response.code === 200) { const n = pm.response.json()[0]; pm.collectionVariables.set('notificationId', n ? n.id : '00000000-0000-4000-8000-000000000000'); pm.collectionVariables.set('notificationExpected', n ? '200' : '404'); }" });
add('PATCH', '/api/notifications/{id}/read', { expected: "Number(pm.collectionVariables.get('notificationExpected'))" });
add('DELETE', '/api/plots/{id}');
add('POST', '/api/auth/forgot-password', { body: { username: '{{username}}' }, save: "if (pm.response.code === 201) { const b = pm.response.json(); pm.test('Reset token available for test account', () => pm.expect(b.resetToken).to.be.a('string')); if (b.resetToken) pm.collectionVariables.set('resetToken', b.resetToken); }" });
add('POST', '/api/auth/reset-password', { body: { token: '{{resetToken}}', newPassword: '{{newPassword}}' } });
add('POST', '/api/auth/login', { body: { username: '{{username}}', password: '{{newPassword}}' }, save: saveAuth });
add('POST', '/api/auth/logout');
const total = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).filter(m => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).length, 0);
if (covered.size !== total) throw new Error('Incomplete operation coverage');
const collection = {
  info: { name: 'FarmWeather Vercel - OpenAPI Live Tests', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: `${total} OpenAPI operations. Run in order with one iteration. Creates a unique test account (retained) and deletes its test plot. Admin requests test FARMER denial. Notification read tests 404 when no notification exists. Weather requests require working upstream TMD. No real credentials are included.` },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'https://farmweather.vercel.app' }],
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    "if (pm.info.requestName.startsWith('01 ')) { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); for (const k of ['token', 'userId', 'plotId', 'notificationId', 'notificationExpected', 'resetToken']) pm.collectionVariables.unset(k); pm.collectionVariables.set('username', 'pm_' + id); pm.collectionVariables.set('password', 'Test_' + id + '!'); pm.collectionVariables.set('newPassword', 'New_' + id + '!'); pm.collectionVariables.set('today', new Date().toISOString().slice(0, 10)); }",
  ] } }], item: items,
};
writeFileSync(new URL('../FarmWeather.vercel.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
console.log(`Generated ${items.length} requests covering ${covered.size} OpenAPI operations.`);
