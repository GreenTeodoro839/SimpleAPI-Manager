import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PanelSession } from '@/types';
import { normalizeSession } from '@/api/managerApi';

const STORAGE_KEY = 'simpleapi-manager.session';

type SessionState = PanelSession & {
  connected: boolean;
  setSession: (session: PanelSession) => void;
  disconnect: () => void;
};

function loadSession(): PanelSession {
  if (typeof localStorage === 'undefined') {
    return { panelBase: '', adminKey: '' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { panelBase: '', adminKey: '' };
    return normalizeSession(JSON.parse(raw) as PanelSession);
  } catch {
    return { panelBase: '', adminKey: '' };
  }
}

const initial = loadSession();

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,
  connected: Boolean(initial.adminKey),
  setSession: (session) => {
    const normalized = normalizeSession(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    set({ ...normalized, connected: Boolean(normalized.adminKey) });
  },
  disconnect: () => {
    const next = { panelBase: '', adminKey: '' };
    localStorage.removeItem(STORAGE_KEY);
    set({ ...next, connected: false });
  }
}));

export function usePanelSession(): PanelSession {
  return useSessionStore(
    useShallow((state) => ({
      panelBase: state.panelBase,
      adminKey: state.adminKey
    }))
  );
}
