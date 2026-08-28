import { AuthService } from '../../src/app/services/auth.service';

describe('AuthService password reset exposure', () => {
  function createService(values: Record<string, string | undefined>) {
    const database = { enabled: false, query: jest.fn() };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => (
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback
      )),
    };
    return new AuthService(database as never, config as never);
  }

  it('does not expose a reset token in production', async () => {
    const service = createService({ NODE_ENV: 'production', EXPOSE_RESET_TOKEN: 'true' });
    await service.register({ username: 'farmer01', password: 'Secret123!' });

    const response = await service.requestPasswordReset('farmer01');

    expect(response).toEqual({
      message: 'สร้างคำขอรีเซ็ตรหัสผ่านแล้ว',
      expiresInSeconds: 900,
    });
  });

  it('can expose a reset token explicitly in development', async () => {
    const service = createService({ NODE_ENV: 'development', EXPOSE_RESET_TOKEN: 'true' });
    await service.register({ username: 'farmer01', password: 'Secret123!' });

    const response = await service.requestPasswordReset('farmer01');

    expect(response).toMatchObject({ expiresInSeconds: 900 });
    expect('resetToken' in response).toBe(true);
  });
});
