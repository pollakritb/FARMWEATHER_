import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const reportDir = process.argv[3] ?? 'security-reports/2026-10-03';
const suffix = randomBytes(5).toString('hex');
const password = `FwSecure_${suffix}Aa1!`;

async function request(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

const user = await request('/api/auth/register', { username: `zap_${suffix}`, password });
const plot = await request('/api/plots', {
  name: 'ZAP test plot', latitude: 14.02, longitude: 100.52,
  cropType: 'RICE', plantedAt: '2026-07-01',
}, user.token);

writeFileSync('/tmp/farmweather-zap-token', user.token, { mode: 0o600 });
mkdirSync(reportDir, { recursive: true });
const spec = JSON.parse(readFileSync('openapi.json', 'utf8'));
spec.servers = [{ url: baseUrl, description: 'Isolated in-memory security test instance' }];
spec.components.parameters.PlotId.example = plot.id;
spec.components.parameters.PlotPathId.example = plot.id;
delete spec.paths['/api/auth/logout'];
delete spec.paths['/api/plots/{id}'].delete;
writeFileSync(`${reportDir}/openapi-zap-auth.json`, `${JSON.stringify(spec, null, 2)}\n`);
writeFileSync(`${reportDir}/authenticated-scan-setup.json`, `${JSON.stringify({
  target: baseUrl,
  accountRole: user.user.role,
  plotId: plot.id,
  excludedOperations: ['POST /api/auth/logout', 'DELETE /api/plots/{id}'],
  reason: 'Preserve the bearer session and seeded plot during the active scan',
}, null, 2)}\n`);
console.log('Prepared authenticated ZAP target with a seeded plot; token stored only in /tmp/farmweather-zap-token');
