import { create } from 'zustand';
import { getMe, logout as apiLogout } from '../utils/api.js';

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,

  fetchUser: async () => {
    try {
      const user = await getMe();
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  logout: async () => {
    await apiLogout();
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));
