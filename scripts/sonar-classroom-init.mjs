import { writeFileSync } from 'node:fs';
const base = process.env.SONAR_HOST_URL || 'http://sonarqube:9000';
const classroomPassword = 'ClassroomSonarDemo123!';
const basic = (password) => `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
async function post(path, fields, password = classroomPassword) {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { authorization: basic(password), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}
let ready = false;
for (let attempt = 0; attempt < 180; attempt++) {
  try {
    const response = await fetch(`${base}/api/system/status`);
    if (response.ok && (await response.json()).status === 'UP') { ready = true; break; }
  } catch { /* Wait for the local SonarQube instance. */ }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!ready) throw new Error('SonarQube did not become ready within 6 minutes');
const validation = await fetch(`${base}/api/authentication/validate`, { headers: { authorization: basic(classroomPassword) } });
if (!(await validation.json()).valid) {
  const change = await post('/api/users/change_password', { login: 'admin', previousPassword: 'admin', password: classroomPassword }, 'admin');
  if (!change.ok) throw new Error(`Cannot initialize classroom SonarQube password: HTTP ${change.status}`);
}
await post('/api/user_tokens/revoke', { name: 'classroom-scanner' });
const response = await post('/api/user_tokens/generate', { name: 'classroom-scanner', type: 'GLOBAL_ANALYSIS_TOKEN' });
if (!response.ok) throw new Error(`Cannot generate local scanner token: HTTP ${response.status}`);
const { token } = await response.json();
if (!token) throw new Error('SonarQube did not return a scanner token');
writeFileSync('/sonar-auth/token', token, { mode: 0o600 });
console.log('Local classroom scanner token prepared; no personal token needed');
