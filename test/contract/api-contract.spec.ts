import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { AppModule } from '../../src/app.module';

type Operation = {
  security?: unknown[];
};

type ApiResponse<T> = {
  status: number;
  body: T;
};

const openapi = JSON.parse(readFileSync('openapi.json', 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
};

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as T) : (undefined as T),
  };
}

describe('API behavior against the OpenAPI contract', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    process.env.WEATHER_DEMO_MODE = 'true';
    process.env.AUTH_SECRET = 'test-secret-with-at-least-32-characters';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes every route declared in OpenAPI with the documented auth mode', async () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      const concretePath = path.replace(/\{[^}]+\}/g, '7ab2c909-4f4e-4fd1-8ca4-c07030a24c9d');

      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
        const isPublic = Array.isArray(operation.security) && operation.security.length === 0;
        const response = await request<Record<string, unknown>>(baseUrl, concretePath, {
          method: method.toUpperCase(),
          body: method === 'get' || method === 'delete' ? undefined : JSON.stringify({}),
        });

        if (isPublic) {
          expect(response.status).not.toBe(404);
          expect(response.status).not.toBe(405);
          expect(response.status).toBeLessThan(500);
        } else {
          expect(response.status).toBe(401);
        }
      }
    }
  });

  it('allows public routes and protects bearer-only routes', async () => {
    const health = await request<{ status: string; timestamp: string }>(baseUrl, '/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });

    const protectedRoute = await request<{ statusCode: number }>(baseUrl, '/api/crops');
    expect(protectedRoute.status).toBe(401);
    expect(protectedRoute.body.statusCode).toBe(401);
  });

  it('matches auth and plot request/response contracts', async () => {
    const badRegister = await request<{ statusCode: number }>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'farmer_a', password: 'SecretPassword123', extra: true }),
    });
    expect(badRegister.status).toBe(400);

    const register = await request<{
      token: string;
      user: { id: string; username: string; role: string };
    }>(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'farmer_a', password: 'SecretPassword123' }),
    });
    expect(register.status).toBe(201);
    expect(register.body).toMatchObject({
      token: expect.any(String),
      user: {
        id: expect.any(String),
        username: 'farmer_a',
        role: 'FARMER',
      },
    });

    const token = register.body.token;
    const me = await request<{ username: string }>(baseUrl, '/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('farmer_a');

    const plot = await request<{
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      cropType: string;
      plantedAt: string;
      active: boolean;
      createdAt: string;
    }>(baseUrl, '/api/plots', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Contract Plot',
        latitude: 14.0208,
        longitude: 100.525,
        province: 'Pathum Thani',
        cropType: 'RICE',
        plantedAt: '2026-07-01',
      }),
    });
    expect(plot.status).toBe(201);
    expect(plot.body).toEqual({
      id: expect.any(String),
      name: 'Contract Plot',
      latitude: 14.0208,
      longitude: 100.525,
      province: 'Pathum Thani',
      cropType: 'RICE',
      plantedAt: '2026-07-01',
      active: true,
      createdAt: expect.any(String),
    });

    const updatedPlot = await request<typeof plot.body>(baseUrl, `/api/plots/${plot.body.id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Updated Contract Plot' }),
    });
    expect(updatedPlot.status).toBe(200);
    expect(updatedPlot.body).toEqual({
      ...plot.body,
      name: 'Updated Contract Plot',
    });

    const forecast = await request<Array<{ plotId: string; source: string }>>(
      baseUrl,
      `/api/plots/${plot.body.id}/weather/hourly`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(forecast.status).toBe(200);
    expect(forecast.body.length).toBeGreaterThan(0);
    expect(forecast.body[0]).toMatchObject({ plotId: plot.body.id, source: 'TMD' });
  });
});
