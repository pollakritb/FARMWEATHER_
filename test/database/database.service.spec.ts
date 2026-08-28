import { DatabaseService } from '../../src/infrastructure/database/database.service';

describe('DatabaseService production configuration', () => {
  function config(values: Record<string, string | undefined>) {
    return {
      get: jest.fn((key: string, fallback?: unknown) => (
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback
      )),
    };
  }

  it('refuses process-local storage in production by default', () => {
    expect(() => new DatabaseService(config({ NODE_ENV: 'production' }) as never))
      .toThrow('DATABASE_URL is required in production');
  });

  it('allows in-memory storage in development', () => {
    expect(new DatabaseService(config({ NODE_ENV: 'development' }) as never).enabled).toBe(false);
  });

  it('temporarily allows in-memory storage on Vercel', () => {
    expect(new DatabaseService(config({ NODE_ENV: 'production', VERCEL: '1' }) as never).enabled)
      .toBe(false);
  });
});
