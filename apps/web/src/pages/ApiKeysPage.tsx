import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  createApiKey,
  deleteApiKey,
  errorMessage,
  listApiKeys,
  listModels,
  updateApiKey
} from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { protocolLabel } from '@/utils/format';
import type { ClientApiKey, ClientModel, InternalModel, Protocol } from '@/types';

const protocols: Protocol[] = ['anthropic', 'openai_completion', 'codex'];

const keyTemplate: ClientApiKey = {
  name: 'new-client',
  key: '',
  allowed_protocols: ['anthropic', 'openai_completion', 'codex'],
  models: [{ model: '', aliasB: '', priority: 0 }]
};

function cloneApiKey(item: ClientApiKey = keyTemplate): ClientApiKey {
  return {
    name: item.name,
    key: '',
    allowed_protocols: [...(item.allowed_protocols ?? [])],
    models:
      item.models?.map((model) => ({
        model: model.model,
        aliasB: model.aliasB ?? '',
        priority: model.priority ?? 0
      })) ?? []
  };
}

function cleanApiKey(item: ClientApiKey): ClientApiKey {
  return {
    name: item.name.trim(),
    key: item.key.trim(),
    allowed_protocols: item.allowed_protocols ?? [],
    models: (item.models ?? [])
      .map((model) => ({
        model: model.model.trim(),
        aliasB: model.aliasB?.trim() ?? '',
        priority: Number.isFinite(Number(model.priority)) ? Number(model.priority) : 0
      }))
      .filter((model) => model.model)
  };
}

function modelLabel(model: InternalModel) {
  return `${model.id} · ${model.upstream_model}`;
}

export function ApiKeysPage() {
  const session = usePanelSession();
  const [items, setItems] = useState<ClientApiKey[]>([]);
  const [models, setModels] = useState<InternalModel[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [draft, setDraft] = useState<ClientApiKey>(() => cloneApiKey());
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const selected = useMemo(() => items.find((item) => item.name === selectedName), [items, selectedName]);

  const refresh = async () => {
    const [rows, modelRows] = await Promise.all([listApiKeys(session), listModels(session)]);
    setItems(rows);
    setModels(modelRows);
    if (!selectedName && rows[0]) {
      setSelectedName(rows[0].name);
      setDraft(cloneApiKey(rows[0]));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(errorMessage(error)));
  }, []);

  const patchDraft = (patch: Partial<ClientApiKey>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const toggleProtocol = (protocol: Protocol) => {
    const current = new Set(draft.allowed_protocols ?? []);
    if (current.has(protocol)) {
      current.delete(protocol);
    } else {
      current.add(protocol);
    }
    patchDraft({ allowed_protocols: protocols.filter((item) => current.has(item)) });
  };

  const updateModel = (index: number, patch: Partial<ClientModel>) => {
    const next = [...(draft.models ?? [])];
    next[index] = { ...next[index], ...patch };
    patchDraft({ models: next });
  };

  const addModel = () => {
    patchDraft({ models: [...(draft.models ?? []), { model: '', aliasB: '', priority: 0 }] });
  };

  const removeModel = (index: number) => {
    const next = [...(draft.models ?? [])];
    next.splice(index, 1);
    patchDraft({ models: next });
  };

  const save = async () => {
    setMessage('');
    setSuccess('');
    try {
      const parsed = cleanApiKey(draft);
      if (!parsed.name || !parsed.key) {
        setMessage('API key name 和 key 都必须填写。');
        return;
      }
      if (!parsed.allowed_protocols.length) {
        setMessage('至少需要允许一个入站协议。');
        return;
      }
      if (!parsed.models.length) {
        setMessage('至少需要授权一个模型。');
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
      setDraft(cloneApiKey(keyTemplate));
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
          <p>用表单配置入站 key、允许协议、aliasB 和 failover 优先级。</p>
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
              setDraft(cloneApiKey(keyTemplate));
            }}
          >
            <Plus size={16} />
            新增
          </button>
        </div>
      </div>
      <Notice tone="warning" message="API key 会被 SimpleAPI 脱敏返回；编辑已有 key 并保存时，需要重新填写 key。" />
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
                  setDraft(cloneApiKey(item));
                }}
              >
                <strong>{item.name}</strong>
                <span>
                  {item.allowed_protocols.join(', ')} · {item.models.length} models
                </span>
              </button>
            ))
          )}
        </div>
        <div className="panel form-panel">
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

          <div className="form-grid">
            <label>
              名称
              <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
            </label>
            <label>
              Key
              <input
                autoComplete="off"
                value={draft.key}
                onChange={(event) => patchDraft({ key: event.target.value })}
                placeholder="保存时必填"
              />
            </label>
          </div>

          <div className="subsection">
            <h3>允许协议</h3>
            <div className="checkbox-grid">
              {protocols.map((protocol) => (
                <label className="checkbox-row" key={protocol}>
                  <input
                    type="checkbox"
                    checked={draft.allowed_protocols.includes(protocol)}
                    onChange={() => toggleProtocol(protocol)}
                  />
                  {protocolLabel(protocol)}
                </label>
              ))}
            </div>
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>授权模型</h3>
              <button className="button button-ghost" type="button" onClick={addModel}>
                <Plus size={16} />
                添加模型
              </button>
            </div>
            <div className="repeat-list">
              {(draft.models ?? []).map((model, index) => (
                <div className="repeat-row model-auth-row" key={`client-model-${index}`}>
                  <label>
                    内部模型
                    <select
                      value={model.model}
                      onChange={(event) => updateModel(index, { model: event.target.value })}
                    >
                      <option value="">选择 provider/aliasA</option>
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {modelLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    aliasB
                    <input
                      value={model.aliasB ?? ''}
                      onChange={(event) => updateModel(index, { aliasB: event.target.value })}
                      placeholder="留空使用 aliasA"
                    />
                  </label>
                  <label>
                    优先级
                    <input
                      type="number"
                      value={model.priority ?? 0}
                      onChange={(event) => updateModel(index, { priority: Number(event.target.value) })}
                    />
                  </label>
                  <button className="icon-button" type="button" onClick={() => removeModel(index)}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
