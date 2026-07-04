import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import {
  createProvider,
  deleteProvider,
  errorMessage,
  listModels,
  listProviders,
  updateProvider
} from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { protocolLabel } from '@/utils/format';
import type { InternalModel, Protocol, Provider, ProviderModel } from '@/types';

const protocols: Protocol[] = ['anthropic', 'openai_completion', 'codex'];

const providerTemplate: Provider = {
  name: '',
  type: 'anthropic',
  url: '',
  key: '',
  headers: {},
  models: []
};

function cloneProvider(provider: Provider = providerTemplate): Provider {
  return {
    name: provider.name,
    type: provider.type,
    url: provider.url,
    key: provider.key ?? '',
    headers: { ...(provider.headers ?? {}) },
    models:
      provider.models?.map((model) => ({
        model: model.model,
        aliasA: model.aliasA ?? '',
        anthropic_web_search_forward: model.anthropic_web_search_forward
          ? { ...model.anthropic_web_search_forward }
          : undefined
      })) ?? []
  };
}

function cleanProvider(provider: Provider): Provider {
  const headers = Object.fromEntries(
    Object.entries(provider.headers ?? {})
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key]) => key)
  );
  const models = (provider.models ?? [])
    .map((model) => ({
      ...model,
      model: model.model.trim(),
      aliasA: model.aliasA?.trim() ?? '',
      anthropic_web_search_forward: model.anthropic_web_search_forward?.enabled
        ? {
            enabled: true,
            target_model: model.anthropic_web_search_forward.target_model?.trim() ?? ''
          }
        : undefined
    }))
    .filter((model) => model.model);

  return {
    name: provider.name.trim(),
    type: provider.type,
    url: provider.url.trim(),
    key: provider.key?.trim() ?? '',
    headers,
    models
  };
}

function providerModelID(providerName: string, model: ProviderModel) {
  const aliasA = (model.aliasA || model.model).trim();
  const name = providerName.trim();
  return name && aliasA ? `${name}/${aliasA}` : '';
}

export function ProvidersPage() {
  const session = usePanelSession();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<InternalModel[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [draft, setDraft] = useState<Provider>(() => cloneProvider());
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const selected = useMemo(
    () => providers.find((item) => item.name === selectedName),
    [providers, selectedName]
  );
  const headerRows = Object.entries(draft.headers ?? {});

  const refresh = async () => {
    const [providerRows, modelRows] = await Promise.all([listProviders(session), listModels(session)]);
    setProviders(providerRows);
    setModels(modelRows);
    if (!selectedName && providerRows[0]) {
      setSelectedName(providerRows[0].name);
      setDraft(cloneProvider(providerRows[0]));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(errorMessage(error)));
  }, []);

  const selectProvider = (provider: Provider) => {
    setSelectedName(provider.name);
    setDraft(cloneProvider(provider));
    setMessage('');
    setSuccess('');
  };

  const newProvider = () => {
    setSelectedName('');
    setDraft(cloneProvider(providerTemplate));
    setMessage('');
    setSuccess('');
  };

  const patchDraft = (patch: Partial<Provider>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const rows = Object.entries(draft.headers ?? {});
    rows[index] = field === 'key' ? [value, rows[index]?.[1] ?? ''] : [rows[index]?.[0] ?? '', value];
    patchDraft({ headers: Object.fromEntries(rows) });
  };

  const addHeader = () => {
    patchDraft({ headers: { ...(draft.headers ?? {}), '': '' } });
  };

  const removeHeader = (index: number) => {
    const rows = Object.entries(draft.headers ?? {});
    rows.splice(index, 1);
    patchDraft({ headers: Object.fromEntries(rows) });
  };

  const updateModel = (index: number, patch: Partial<ProviderModel>) => {
    const next = [...(draft.models ?? [])];
    next[index] = { ...next[index], ...patch };
    patchDraft({ models: next });
  };

  const addModel = () => {
    patchDraft({ models: [...(draft.models ?? []), { model: '', aliasA: '' }] });
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
      const parsed = cleanProvider(draft);
      if (!parsed.name || !parsed.url || (!selected && !parsed.key)) {
        setMessage('Provider name、url、key 都必须填写。');
        return;
      }
      if (parsed.name.includes('/')) {
        setMessage('Provider name 不能包含斜杠 /。');
        return;
      }
      if (Object.values(parsed.headers ?? {}).some((value) => !value)) {
        setMessage('Header 值不能为空。');
        return;
      }
      if (!parsed.models?.length) {
        setMessage('至少需要配置一个上游模型。');
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
      setDraft(cloneProvider(providerTemplate));
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
          <p>通过表单管理上游 provider、headers 和模型。完整 YAML 只在配置中心编辑。</p>
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
      <Notice tone="warning" message="编辑已有 Provider 时，key 留空会交给 SimpleAPI 按不修改处理。" />
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
                  <span>
                    {protocolLabel(provider.type)} · {count} models
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="panel form-panel">
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

          <div className="form-grid">
            <label>
              Provider name
              <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
            </label>
            <label>
              协议
              <select
                value={draft.type}
                onChange={(event) => patchDraft({ type: event.target.value as Protocol })}
              >
                {protocols.map((protocol) => (
                  <option key={protocol} value={protocol}>
                    {protocolLabel(protocol)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Base URL
              <input value={draft.url} onChange={(event) => patchDraft({ url: event.target.value })} />
            </label>
            <label>
              API Key
              <input
                autoComplete="off"
                value={draft.key ?? ''}
                onChange={(event) => patchDraft({ key: event.target.value })}
                placeholder={selected ? '留空不修改' : '保存时必填'}
              />
            </label>
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>Headers</h3>
              <button className="button button-ghost" type="button" onClick={addHeader}>
                <Plus size={16} />
                添加 Header
              </button>
            </div>
            {headerRows.length === 0 ? (
              <EmptyState title="暂无 Header" compact />
            ) : (
              <div className="repeat-list">
                {headerRows.map(([key, value], index) => (
                  <div className="repeat-row two-plus-action" key={`header-${index}`}>
                    <input
                      aria-label="Header name"
                      placeholder="Header"
                      value={key}
                      onChange={(event) => updateHeader(index, 'key', event.target.value)}
                    />
                    <input
                      aria-label="Header value"
                      placeholder="Value"
                      value={value}
                      onChange={(event) => updateHeader(index, 'value', event.target.value)}
                    />
                    <button className="icon-button" type="button" onClick={() => removeHeader(index)}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>上游模型</h3>
              <button className="button button-ghost" type="button" onClick={addModel}>
                <Plus size={16} />
                添加模型
              </button>
            </div>
            <div className="repeat-list">
              {(draft.models ?? []).map((model, index) => {
                const currentInternalID = providerModelID(draft.name, model);
                const targetValue = model.anthropic_web_search_forward?.target_model ?? '';
                const targetChoices = models.filter((item) => item.id !== currentInternalID);
                const targetMissing =
                  targetValue && !targetChoices.some((item) => item.id === targetValue);

                return (
                  <div className="nested-panel" key={`provider-model-${index}`}>
                    <div className="repeat-row two-plus-action">
                      <label>
                        实际模型
                        <input
                          value={model.model}
                          onChange={(event) => updateModel(index, { model: event.target.value })}
                        />
                      </label>
                      <label>
                        aliasA
                        <input
                          value={model.aliasA ?? ''}
                          onChange={(event) => updateModel(index, { aliasA: event.target.value })}
                          placeholder="留空使用实际模型名"
                        />
                      </label>
                      <button className="icon-button" type="button" onClick={() => removeModel(index)}>
                        <X size={16} />
                      </button>
                    </div>
                    {draft.type === 'anthropic' && (
                      <div className="form-grid">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={Boolean(model.anthropic_web_search_forward?.enabled)}
                            onChange={(event) =>
                              updateModel(index, {
                                anthropic_web_search_forward: event.target.checked
                                  ? {
                                      enabled: true,
                                      target_model:
                                        model.anthropic_web_search_forward?.target_model ?? ''
                                    }
                                  : undefined
                              })
                            }
                          />
                          启用 anthropic web_search 转发
                        </label>
                        <label>
                          转发目标内部模型
                          <select
                            disabled={!model.anthropic_web_search_forward?.enabled}
                            value={targetValue}
                            onChange={(event) =>
                              updateModel(index, {
                                anthropic_web_search_forward: {
                                  enabled: true,
                                  target_model: event.target.value
                                }
                              })
                            }
                          >
                            <option value="">选择目标模型</option>
                            {targetMissing && <option value={targetValue}>{targetValue}</option>}
                            {targetChoices.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.id} · {item.upstream_model}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
