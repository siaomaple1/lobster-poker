import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  show: (message, type = 'error') => {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 4000);
  },
}));
