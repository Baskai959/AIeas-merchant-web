import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Message } from '@arco-design/web-react';
import NProgress from 'nprogress';
import {
  clearSessionSnapshot,
  readSessionSnapshot,
  redirectToLogin,
  writeSessionSnapshot,
} from './storage';
import { useQueryStore } from '@/store/query';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  trace_id?: string;
}

export class ApiError<T = unknown> extends Error {
  code?: number;
  status?: number;
  traceId?: string;
  data?: T;

  constructor(message: string, options?: Partial<ApiError<T>>) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, options);
  }
}

type RetryableAxiosRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
  skipErrorMessage?: boolean;
  skipGlobalLoading?: boolean;
};

export type HttpRequestConfig = RetryableAxiosRequestConfig;

const AUTH_INVALID_CODE = 10002;
const http = axios.create({
  timeout: 15000,
});

const refreshClient = axios.create({
  timeout: 15000,
});

let pendingRequestCount = 0;
let refreshPromise: Promise<string | null> | null = null;

function startGlobalLoading() {
  pendingRequestCount += 1;
  useQueryStore.getState().beginRequest();
  if (pendingRequestCount === 1) {
    NProgress.start();
  }
}

function stopGlobalLoading() {
  pendingRequestCount = Math.max(0, pendingRequestCount - 1);
  useQueryStore.getState().endRequest();
  if (pendingRequestCount === 0) {
    NProgress.done();
  }
}

function createApiError<T>(
  payload: Partial<ApiError<T>> & { message?: string }
): ApiError<T> {
  return new ApiError<T>(payload.message || '请求失败', payload);
}

async function refreshAccessToken() {
  const snapshot = readSessionSnapshot();
  const refreshToken = snapshot.tokens?.refreshToken;
  if (!refreshToken) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<ApiResponse<{ accessToken: string; expiresIn: number }>>(
        '/api/v1/auth/refresh',
        { refreshToken }
      )
      .then((response) => {
        if (response.data.code !== 0) {
          throw createApiError({
            message: response.data.message,
            code: response.data.code,
            traceId: response.data.trace_id,
          });
        }

        const nextTokens = {
          ...snapshot.tokens,
          accessToken: response.data.data.accessToken,
          expiresIn: response.data.data.expiresIn,
          expiresAt: Date.now() + response.data.data.expiresIn * 1000,
        };

        writeSessionSnapshot({
          ...snapshot,
          tokens: nextTokens,
        });

        return nextTokens.accessToken;
      })
      .catch(() => {
        clearSessionSnapshot();
        redirectToLogin();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

http.interceptors.request.use((config: RetryableAxiosRequestConfig) => {
  if (!config.skipGlobalLoading) {
    startGlobalLoading();
  }

  const nextConfig = { ...config };
  const snapshot = readSessionSnapshot();
  if (snapshot.tokens?.accessToken) {
    nextConfig.headers = {
      ...nextConfig.headers,
      Authorization: `Bearer ${snapshot.tokens.accessToken}`,
    };
  }

  return nextConfig;
});

http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const config = response.config as RetryableAxiosRequestConfig;
    if (!config.skipGlobalLoading) {
      stopGlobalLoading();
    }

    if (response.data.code !== 0) {
      const apiError = createApiError({
        message: response.data.message,
        code: response.data.code,
        traceId: response.data.trace_id,
        status: response.status,
        data: response.data.data,
      });

      if (!config.skipErrorMessage) {
        Message.error(apiError.message);
      }

      return Promise.reject(apiError);
    }

    return response.data.data;
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const config = (error.config || {}) as RetryableAxiosRequestConfig;
    if (!config.skipGlobalLoading) {
      stopGlobalLoading();
    }

    const responseData = error.response?.data;
    const shouldRefresh =
      !config._retry &&
      !config.url?.includes('/api/v1/auth/login') &&
      !config.url?.includes('/api/v1/auth/refresh') &&
      !config.url?.includes('/api/v1/auth/logout') &&
      (error.response?.status === 401 || responseData?.code === AUTH_INVALID_CODE);

    if (shouldRefresh) {
      config._retry = true;
      const nextAccessToken = await refreshAccessToken();
      if (nextAccessToken) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${nextAccessToken}`,
        };
        return http(config);
      }
    }

    const apiError = createApiError({
      message:
        responseData?.message || error.message || '网络异常，请稍后重试',
      code: responseData?.code,
      traceId: responseData?.trace_id,
      status: error.response?.status,
      data: responseData?.data,
    });

    if (!config.skipErrorMessage) {
      Message.error(apiError.message);
    }

    if (error.response?.status === 401 || responseData?.code === AUTH_INVALID_CODE) {
      clearSessionSnapshot();
      redirectToLogin();
    }

    return Promise.reject(apiError);
  }
);

export function getPendingRequestCount() {
  return pendingRequestCount;
}

export default http;
