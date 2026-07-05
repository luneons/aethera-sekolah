import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string | null;
  employee_id: string;
  role: string;
  photo_url: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  parent_name?: string | null;
  department?: { id: number; name: string } | null;
  school_class?: { id: number; name: string } | null;
  has_face_enrolled?: boolean;
  status?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (a: { accessToken: string; refreshToken: string }) => void;
  setUser: (u: AuthUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken }) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'aethera-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
