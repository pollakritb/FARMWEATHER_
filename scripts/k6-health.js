import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const profile = __ENV.PROFILE || 'load';
const stages = {
  load: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '20s', target: 0 },
  ],
  stress: [
    { duration: '20s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '30s', target: 0 },
  ],
};

if (profile !== 'smoke' && !stages[profile]) {
  throw new Error(`Unknown PROFILE: ${profile}`);
}

export const options = {
  scenarios: profile === 'smoke'
    ? { smoke: { executor: 'constant-vus', vus: Number(__ENV.VUS || 5), duration: __ENV.DURATION || '20s' } }
    : { [profile]: { executor: 'ramping-vus', startVUs: 0, stages: stages[profile] } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/health`, { timeout: '5s' });
  check(response, {
    'health returns 200': (res) => res.status === 200,
    'health reports ok': (res) => res.status === 200 && res.json('status') === 'ok',
  });
  sleep(1);
}
