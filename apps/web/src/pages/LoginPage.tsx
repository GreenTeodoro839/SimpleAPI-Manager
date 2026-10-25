import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Contrast, LockKeyhole, Monitor, Moon, Sun } from 'lucide-react';
import { errorMessage, getInfo, getManagerConfig } from '@/api/managerApi';
import { useSessionStore } from '@/store/session';
import { useThemeStore, type ThemePreference } from '@/store/theme';
import { Notice } from '@/components/Notice';

const THEME_META: Record<ThemePreference, { label: string; next: string; Icon: typeof Sun }> = {
  auto: { label: '自动', next: '浅色', Icon: Monitor },
  light: { label: '浅色', next: '纯白', Icon: Sun },
  white: { label: '纯白', next: '深色', Icon: Contrast },
  dark: { label: '深色', next: '自动', Icon: Moon }
};

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const storedPanelBase = useSessionStore((state) => state.panelBase);
  const themePreference = useThemeStore((state) => state.preference);
  const cycleTheme = useThemeStore((state) => state.cycleTheme);
  const [panelBase, setPanelBase] = useState(storedPanelBase);
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getInfo(panelBase)
      .then((data) => setInfo(`${data.service} · ${data.configured ? '已配置' : '需要连接 SimpleAPI'}`))
      .catch(() => setInfo('manager-server 未连接'));
  }, [panelBase]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    const session = { panelBase, adminKey };
    try {
      const managerConfig = await getManagerConfig(session);
      setSession(session);
      navigate(managerConfig.configured ? '/' : '/setup', { replace: true });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const themeMeta = THEME_META[themePreference];

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <button
          className="icon-button login-theme-button"
          type="button"
          onClick={cycleTheme}
          aria-label={`当前主题：${themeMeta.label}，点击切换到${themeMeta.next}`}
          title={`当前主题：${themeMeta.label}，点击切换到${themeMeta.next}`}
        >
          <themeMeta.Icon size={16} />
        </button>
        <div className="brand large">
          <div className="brand-mark">
            <Activity size={26} />
          </div>
          <div>
            <strong>SimpleAPI Manager</strong>
            <span>独立面板服务</span>
          </div>
        </div>

        <div className="form-grid single">
          <label>
            <span>Manager 地址</span>
            <input
              value={panelBase}
              onChange={(event) => setPanelBase(event.target.value)}
              placeholder="留空表示当前页面同源"
            />
          </label>
          <label>
            <span>面板 Admin Key</span>
            <input
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="查看 manager-server 启动日志"
              type="password"
              autoFocus
            />
          </label>
        </div>

        <div className="login-meta">
          <LockKeyhole size={16} />
          <span>{info}</span>
        </div>
        <Notice tone="danger" message={message} onClose={() => setMessage('')} />
        <button className="button button-primary full-width" type="submit" disabled={loading}>
          {loading ? '连接中...' : '进入面板'}
        </button>
      </form>
    </div>
  );
}
