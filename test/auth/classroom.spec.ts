import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/app/services/auth.service';
import { AuthGuard } from '../../src/app/http/guards/auth.guard';
import { DatabaseService } from '../../src/infrastructure/database/database.service';

function service(mode: boolean, database = false) {
  return new AuthService({ enabled: database } as DatabaseService, new ConfigService({
    AUTH_SECRET: 'test-only-secret-at-least-32-characters', CLASSROOM_MODE: String(mode),
  }));
}
function context(request: object) {
  return { getHandler: () => (() => {}), getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}
it('accepts token-free requests with a real classroom admin account', async () => {
  const auth = service(true);
  const actor = await auth.initializeClassroom();
  const request = { headers: {}, user: undefined };
  await expect(new AuthGuard(new Reflector(), auth).canActivate(context(request))).resolves.toBe(true);
  expect(request.user).toEqual(actor);
  await expect(auth.me(actor!.id)).resolves.toMatchObject({ username: 'classroom', role: 'ADMIN' });
});
it('keeps normal authentication enabled outside classroom mode', async () => {
  const auth = service(false);
  await expect(auth.initializeClassroom()).resolves.toBeUndefined();
  await expect(new AuthGuard(new Reflector(), auth).canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
});
it('rejects classroom bypass when connected to persistent databases', () => {
  expect(() => service(true, true)).toThrow('isolated in-memory');
});
it('rejects bypass requests before the classroom account is initialized', async () => {
  await expect(new AuthGuard(new Reflector(), service(true)).canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
});
it('validates bearer tokens and rejects tampering in normal mode', async () => {
  const auth = service(false);
  const registered = await auth.register({ username: 'normal', password: 'NormalTest123!' });
  const request = { headers: { authorization: `Bearer ${registered.token}` }, user: undefined };
  const guard = new AuthGuard(new Reflector(), auth);
  await expect(guard.canActivate(context(request))).resolves.toBe(true);
  expect(request.user).toMatchObject({ id: registered.user.id, role: 'FARMER' });
  await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${registered.token}x` } }))).rejects.toBeInstanceOf(UnauthorizedException);
});
