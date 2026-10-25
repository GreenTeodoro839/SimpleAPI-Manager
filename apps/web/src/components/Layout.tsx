import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Braces,
  Coins,
  Contrast,
  Database,
  Gauge,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-react';
import { useSessionStore } from '@/store/session';
import { useThemeStore, type ThemePreference } from '@/store/theme';

interface LayoutProps {
  children: ReactNode;
}

const navGroups = [
  {
    id: 'overview',
    label: '概览',
    items: [{ to: '/', label: '仪表盘', icon: LayoutDashboard }]
  },
  {
    id: 'gateway',
    label: '接入',
    items: [
      { to: '/providers', label: '提供商', icon: Network },
      { to: '/api-keys', label: 'API Keys', icon: Key },
      { to: '/payload', label: 'Payload', icon: Braces },
      { to: '/models', label: '模型', icon: Database }
    ]
  },
  {
    id: 'insight',
    label: '数据',
    items: [
      { to: '/usage', label: '用量', icon: BarChart3 },
      { to: '/monitoring', label: '请求监控', icon: Activity },
      { to: '/prices', label: '模型价格', icon: Coins }
    ]
  },
  {
    id: 'control',
    label: '控制',
    items: [
      { to: '/usage-controls', label: '用量控制', icon: Gauge },
      { to: '/config', label: '配置', icon: SlidersHorizontal }
    ]
  }
];

const THEME_CARDS: Array<{
  key: ThemePreference;
  label: string;
  icon: typeof Sun;
  colors: { bg: string; panel: string; border: string; line: string };
}> = [
  {
    key: 'auto',
    label: '自动',
    icon: Monitor,
    colors: {
      bg: 'linear-gradient(135deg, #faf9f5 0 50%, #151412 50% 100%)',
      panel: 'linear-gradient(135deg, #f0eee8 0 50%, #1d1b18 50% 100%)',
      border: '#bdbdbd',
      line: 'linear-gradient(135deg, #a29c95 0 50%, #9c958d 50% 100%)'
    }
  },
  {
    key: 'light',
    label: '浅色',
    icon: Sun,
    colors: { bg: '#faf9f5', panel: '#f0eee8', border: '#e3e1db', line: '#a29c95' }
  },
  {
    key: 'white',
    label: '纯白',
    icon: Contrast,
    colors: { bg: '#ffffff', panel: '#ffffff', border: '#e5e5e5', line: '#c0bab3' }
  },
  {
    key: 'dark',
    label: '深色',
    icon: Moon,
    colors: { bg: '#151412', panel: '#1d1b18', border: '#3a3530', line: '#6f6962' }
  }
];

const SIDEBAR_KEY = 'simpleapi-manager.sidebar.collapsed';

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // 折叠状态持久化失败时仅本次会话生效。
  }
}

export function Layout({ children }: LayoutProps) {
  const disconnect = useSessionStore((state) => state.disconnect);
  const themePreference = useThemeStore((state) => state.preference);
  const setTheme = useThemeStore((state) => state.setTheme);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  const showLabels = !collapsed || sidebarOpen;
  const activeCard = THEME_CARDS.find((card) => card.key === themePreference) ?? THEME_CARDS[0];
  const ThemeIcon = activeCard.icon;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      saveSidebarCollapsed(!prev);
      return !prev;
    });
  }, []);

  // Ctrl/⌘ + B 折叠侧边栏
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

  // 点击菜单外或按 Esc 关闭主题弹层
  useEffect(() => {
    if (!themeMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setThemeMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [themeMenuOpen]);

  const handleThemeSelect = (preference: ThemePreference) => {
    setTheme(preference);
    setThemeMenuOpen(false);
  };

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-is-collapsed' : ''}`}>
      <div className="top-gradient-blur" aria-hidden="true" />

      <header className="main-header">
        <button
          type="button"
          className="sidebar-toggle-floating"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={`收起/展开侧边栏（Ctrl/⌘ + B）`}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        <div className="mobile-sidebar-actions">
          <button
            type="button"
            className="header-pill-button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? '关闭导航' : '打开导航'}
          >
            {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>

        <div className="header-actions">
          <div className={`theme-menu ${themeMenuOpen ? 'open' : ''}`} ref={themeMenuRef}>
            <button
              type="button"
              className="header-pill-button"
              onClick={() => setThemeMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
              aria-label="切换主题"
              title="切换主题"
            >
              <ThemeIcon size={16} />
            </button>
            {themeMenuOpen && (
              <div className="theme-menu-popover" role="menu" aria-label="切换主题">
                {THEME_CARDS.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`theme-card ${card.key === themePreference ? 'active' : ''}`}
                    role="menuitemradio"
                    aria-checked={card.key === themePreference}
                    onClick={() => handleThemeSelect(card.key)}
                  >
                    <div
                      className="theme-card-preview"
                      style={{ background: card.colors.bg, border: `1px solid ${card.colors.border}` }}
                    >
                      <div
                        className="theme-card-header"
                        style={{
                          background: card.colors.panel,
                          borderBottom: `1px solid ${card.colors.border}`
                        }}
                      />
                      <div className="theme-card-body">
                        <div
                          className="theme-card-sidebar"
                          style={{
                            background: card.colors.panel,
                            borderRight: `1px solid ${card.colors.border}`
                          }}
                        />
                        <div className="theme-card-content" style={{ background: card.colors.bg }}>
                          <div className="theme-card-line" style={{ background: card.colors.line }} />
                          <div
                            className="theme-card-line short"
                            style={{ background: card.colors.line }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="theme-card-label">{card.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="header-pill-button"
            onClick={disconnect}
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="main-body">
        <button
          type="button"
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭导航"
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-brand" title="SimpleAPI Manager">
              <div className="sidebar-brand-logo">
                <Activity size={17} />
              </div>
              {showLabels && (
                <div className="sidebar-brand-text">
                  <div className="sidebar-brand-title">SimpleAPI</div>
                  <div className="sidebar-brand-subtitle">Manager 控制台</div>
                </div>
              )}
            </div>
          </div>

          <div className="nav-section">
            {navGroups.map((group, index) => (
              <div className="nav-group" key={group.id}>
                {showLabels ? (
                  <div className="nav-group-label">{group.label}</div>
                ) : (
                  index > 0 && <div className="nav-group-divider" aria-hidden="true" />
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={showLabels ? undefined : item.label}
                      aria-label={showLabels ? undefined : item.label}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon size={16} />
                      {showLabels && <span>{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <div className="content">
          <main className="main-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
