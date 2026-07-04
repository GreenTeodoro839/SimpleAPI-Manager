import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlugZap } from 'lucide-react';
import { errorMessage, getManagerConfig, setupSimpleAPI } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { Notice } from '@/components/Notice';

export function SetupPage() {
  const session = usePanelSession();
  const navigate = useNavigate();
  const [simpleApiBaseUrl, setSimpleApiBaseUrl] = useState('http://127.0.0.1:8317');
  const [basePath, setBasePath] = useState('/-/api');
  const [managementKey, setManagementKey] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getManagerConfig(session)
      .then((data) => {
        const conn = data.config.simpleApiConnection;
        if (conn.baseUrl) setSimpleApiBaseUrl(conn.baseUrl);
        if (conn.basePath) setBasePath(conn.basePath);
        if (conn.managementKey) setManagementKey(conn.managementKey);
      })
      .catch(() => undefined);
  }, [session]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setSuccess('');
    setSaving(true);
    try {
      await setupSimpleAPI(session, { simpleApiBaseUrl, basePath, managementKey });
      setSuccess('SimpleAPI 连接已保存，后续请求会由 manager-server 代理。');
      window.setTimeout(() => navigate('/', { replace: true }), 600);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page narrow">
      <div className="page-header">
        <div>
          <h1>连接 SimpleAPI</h1>
          <p>浏览器只连接 manager-server；SimpleAPI 管理密钥保存在面板后端。</p>
        </div>
        <PlugZap size={28} />
      </div>
      <form className="panel form-panel" onSubmit={submit}>
        <div className="form-grid single">
          <label>
            <span>SimpleAPI 地址</span>
            <input
              value={simpleApiBaseUrl}
              onChange={(event) => setSimpleApiBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:8317"
            />
          </label>
          <label>
            <span>管理接口 Base Path</span>
            <input value={basePath} onChange={(event) => setBasePath(event.target.value)} />
          </label>
          <label>
            <span>SimpleAPI Admin Key</span>
            <input
              value={managementKey}
              onChange={(event) => setManagementKey(event.target.value)}
              placeholder="对应 SimpleAPI config.yaml 的 management.admin_key"
            />
          </label>
        </div>
        <Notice tone="danger" message={message} onClose={() => setMessage('')} />
        <Notice tone="success" message={success} onClose={() => setSuccess('')} />
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? '验证中...' : '验证并保存'}
        </button>
      </form>
    </section>
  );
}
