import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UpdateProfileDto } from '../dtos/account.dto';
import { AuthDto } from '../dtos/auth.dto';
import { AuthUser } from '../models/auth.types';
import { UserRole } from '../models/domain';

type UserRow = {
  id: string; username: string; password_hash: string; role: UserRole;
  display_name?: string; phone?: string; province?: string; created_at?: string | Date;
};
type Session = { id: string; userId: string; expiresAt: number; revokedAt?: number };
type ResetToken = { userId: string; expiresAt: number; used: boolean };

@Injectable()
export class AuthService {
  private readonly users = new Map<string, UserRow>();
  private readonly sessions = new Map<string, Session>();
  private readonly resetTokens = new Map<string, ResetToken>();
  private readonly secret: string;
  private readonly adminUsername?: string;
  private readonly exposeResetToken: boolean;

  constructor(private readonly database: DatabaseService, config: ConfigService) {
    this.secret = config.get<string>('AUTH_SECRET', 'development-only-change-me');
    this.adminUsername = config.get<string>('ADMIN_USERNAME')?.toLowerCase();
    this.exposeResetToken = config.get<string>('NODE_ENV') !== 'production'
      && config.get<string>('EXPOSE_RESET_TOKEN', 'true').toLowerCase() === 'true';
  }

  async register(dto: AuthDto) {
    const username = dto.username.toLowerCase();
    if (await this.findByUsername(username)) throw new BadRequestException('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
    const user: UserRow = {
      id: randomUUID(), username, password_hash: this.hash(dto.password),
      role: username === this.adminUsername ? 'ADMIN' : 'FARMER',
    };
    if (this.database.enabled) {
      await this.database.query('INSERT INTO users (id, username, password_hash, role) VALUES ($1,$2,$3,$4)', [user.id, user.username, user.password_hash, user.role]);
    } else this.users.set(username, user);
    return this.authResponse(user);
  }

  async login(dto: AuthDto) {
    const user = await this.findByUsername(dto.username.toLowerCase());
    if (!user || !this.verify(dto.password, user.password_hash)) throw new UnauthorizedException('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    return this.authResponse(user);
  }

  async verifyToken(token: string): Promise<AuthUser> {
    try {
      const [payload, signature] = token.split('.');
      const expected = this.sign(payload);
      if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthUser & { exp: number };
      if (parsed.exp < Date.now() || !(await this.isSessionActive(parsed.sessionId, parsed.id))) throw new Error();
      const user = await this.findById(parsed.id);
      if (!user) throw new Error();
      return { id: user.id, username: user.username, role: user.role, sessionId: parsed.sessionId };
    } catch { throw new UnauthorizedException('กรุณาเข้าสู่ระบบใหม่'); }
  }

  async logout(user: AuthUser): Promise<void> {
    if (this.database.enabled) await this.database.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2', [user.sessionId, user.id]);
    else { const session = this.sessions.get(user.sessionId); if (session) session.revokedAt = Date.now(); }
  }

  async me(id: string) { const user = await this.findById(id); return this.publicUser(user!); }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException();
    user.display_name = dto.displayName ?? user.display_name;
    user.phone = dto.phone ?? user.phone;
    user.province = dto.province ?? user.province;
    if (this.database.enabled) await this.database.query(
      'UPDATE users SET display_name=$1, phone=$2, province=$3, updated_at=now() WHERE id=$4',
      [user.display_name ?? null, user.phone ?? null, user.province ?? null, id],
    );
    return this.publicUser(user);
  }

  async requestPasswordReset(username: string) {
    const user = await this.findByUsername(username.toLowerCase());
    if (!user) return { message: 'หากพบบัญชี ระบบได้สร้างคำขอรีเซ็ตรหัสผ่านแล้ว' };
    const token = randomBytes(32).toString('base64url');
    const hash = this.tokenHash(token);
    const expiresAt = Date.now() + 15 * 60_000;
    if (this.database.enabled) await this.database.query(
      'INSERT INTO password_reset_tokens (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',
      [hash, user.id, new Date(expiresAt)],
    ); else this.resetTokens.set(hash, { userId: user.id, expiresAt, used: false });
    const response = { message: 'สร้างคำขอรีเซ็ตรหัสผ่านแล้ว', expiresInSeconds: 900 };
    return this.exposeResetToken ? { ...response, resetToken: token } : response;
  }

  async resetPassword(token: string, newPassword: string) {
    const hash = this.tokenHash(token);
    let userId: string | undefined;
    if (this.database.enabled) {
      const rows = await this.database.query<{ user_id: string }>(
        'SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()', [hash],
      );
      userId = rows[0]?.user_id;
    } else {
      const item = this.resetTokens.get(hash);
      if (item && !item.used && item.expiresAt > Date.now()) { userId = item.userId; item.used = true; }
    }
    if (!userId) throw new BadRequestException('token รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ');
    const digest = this.hash(newPassword);
    if (this.database.enabled) {
      await this.database.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [digest, userId]);
      await this.database.query('UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1', [hash]);
      await this.database.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    } else {
      const user = [...this.users.values()].find((item) => item.id === userId)!; user.password_hash = digest;
      [...this.sessions.values()].filter((item) => item.userId === userId).forEach((item) => item.revokedAt = Date.now());
    }
    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' };
  }

  async listUsers(actor: AuthUser) { this.requireAdmin(actor); return (await this.allUsers()).map((u) => this.publicUser(u)); }

  async setRole(actor: AuthUser, userId: string, role: UserRole) {
    this.requireAdmin(actor);
    if (actor.id === userId && role !== 'ADMIN') throw new BadRequestException('ไม่สามารถลดสิทธิ์ของบัญชีที่กำลังใช้งาน');
    const user = await this.findById(userId); if (!user) throw new BadRequestException('ไม่พบบัญชีผู้ใช้');
    user.role = role;
    if (this.database.enabled) await this.database.query('UPDATE users SET role=$1, updated_at=now() WHERE id=$2', [role, userId]);
    return this.publicUser(user);
  }

  private requireAdmin(user: AuthUser) { if (user.role !== 'ADMIN') throw new ForbiddenException('ต้องใช้สิทธิ์ผู้ดูแลระบบ'); }
  private async allUsers(): Promise<UserRow[]> { return this.database.enabled ? this.database.query<UserRow>('SELECT * FROM users ORDER BY created_at') : [...this.users.values()]; }
  private async findByUsername(username: string): Promise<UserRow | undefined> { return this.database.enabled ? (await this.database.query<UserRow>('SELECT * FROM users WHERE username=$1', [username]))[0] : this.users.get(username); }
  private async findById(id: string): Promise<UserRow | undefined> { return this.database.enabled ? (await this.database.query<UserRow>('SELECT * FROM users WHERE id=$1', [id]))[0] : [...this.users.values()].find((u) => u.id === id); }
  private publicUser(user: UserRow) { return { id: user.id, username: user.username, role: user.role, displayName: user.display_name, phone: user.phone, province: user.province, createdAt: user.created_at }; }
  private hash(password: string): string { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
  private verify(password: string, stored: string): boolean { const [salt, digest] = stored.split(':'); const candidate = scryptSync(password, salt, 64); const expected = Buffer.from(digest, 'hex'); return candidate.length === expected.length && timingSafeEqual(candidate, expected); }
  private tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private sign(payload: string): string { return createHmac('sha256', this.secret).update(payload).digest('base64url'); }

  private async authResponse(user: UserRow) {
    const sessionId = randomUUID(); const expiresAt = Date.now() + 7 * 86_400_000;
    if (this.database.enabled) await this.database.query('INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [sessionId, user.id, new Date(expiresAt)]);
    else this.sessions.set(sessionId, { id: sessionId, userId: user.id, expiresAt });
    const authUser: AuthUser = { id: user.id, username: user.username, role: user.role, sessionId };
    const payload = Buffer.from(JSON.stringify({ ...authUser, exp: expiresAt })).toString('base64url');
    return { token: `${payload}.${this.sign(payload)}`, user: this.publicUser(user) };
  }

  private async isSessionActive(id: string, userId: string): Promise<boolean> {
    if (this.database.enabled) return Boolean((await this.database.query('SELECT 1 FROM auth_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()', [id, userId]))[0]);
    const session = this.sessions.get(id); return Boolean(session && session.userId === userId && !session.revokedAt && session.expiresAt > Date.now());
  }
}
