import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'simpleapi-manager.theme';

function systemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return systemTheme();
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export function initializeTheme() {
  applyTheme(readTheme());
}

interface ThemeState {
  mode: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readTheme(),
  setTheme: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(mode);
    set({ mode });
  },
  toggleTheme: () => {
    get().setTheme(get().mode === 'dark' ? 'light' : 'dark');
  }
}));
