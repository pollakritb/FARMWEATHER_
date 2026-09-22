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
      get: jest.fn((key: string, fallback?: unknown) => key === 'AUTH_SECRET' ? 'test-secret-with-at-least-32-characters' : fallback),
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

describe('AuthService in-memory workflows', () => {
  function createService(exposeResetToken = false) {
    const database = { enabled: false, query: jest.fn() } as unknown as DatabaseService;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => (
        key === 'AUTH_SECRET'
          ? 'test-secret-with-at-least-32-characters'
          : key === 'PASSWORD_RESET_EXPOSE_TOKEN'
            ? String(exposeResetToken)
            : fallback
      )),
    } as unknown as ConfigService;
    return new AuthService(database, config);
  }

  it('registers, verifies, logs out, and rejects a revoked token', async () => {
    const service = createService();
    const registered = await service.register({ username: 'Farmer', password: 'secret123' });

    await expect(service.verifyToken(registered.token)).resolves.toMatchObject({
      id: registered.user.id,
      username: 'farmer',
      role: 'FARMER',
    });
    await service.logout(await service.verifyToken(registered.token));
    await expect(service.verifyToken(registered.token)).rejects.toThrow('กรุณาเข้าสู่ระบบใหม่');
    await expect(service.login({ username: 'farmer', password: 'wrong-password' })).rejects.toThrow('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    await expect(service.register({ username: 'farmer', password: 'secret123' })).rejects.toThrow('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  });

  it('updates a profile and resets its password only once', async () => {
    const service = createService(true);
    const registered = await service.register({ username: 'farmer', password: 'secret123' });
    const profile = await service.updateProfile(registered.user.id, {
      displayName: 'Farmer One', phone: '0812345678', province: 'นครปฐม',
    });
    expect(profile).toMatchObject({ displayName: 'Farmer One', phone: '0812345678', province: 'นครปฐม' });

    const reset = await service.requestPasswordReset('FARMER');
    expect(reset).toMatchObject({
      message: 'หากพบบัญชี ระบบได้สร้างคำขอรีเซ็ตรหัสผ่านแล้ว',
      expiresInSeconds: 900,
    });
    expect('resetToken' in reset && reset.resetToken).toHaveLength(43);
    if (!('resetToken' in reset)) throw new Error('Expected a development reset token');

    await service.resetPassword(reset.resetToken, 'NewPassword123');
    await expect(service.verifyToken(registered.token)).rejects.toThrow('กรุณาเข้าสู่ระบบใหม่');
    await expect(service.login({ username: 'farmer', password: 'NewPassword123' })).resolves.toHaveProperty('token');
    await expect(service.resetPassword(reset.resetToken, 'AnotherPassword123')).rejects.toThrow('token รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ');
  });

  it('does not expose reset tokens unless explicitly enabled', async () => {
    const service = createService();
    await service.register({ username: 'private_user', password: 'secret123' });
    await expect(service.requestPasswordReset('private_user')).resolves.toEqual({
      message: 'หากพบบัญชี ระบบได้สร้างคำขอรีเซ็ตรหัสผ่านแล้ว',
    });
  });

  it('enforces administrator-only user management', async () => {
    const service = createService();
    const farmer = await service.register({ username: 'farmer', password: 'secret123' });
    const farmerUser = await service.verifyToken(farmer.token);
    const adminUser = { id: 'admin-id', username: 'admin', role: 'ADMIN' as const, sessionId: 'session-id' };

    await expect(service.listUsers(farmerUser)).rejects.toThrow('ต้องใช้สิทธิ์ผู้ดูแลระบบ');
    await expect(service.setRole(adminUser, adminUser.id, 'FARMER')).rejects.toThrow('ไม่สามารถลดสิทธิ์ของบัญชีที่กำลังใช้งาน');
    await expect(service.setRole(adminUser, 'missing', 'ADMIN')).rejects.toThrow('ไม่พบบัญชีผู้ใช้');
    await expect(service.setRole(adminUser, farmerUser.id, 'ADMIN')).resolves.toMatchObject({ role: 'ADMIN' });
    await expect(service.listUsers(adminUser)).resolves.toHaveLength(1);
  });
});
