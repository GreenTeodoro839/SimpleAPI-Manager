import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'auto' | ThemeMode;

const STORAGE_KEY = 'simpleapi-manager.theme.preference';
const THEME_ORDER: ThemePreference[] = ['auto', 'light', 'dark'];

function systemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ThemeMode {
  return preference === 'auto' ? systemTheme() : preference;
}

function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'auto' || stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function saveThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Theme persistence is optional; the active theme is still applied in memory.
  }
}

export function applyTheme(mode: ThemeMode, preference: ThemePreference = mode) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = mode;
}

export function initializeTheme() {
  const preference = readThemePreference();
  applyTheme(resolveTheme(preference), preference);
}

interface ThemeState {
  preference: ThemePreference;
  effective: ThemeMode;
  setTheme: (preference: ThemePreference) => void;
  cycleTheme: () => void;
  syncSystemTheme: () => void;
}

const initialPreference = readThemePreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  effective: resolveTheme(initialPreference),
  setTheme: (preference) => {
    const effective = resolveTheme(preference);
    saveThemePreference(preference);
    applyTheme(effective, preference);
    set({ preference, effective });
  },
  cycleTheme: () => {
    const currentIndex = THEME_ORDER.indexOf(get().preference);
    const nextPreference = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    get().setTheme(nextPreference);
  },
  syncSystemTheme: () => {
    const { preference, effective: currentEffective } = get();
    const effective = resolveTheme(preference);
    if (effective !== currentEffective) {
      applyTheme(effective, preference);
      set({ effective });
    }
  }
}));

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const syncTheme = () => useThemeStore.getState().syncSystemTheme();
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', syncTheme);
  } else {
    media.addListener?.(syncTheme);
  }
}
