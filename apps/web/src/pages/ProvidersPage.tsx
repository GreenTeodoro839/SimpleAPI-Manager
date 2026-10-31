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

const protocolUrlPlaceholders: Record<Protocol, string> = {
  anthropic: 'https://relay.example.com/anthropic',
  openai_completion: 'https://relay.example.com/openai/v1',
  codex: 'https://relay.example.com/codex/v1'
};

const protocolUrlHints: Record<Protocol, string> = {
  anthropic: '不含 /v1 的 base，自动追加 /v1/messages。',
  openai_completion: '含 /v1 的 base，自动追加 /chat/completions。',
  codex: '含 /v1 的 base，自动追加 /responses。'
};

const providerTemplate: Provider = {
  name: '',
  type: 'anthropic',
  url: '',
  key: '',
  headers: {},
  max_concurrency: 0,
  models: []
};

// Normalize urls into a full three-key record so the form inputs are always
// controlled; empty string means "not configured", same as SimpleAPI.
function protocolUrls(provider: Provider): Record<Protocol, string> {
  return {
    anthropic: provider.urls?.anthropic ?? '',
    openai_completion: provider.urls?.openai_completion ?? '',
    codex: provider.urls?.codex ?? ''
  };
}

function hasProtocolUrls(provider: Provider): boolean {
  return Object.values(provider.urls ?? {}).some((value) => (value ?? '').trim() !== '');
}

function cloneProvider(provider: Provider = providerTemplate): Provider {
  return {
    name: provider.name,
    type: provider.type,
    url: provider.url,
    urls: protocolUrls(provider),
    key: provider.key ?? '',
    headers: { ...(provider.headers ?? {}) },
    max_concurrency: provider.max_concurrency ?? 0,
    models: provider.models?.map((model) => ({
      model: model.model,
      aliasA: model.aliasA ?? ''
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
      aliasA: model.aliasA?.trim() ?? ''
    }))
    .filter((model) => model.model);

  const cleaned: Provider = {
    name: provider.name.trim(),
    type: provider.type,
    url: provider.url.trim(),
    key: provider.key?.trim() ?? '',
    headers,
    models
  };
  // 0 is SimpleAPI's "unlimited", which is also what a missing field means --
  // so leave it out entirely and keep config.yaml free of no-op keys.
  const limit = Math.max(0, Math.trunc(provider.max_concurrency ?? 0));
  if (limit > 0) cleaned.max_concurrency = limit;
  const urls = Object.fromEntries(
    Object.entries(provider.urls ?? {})
      .map(([protocol, value]) => [protocol, (value ?? '').trim()])
      .filter(([, value]) => value)
  ) as Partial<Record<Protocol, string>>;
  if (Object.keys(urls).length > 0) cleaned.urls = urls;
  return cleaned;
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

  const updateProtocolUrl = (protocol: Protocol, value: string) => {
    patchDraft({ urls: { ...(draft.urls ?? {}), [protocol]: value } });
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
      if (!parsed.name) {
        setMessage('Provider name 必须填写。');
        return;
      }
      // SimpleAPI requires a default upstream: url or urls[type] (the latter wins).
      if (!parsed.url && !parsed.urls?.[parsed.type]) {
        setMessage(
          `默认上游缺少地址：请填写 Base URL，或填写「${protocolLabel(parsed.type)}」协议的独立地址。`
        );
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
      <Notice tone="warning" message="Provider key 会按 SimpleAPI API 返回值明文显示，保存时会随配置一起提交。" />
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
                    {provider.max_concurrency ? ` · 并发 ${provider.max_concurrency}` : ''}
                    {hasProtocolUrls(provider) ? ' · 多协议' : ''}
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
              <span className="muted">转译目标：请求协议没有独立地址时，转译到该协议的默认上游。</span>
            </label>
            <label>
              默认 Base URL
              <input value={draft.url} onChange={(event) => patchDraft({ url: event.target.value })} />
              <span className="muted">
                转译用默认上游，与「各协议独立地址」中所选协议的地址至少填一个，独立地址优先。
              </span>
            </label>
            <label>
              API Key
              <input
                autoComplete="off"
                value={draft.key ?? ''}
                onChange={(event) => patchDraft({ key: event.target.value })}
                placeholder="选填"
              />
            </label>
            <label>
              最大并发
              <input
                type="number"
                min={0}
                step={1}
                value={draft.max_concurrency ?? 0}
                onChange={(event) =>
                  patchDraft({ max_concurrency: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })
                }
              />
              <span className="muted">
                同时进行的上游请求数，0 = 不限制。超出时先改走下一个候选 provider，全都满载才返回 529 服务器忙。
              </span>
            </label>
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>各协议独立地址</h3>
            </div>
            <p className="muted">
              选填。同协议请求优先直传对应地址，保留协议原生字段；留空的协议转译到默认上游。
              各地址共用 key、headers、模型表和并发额度，直传失败不会改走转译。
            </p>
            <div className="repeat-list">
              {protocols.map((protocol) => (
                <label key={`provider-url-${protocol}`}>
                  {protocolLabel(protocol)}
                  <input
                    autoComplete="off"
                    placeholder={protocolUrlPlaceholders[protocol]}
                    value={draft.urls?.[protocol] ?? ''}
                    onChange={(event) => updateProtocolUrl(protocol, event.target.value)}
                  />
                  <span className="muted">{protocolUrlHints[protocol]}</span>
                </label>
              ))}
            </div>
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
              {(draft.models ?? []).map((model, index) => (
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
