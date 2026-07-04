import { useEffect, useState } from 'react';
import YAML from 'yaml';
import { CheckCircle2, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { errorMessage, getConfig, putConfigYaml, reloadConfig, validateConfigYaml } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { CodeEditor } from '@/components/CodeEditor';
import { Notice } from '@/components/Notice';
import type { ValidationError } from '@/types';

export function ConfigPage() {
  const session = usePanelSession();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const refresh = async () => {
    setErrors([]);
    setMessage('');
    try {
      setDraft(YAML.stringify(await getConfig(session)));
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const validate = async () => {
    setErrors([]);
    setSuccess('');
    setMessage('');
    try {
      const result = await validateConfigYaml(session, draft);
      setErrors(result.errors ?? []);
      setSuccess(result.valid ? '配置校验通过' : '');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const save = async () => {
    setErrors([]);
    setSuccess('');
    setMessage('');
    try {
      const result = await putConfigYaml(session, draft);
      setErrors(result.errors ?? []);
      setSuccess(result.valid ? '配置已保存并生效' : '');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const reload = async () => {
    setErrors([]);
    setSuccess('');
    setMessage('');
    try {
      const result = await reloadConfig(session);
      setErrors(result.errors ?? []);
      setSuccess(result.valid ? '已从 SimpleAPI config.yaml 重新加载' : '');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>配置中心</h1>
          <p>完整 config.yaml 编辑。注意 GET 返回的是脱敏配置，保存前请补齐 key 字段。</p>
        </div>
        <div className="actions">
          <button className="button button-ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="button button-ghost" onClick={validate}>
            <CheckCircle2 size={16} />
            校验
          </button>
          <button className="button button-ghost" onClick={reload}>
            <RotateCcw size={16} />
            Reload
          </button>
          <button className="button button-primary" onClick={save}>
            <Save size={16} />
            保存
          </button>
        </div>
      </div>
      <Notice tone="warning" message="SimpleAPI 为安全会脱敏 providers[].key、api_keys[].key 和 management.admin_key；直接保存完整配置前必须补回这些字段。" />
      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />
      {errors.length > 0 && (
        <div className="panel error-list">
          {errors.map((item) => (
            <div key={`${item.path}-${item.code}`}>
              <strong>{item.path}</strong>
              <span>{item.code}</span>
              <p>{item.message}</p>
            </div>
          ))}
        </div>
      )}
      <div className="panel editor-panel">
        <CodeEditor value={draft} onChange={setDraft} minHeight="660px" />
      </div>
    </section>
  );
}
