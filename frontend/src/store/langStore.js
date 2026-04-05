import { create } from 'zustand';

const saved = localStorage.getItem('lobster-lang');

export const useLangStore = create((set) => ({
  lang: saved === 'zh' ? 'zh' : 'en',
  toggle: () => set(s => {
    const next = s.lang === 'en' ? 'zh' : 'en';
    localStorage.setItem('lobster-lang', next);
    return { lang: next };
  }),
}));
