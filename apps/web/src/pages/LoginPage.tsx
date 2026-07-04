import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, LockKeyhole } from 'lucide-react';
import { errorMessage, getInfo, getManagerConfig } from '@/api/managerApi';
import { useSessionStore } from '@/store/session';
import { Notice } from '@/components/Notice';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const storedPanelBase = useSessionStore((state) => state.panelBase);
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

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={submit}>
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
