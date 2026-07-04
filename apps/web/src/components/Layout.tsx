import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bot,
  Database,
  FileCode2,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  ServerCog,
  Settings2,
  Sun,
  X
} from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/store/session';
import { useThemeStore } from '@/store/theme';

interface LayoutProps {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const navItems = [
  { to: '/', label: '仪表盘', icon: Gauge },
  { to: '/providers', label: '提供商', icon: Bot },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/payload', label: 'Payload', icon: FileCode2 },
  { to: '/usage', label: '用量', icon: BarChart3 },
  { to: '/models', label: '模型', icon: Database },
  { to: '/config', label: '配置', icon: Settings2 }
];

export function Layout({ children, onRefresh, refreshing }: LayoutProps) {
  const [open, setOpen] = useState(false);
  const disconnect = useSessionStore((state) => state.disconnect);
  const panelBase = useSessionStore((state) => state.panelBase);
  const themePreference = useThemeStore((state) => state.preference);
  const cycleTheme = useThemeStore((state) => state.cycleTheme);
  const location = useLocation();
  const active = navItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  );
  const themeLabel =
    themePreference === 'auto' ? '自动' : themePreference === 'dark' ? '深色' : '浅色';
  const nextThemeLabel =
    themePreference === 'auto' ? '浅色' : themePreference === 'light' ? '深色' : '自动';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="icon-button mobile-only"
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? '关闭导航' : '打开导航'}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="breadcrumb">
            <ServerCog size={18} />
            <span>{active?.label ?? 'SimpleAPI Manager'}</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="connection-pill">{panelBase || 'same-origin manager'}</span>
          <button
            className="button button-ghost"
            type="button"
            onClick={cycleTheme}
            title={`当前主题：${themeLabel}，点击切换到${nextThemeLabel}`}
          >
            {themePreference === 'auto' ? (
              <Monitor size={16} />
            ) : themePreference === 'dark' ? (
              <Moon size={16} />
            ) : (
              <Sun size={16} />
            )}
            {themeLabel}
          </button>
          <button
            className="button button-ghost"
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="button button-ghost" type="button" onClick={disconnect}>
            <LogOut size={16} />
            退出
          </button>
        </div>
      </header>

      <div className="shell-body">
        <button
          className={`sidebar-backdrop ${open ? 'visible' : ''}`}
          type="button"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        />
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <div className="brand">
            <div className="brand-mark">
              <Activity size={22} />
            </div>
            <div>
              <strong>SimpleAPI</strong>
              <span>Manager</span>
            </div>
          </div>
          <nav>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
