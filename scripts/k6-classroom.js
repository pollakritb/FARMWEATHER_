import http from 'k6/http';
import { check, sleep } from 'k6';
export { options } from './k6-health.js';
const base = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export function setup() {
  const response = http.get(`${base}/api/plots`);
  if (response.status !== 200 || !response.json().length) throw new Error('Classroom API must have a seeded plot');
  return { plotId: response.json()[0].id };
}
export default function ({ plotId }) {
  for (const path of ['/api/health', '/api/plots', `/api/plots/${plotId}/weather/hourly`, `/api/plots/${plotId}/weather/current`]) {
    const response = http.get(`${base}${path}`, { timeout: '5s' });
    check(response, { 'API returns 200 without token': (r) => r.status === 200 });
  }
  sleep(1);
}
