import { create } from 'zustand';
import {
  fetchCurrentUser,
  login as loginRequest,
  LoginPayload,
  logout as logoutRequest,
} from '@/services/auth';
import {
  clearSessionSnapshot,
  readSessionSnapshot,
  redirectToLogin,
  SessionSnapshot,
  SessionTokens,
  SessionUser,
  UserRole,
  writeSessionSnapshot,
} from '@/services/http/storage';

export type PermissionMap = Record<string, string[]>;

function buildPermissions(role?: UserRole): PermissionMap {
  if (role === 'merchant') {
    return {
      overview: ['read'],
      auctions: ['read', 'write'],
      'live-sessions': ['read', 'write'],
      orders: ['read'],
      'audit-logs': ['read'],
    };
  }

  return {};
}

function persistSession(user?: SessionUser, tokens?: SessionTokens) {
  const snapshot: SessionSnapshot = {};
  if (user) {
    snapshot.user = user;
  }
  if (tokens) {
    snapshot.tokens = tokens;
  }

  if (!snapshot.user && !snapshot.tokens) {
    clearSessionSnapshot();
    return;
  }

  writeSessionSnapshot(snapshot);
}

const initialSnapshot = readSessionSnapshot();

interface SessionState {
  initialized: boolean;
  authLoading: boolean;
  user?: SessionUser;
  tokens?: SessionTokens;
  permissions: PermissionMap;
  bootstrap: () => Promise<void>;
  setSession: (payload: { user: SessionUser; tokens: SessionTokens }) => void;
  setUser: (user: SessionUser) => void;
  clearSession: () => void;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  initialized: false,
  authLoading: false,
  user: initialSnapshot.user,
  tokens: initialSnapshot.tokens,
  permissions: buildPermissions(initialSnapshot.user?.role),
  async bootstrap() {
    const { tokens, user } = get();
    if (!tokens) {
      set({ initialized: true, user: undefined, permissions: {} });
      return;
    }

    if (user) {
      set({ initialized: true, permissions: buildPermissions(user.role) });
      return;
    }

    try {
      const currentUser = await fetchCurrentUser();
      persistSession(currentUser, tokens);
      set({
        user: currentUser,
        permissions: buildPermissions(currentUser.role),
      });
    } catch (error) {
      clearSessionSnapshot();
      set({
        user: undefined,
        tokens: undefined,
        permissions: {},
      });
      redirectToLogin();
    } finally {
      set({ initialized: true });
    }
  },
  setSession({ user, tokens }) {
    persistSession(user, tokens);
    set({
      user,
      tokens,
      permissions: buildPermissions(user.role),
    });
  },
  setUser(user) {
    persistSession(user, get().tokens);
    set({
      user,
      permissions: buildPermissions(user.role),
    });
  },
  clearSession() {
    clearSessionSnapshot();
    set({
      user: undefined,
      tokens: undefined,
      permissions: {},
    });
  },
  async login(payload) {
    set({ authLoading: true });
    try {
      const result = await loginRequest(payload);
      const tokens: SessionTokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        expiresAt: Date.now() + result.expiresIn * 1000,
      };

      persistSession(result.user, tokens);
      set({
        user: result.user,
        tokens,
        permissions: buildPermissions(result.user.role),
        authLoading: false,
        initialized: true,
      });
    } catch (error) {
      set({ authLoading: false, initialized: true });
      throw error;
    }
  },
  async logout() {
    const refreshToken = get().tokens?.refreshToken;
    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } finally {
      clearSessionSnapshot();
      set({
        user: undefined,
        tokens: undefined,
        permissions: {},
      });
    }
  },
}));
