import axios from 'axios';
import { useAuthStore } from '@/stores/useAuthStore';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1',
  timeout: 120_000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── Token refresh logic ───────────────────────────────────────────────────
// Kalau access token expired (401), coba refresh dulu sebelum redirect ke login.
// Pakai queue supaya concurrent requests tidak trigger multiple refresh.

let _isRefreshing = false;
let _failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function _processQueue(error: unknown, token: string | null) {
  _failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  _failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== 'undefined'
    ) {
      const path = window.location.pathname;
      // Jangan redirect dari kiosk / halaman public
      if (path.startsWith('/scan') || path === '/login' || path.startsWith('/daftar')) {
        return Promise.reject(error);
      }

      const refreshToken = useAuthStore.getState().refreshToken;

      // Tidak ada refresh token → langsung logout
      if (!refreshToken) {
        useAuthStore.getState().clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      // Kalau sedang refresh, queue request ini
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        const newAccess: string = data.data.access_token;
        const newRefresh: string = data.data.refresh_token ?? refreshToken;

        useAuthStore.getState().setSession({
          accessToken: newAccess,
          refreshToken: newRefresh,
        });

        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;

        _processQueue(null, newAccess);
        return api(originalRequest);
      } catch (refreshErr) {
        _processQueue(refreshErr, null);
        useAuthStore.getState().clear();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Types matching backend envelopes
export interface Envelope<T> {
  success: boolean;
  data?: T;
  meta?: { page?: number; per_page?: number; total?: number };
  message?: string;
  error?: { code?: string; message: string; details?: Record<string, unknown> };
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiError | undefined;
    if (data?.error?.message) return data.error.message;
    if (typeof data === 'object' && data && 'message' in data) {
      return String((data as { message?: string }).message);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Terjadi kesalahan';
}
