import { useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { createProvider, deleteProvider, errorMessage, listModels, listProviders, updateProvider } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { CodeEditor } from '@/components/CodeEditor';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { protocolLabel } from '@/utils/format';
import type { InternalModel, Provider } from '@/types';

const providerTemplate: Provider = {
  name: 'new-provider',
  type: 'anthropic',
  url: 'https://api.anthropic.com',
  key: '',
  headers: {
    'anthropic-version': '2023-06-01'
  },
  models: [{ model: 'claude-sonnet-4-20250514', aliasA: 'sonnet4' }]
};

export function ProvidersPage() {
  const session = usePanelSession();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<InternalModel[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [draft, setDraft] = useState(YAML.stringify(providerTemplate));
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const selected = useMemo(() => providers.find((item) => item.name === selectedName), [providers, selectedName]);

  const refresh = async () => {
    const [providerRows, modelRows] = await Promise.all([listProviders(session), listModels(session)]);
    setProviders(providerRows);
    setModels(modelRows);
    if (!selectedName && providerRows[0]) {
      setSelectedName(providerRows[0].name);
      setDraft(YAML.stringify(providerRows[0]));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(errorMessage(error)));
  }, []);

  const selectProvider = (provider: Provider) => {
    setSelectedName(provider.name);
    setDraft(YAML.stringify(provider));
    setMessage('');
    setSuccess('');
  };

  const newProvider = () => {
    setSelectedName('');
    setDraft(YAML.stringify(providerTemplate));
  };

  const save = async () => {
    setMessage('');
    setSuccess('');
    try {
      const parsed = YAML.parse(draft) as Provider;
      if (!parsed.key) {
        setMessage('Provider key 必须填写；管理接口返回的是脱敏配置，保存已有 Provider 时也需要重新输入 key。');
        return;
      }
      if (selected) {
        await updateProvider(session, selected.name, parsed);
      } else {
        await createProvider(session, parsed);
      }
      setSuccess('Provider 已保存');
      setSelectedName(parsed.name);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`删除 Provider ${selected.name}?`)) return;
    try {
      await deleteProvider(session, selected.name);
      setSelectedName('');
      setDraft(YAML.stringify(providerTemplate));
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>提供商</h1>
          <p>管理 SimpleAPI 上游 provider。Provider name 不能包含下划线。</p>
        </div>
        <div className="actions">
          <button className="button button-ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="button button-primary" onClick={newProvider}>
            <Plus size={16} />
            新增
          </button>
        </div>
      </div>
      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />
      <div className="grid sidebar-grid">
        <div className="panel list-panel">
          {providers.length === 0 ? (
            <EmptyState title="暂无 Provider" />
          ) : (
            providers.map((provider) => {
              const count = models.filter((model) => model.provider === provider.name).length;
              return (
                <button
                  className={`list-item ${provider.name === selectedName ? 'active' : ''}`}
                  key={provider.name}
                  onClick={() => selectProvider(provider)}
                >
                  <strong>{provider.name}</strong>
                  <span>{protocolLabel(provider.type)} · {count} models</span>
                </button>
              );
            })
          )}
        </div>
        <div className="panel editor-panel">
          <div className="panel-toolbar">
            <h2>{selected ? selected.name : '新增 Provider'}</h2>
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
