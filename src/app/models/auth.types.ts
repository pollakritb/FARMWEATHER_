import { UserRole } from './domain';

export interface AuthUser { id: string; username: string; role: UserRole; sessionId: string }
export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user: AuthUser;
}
