import { useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { createApiKey, deleteApiKey, errorMessage, listApiKeys, updateApiKey } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { CodeEditor } from '@/components/CodeEditor';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import type { ClientApiKey } from '@/types';

const keyTemplate: ClientApiKey = {
  name: 'new-client',
  key: '',
  allowed_protocols: ['anthropic', 'openai_completion', 'codex'],
  models: [{ model: 'provider_aliasA', aliasB: 'client-model', priority: 0 }]
};

export function ApiKeysPage() {
  const session = usePanelSession();
  const [items, setItems] = useState<ClientApiKey[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [draft, setDraft] = useState(YAML.stringify(keyTemplate));
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const selected = useMemo(() => items.find((item) => item.name === selectedName), [items, selectedName]);

  const refresh = async () => {
    const rows = await listApiKeys(session);
    setItems(rows);
    if (!selectedName && rows[0]) {
      setSelectedName(rows[0].name);
      setDraft(YAML.stringify(rows[0]));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(errorMessage(error)));
  }, []);

  const save = async () => {
    setMessage('');
    setSuccess('');
    try {
      const parsed = YAML.parse(draft) as ClientApiKey;
      if (!parsed.key) {
        setMessage('API key 必须填写；管理接口返回的是脱敏配置，保存已有 key 时也需要重新输入 key。');
        return;
      }
      if (selected) {
        await updateApiKey(session, selected.name, parsed);
      } else {
        await createApiKey(session, parsed);
      }
      setSelectedName(parsed.name);
      setSuccess('API key 已保存');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`删除 API key ${selected.name}?`)) return;
    try {
      await deleteApiKey(session, selected.name);
      setSelectedName('');
      setDraft(YAML.stringify(keyTemplate));
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>API Keys</h1>
          <p>按入站 API key 管理可用协议、模型 aliasB 和优先级。</p>
        </div>
        <div className="actions">
          <button className="button button-ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            className="button button-primary"
            onClick={() => {
              setSelectedName('');
              setDraft(YAML.stringify(keyTemplate));
            }}
          >
            <Plus size={16} />
            新增
          </button>
        </div>
      </div>
      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />
      <div className="grid sidebar-grid">
        <div className="panel list-panel">
          {items.length === 0 ? (
            <EmptyState title="暂无 API key" />
          ) : (
            items.map((item) => (
              <button
                className={`list-item ${item.name === selectedName ? 'active' : ''}`}
                key={item.name}
                onClick={() => {
                  setSelectedName(item.name);
                  setDraft(YAML.stringify(item));
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.allowed_protocols.join(', ')} · {item.models.length} models</span>
              </button>
            ))
          )}
        </div>
        <div className="panel editor-panel">
          <div className="panel-toolbar">
            <h2>{selected ? selected.name : '新增 API key'}</h2>
            <div className="actions">
              {selected && (
                <button className="button button-danger" onClick={remove}>
                  <Trash2 size={16} />
                  删除
                </button>
              )}
              <button className="button button-primary" onClick={save}>
                <Save size={16} />
                保存
              </button>
            </div>
          </div>
          <CodeEditor value={draft} onChange={setDraft} />
        </div>
      </div>
    </section>
  );
}
