import { ConfigService } from '@nestjs/config';
import { scryptSync } from 'node:crypto';
import { AuthService } from '../../src/app/services/auth.service';
import { DatabaseService } from '../../src/infrastructure/database/database.service';

describe('AuthService database response normalization', () => {
  it('omits nullable optional profile fields from login responses', async () => {
    const salt = 'test-salt';
    const password = 'secret123';
    const user = {
      id: '7ab2c909-4f4e-4fd1-8ca4-c07030a24c9d',
      username: 'farmer_db',
      password_hash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
      role: 'FARMER' as const,
      display_name: null,
      phone: null,
      province: null,
      created_at: new Date('2026-08-29T00:00:00.000Z'),
    };
    const database = {
      enabled: true,
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SELECT * FROM users WHERE username')) return [user];
        return [];
      }),
    } as unknown as DatabaseService;
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const service = new AuthService(database, config);

    const result = await service.login({ username: user.username, password });

    expect(result.user).toEqual({
      id: user.id,
      username: user.username,
      role: 'FARMER',
      createdAt: '2026-08-29T00:00:00.000Z',
    });
  });
});
