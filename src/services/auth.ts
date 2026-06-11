import http, { HttpRequestConfig } from './http/client';
import { SessionUser, UserRole } from './http/storage';

export interface LoginPayload {
  account: string;
  password: string;
  role: Extract<UserRole, 'merchant'>;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SessionUser;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

export interface LogoutResult {
  loggedOut: boolean;
}

export interface UpdateProfilePayload {
  nickname?: string;
  location?: string;
}

function createIdempotencyKey(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function login(payload: LoginPayload) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.post<any, LoginResult>('/api/v1/auth/login', payload, {
    ...config,
  });
}

export function fetchCurrentUser() {
  return http.get<any, SessionUser>('/api/v1/auth/me');
}

export function updateCurrentUserProfile(payload: UpdateProfilePayload) {
  return http.patch<any, SessionUser>('/api/v1/auth/me', payload, {
    headers: {
      'Idempotency-Key': createIdempotencyKey('profile-update'),
    },
  });
}

export function uploadCurrentUserAvatar(file: File) {
  const data = new FormData();
  data.append('avatar', file);
  return http.post<any, SessionUser>('/api/v1/auth/me/avatar', data, {
    headers: {
      'Idempotency-Key': createIdempotencyKey('avatar-upload'),
    },
  });
}

export function refreshToken(refreshTokenValue: string) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.post<any, RefreshResult>(
    '/api/v1/auth/refresh',
    { refreshToken: refreshTokenValue },
    config
  );
}

export function logout(refreshTokenValue?: string) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
    skipGlobalLoading: true,
  };
  return http.post<any, LogoutResult>(
    '/api/v1/auth/logout',
    refreshTokenValue ? { refreshToken: refreshTokenValue } : undefined,
    config
  );
}
