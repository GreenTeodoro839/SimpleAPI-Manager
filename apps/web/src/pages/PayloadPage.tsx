import { useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import { Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { errorMessage, getPayload, listModels, putPayloadYaml } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { protocolLabel } from '@/utils/format';
import type {
  InternalModel,
  PayloadConfig,
  PayloadFilterRule,
  PayloadModelRule,
  PayloadRule,
  Protocol
} from '@/types';

type RulePhase = 'default' | 'default-raw' | 'override' | 'override-raw';
type FilterPhase = 'filter';
type Phase = RulePhase | FilterPhase;

interface SelectedRule {
  phase: Phase;
  index: number;
}

const phases: Array<{
  key: Phase;
  label: string;
  description: string;
  filter: boolean;
  raw: boolean;
}> = [
  {
    key: 'default',
    label: 'Default',
    description: '字段不存在时写入普通 YAML/JSON 值',
    filter: false,
    raw: false
  },
  {
    key: 'default-raw',
    label: 'Default Raw',
    description: '字段不存在时写入 JSON 片段字符串',
    filter: false,
    raw: true
  },
  {
    key: 'override',
    label: 'Override',
    description: '总是覆盖为普通 YAML/JSON 值',
    filter: false,
    raw: false
  },
  {
    key: 'override-raw',
    label: 'Override Raw',
    description: '总是覆盖为 JSON 片段字符串',
    filter: false,
    raw: true
  },
  {
    key: 'filter',
    label: 'Filter',
    description: '从最终出站 payload 删除字段路径',
    filter: true,
    raw: false
  }
];

const protocols: Protocol[] = ['anthropic', 'openai_completion', 'codex'];

function getRules(config: PayloadConfig, phase: Phase) {
  return (config[phase] ?? []) as Array<PayloadRule | PayloadFilterRule>;
}

function setRules(config: PayloadConfig, phase: Phase, rules: Array<PayloadRule | PayloadFilterRule>): PayloadConfig {
  return { ...config, [phase]: rules };
}

function createRule(phase: Phase): PayloadRule | PayloadFilterRule {
  if (phase === 'filter') {
    return { models: [{ name: '*' }], params: [] };
  }
  return { models: [{ name: '*' }], params: {} };
}

function serializeValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return YAML.stringify(value).trim();
}

function parseValue(value: string) {
  if (!value.trim()) return '';
  try {
    return YAML.parse(value);
  } catch {
    return value;
  }
}

function cleanRecord(record?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value)
  );
}

function cleanMatchList(rows?: Array<Record<string, unknown>>) {
  return (rows ?? [])
    .map((row) => Object.entries(row)[0])
    .filter((entry): entry is [string, unknown] => Boolean(entry?.[0]?.trim()))
    .map(([key, value]) => ({ [key.trim()]: value }));
}

function cleanMatcher(rule: PayloadModelRule): PayloadModelRule {
  const out: PayloadModelRule = { name: rule.name?.trim() || '*' };
  if (rule.protocol) out.protocol = rule.protocol;
  if (rule['from-protocol']) out['from-protocol'] = rule['from-protocol'];

  const headers = cleanRecord(rule.headers);
  if (Object.keys(headers).length) out.headers = headers;

  const match = cleanMatchList(rule.match);
  if (match.length) out.match = match;

  const notMatch = cleanMatchList(rule['not-match']);
  if (notMatch.length) out['not-match'] = notMatch;

  const exist = (rule.exist ?? []).map((item) => item.trim()).filter(Boolean);
  if (exist.length) out.exist = exist;

  const notExist = (rule['not-exist'] ?? []).map((item) => item.trim()).filter(Boolean);
  if (notExist.length) out['not-exist'] = notExist;

  return out;
}

function cleanPayload(config: PayloadConfig): PayloadConfig {
  const out: PayloadConfig = {};
  for (const phase of phases) {
    const rules = getRules(config, phase.key)
      .map((rule) => {
        const models = (rule.models ?? []).map(cleanMatcher).filter((item) => item.name);
        if (phase.filter) {
          return {
            models: models.length ? models : [{ name: '*' }],
            params: ((rule as PayloadFilterRule).params ?? []).map((item) => item.trim()).filter(Boolean)
          } satisfies PayloadFilterRule;
        }
        return {
          models: models.length ? models : [{ name: '*' }],
          params: Object.fromEntries(
            Object.entries(((rule as PayloadRule).params ?? {}) as Record<string, unknown>).filter(([key]) =>
              key.trim()
            )
          )
        } satisfies PayloadRule;
      })
      .filter((rule) =>
        phase.filter
          ? (rule as PayloadFilterRule).params.length > 0
          : Object.keys((rule as PayloadRule).params).length > 0
      );
    if (rules.length) {
      Object.assign(out, { [phase.key]: rules });
    }
  }
  return out;
}

function modelSummary(rule: PayloadRule | PayloadFilterRule) {
  const names = (rule.models ?? []).map((item) => item.name || '*');
  return names.length ? names.join(', ') : '*';
}

export function PayloadPage() {
  const session = usePanelSession();
  const [payload, setPayload] = useState<PayloadConfig>({});
  const [models, setModels] = useState<InternalModel[]>([]);
  const [selected, setSelected] = useState<SelectedRule | null>(null);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMeta = useMemo(
    () => phases.find((phase) => phase.key === selected?.phase),
    [selected?.phase]
  );
  const selectedRule = selected ? getRules(payload, selected.phase)[selected.index] : undefined;

  const refresh = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [nextPayload, modelRows] = await Promise.all([getPayload(session), listModels(session)]);
      setPayload(nextPayload ?? {});
      setModels(modelRows);
      const firstPhase = phases.find((phase) => getRules(nextPayload ?? {}, phase.key).length > 0);
      setSelected(firstPhase ? { phase: firstPhase.key, index: 0 } : null);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const updateSelectedRule = (updater: (rule: PayloadRule | PayloadFilterRule) => PayloadRule | PayloadFilterRule) => {
    if (!selected) return;
    setPayload((current) => {
      const rules = [...getRules(current, selected.phase)];
      rules[selected.index] = updater(rules[selected.index] ?? createRule(selected.phase));
      return setRules(current, selected.phase, rules);
    });
  };

  const addRule = (phase: Phase) => {
    setPayload((current) => {
      const rules = [...getRules(current, phase), createRule(phase)];
      setSelected({ phase, index: rules.length - 1 });
      return setRules(current, phase, rules);
    });
  };

  const removeRule = () => {
    if (!selected || !selectedRule) return;
    setPayload((current) => {
      const rules = [...getRules(current, selected.phase)];
      rules.splice(selected.index, 1);
      setSelected(rules.length ? { phase: selected.phase, index: Math.max(0, selected.index - 1) } : null);
      return setRules(current, selected.phase, rules);
    });
  };

  const updateMatcher = (index: number, patch: Partial<PayloadModelRule>) => {
    updateSelectedRule((rule) => {
      const modelsNext = [...(rule.models ?? [])];
      modelsNext[index] = { ...modelsNext[index], ...patch };
      return { ...rule, models: modelsNext };
    });
  };

  const addMatcher = () => {
    updateSelectedRule((rule) => ({ ...rule, models: [...(rule.models ?? []), { name: '*' }] }));
  };

  const removeMatcher = (index: number) => {
    updateSelectedRule((rule) => {
      const next = [...(rule.models ?? [])];
      next.splice(index, 1);
      return { ...rule, models: next.length ? next : [{ name: '*' }] };
    });
  };

  const updateMatcherHeader = (matcherIndex: number, headerIndex: number, field: 'key' | 'value', value: string) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = Object.entries(matcher?.headers ?? {});
    rows[headerIndex] =
      field === 'key' ? [value, rows[headerIndex]?.[1] ?? ''] : [rows[headerIndex]?.[0] ?? '', value];
    updateMatcher(matcherIndex, { headers: Object.fromEntries(rows) });
  };

  const addMatcherHeader = (matcherIndex: number) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    updateMatcher(matcherIndex, { headers: { ...(matcher?.headers ?? {}), '': '' } });
  };

  const removeMatcherHeader = (matcherIndex: number, headerIndex: number) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = Object.entries(matcher?.headers ?? {});
    rows.splice(headerIndex, 1);
    updateMatcher(matcherIndex, { headers: Object.fromEntries(rows) });
  };

  const updateMatchEntry = (
    matcherIndex: number,
    listName: 'match' | 'not-match',
    rowIndex: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = [...((matcher?.[listName] ?? []) as Array<Record<string, unknown>>)];
    const current = Object.entries(rows[rowIndex] ?? {})[0] ?? ['', ''];
    rows[rowIndex] =
      field === 'key' ? { [value]: current[1] } : { [current[0]]: parseValue(value) };
    updateMatcher(matcherIndex, { [listName]: rows });
  };

  const addMatchEntry = (matcherIndex: number, listName: 'match' | 'not-match') => {
    const matcher = selectedRule?.models?.[matcherIndex];
    updateMatcher(matcherIndex, { [listName]: [...((matcher?.[listName] ?? []) as Array<Record<string, unknown>>), { '': '' }] });
  };

  const removeMatchEntry = (matcherIndex: number, listName: 'match' | 'not-match', rowIndex: number) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = [...((matcher?.[listName] ?? []) as Array<Record<string, unknown>>)];
    rows.splice(rowIndex, 1);
    updateMatcher(matcherIndex, { [listName]: rows });
  };

  const updatePathList = (
    matcherIndex: number,
    field: 'exist' | 'not-exist',
    rowIndex: number,
    value: string
  ) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = [...((matcher?.[field] ?? []) as string[])];
    rows[rowIndex] = value;
    updateMatcher(matcherIndex, { [field]: rows });
  };

  const addPath = (matcherIndex: number, field: 'exist' | 'not-exist') => {
    const matcher = selectedRule?.models?.[matcherIndex];
    updateMatcher(matcherIndex, { [field]: [...((matcher?.[field] ?? []) as string[]), ''] });
  };

  const removePath = (matcherIndex: number, field: 'exist' | 'not-exist', rowIndex: number) => {
    const matcher = selectedRule?.models?.[matcherIndex];
    const rows = [...((matcher?.[field] ?? []) as string[])];
    rows.splice(rowIndex, 1);
    updateMatcher(matcherIndex, { [field]: rows });
  };

  const updateParam = (index: number, field: 'key' | 'value', value: string) => {
    if (!selectedMeta || !selectedRule || selectedMeta.filter) return;
    const rows = Object.entries(((selectedRule as PayloadRule).params ?? {}) as Record<string, unknown>);
    rows[index] =
      field === 'key' ? [value, rows[index]?.[1] ?? ''] : [rows[index]?.[0] ?? '', selectedMeta.raw ? value : parseValue(value)];
    updateSelectedRule((rule) => ({
      ...rule,
      params: Object.fromEntries(rows)
    }));
  };

  const addParam = () => {
    if (!selectedMeta?.filter) {
      updateSelectedRule((rule) => ({ ...rule, params: { ...((rule as PayloadRule).params ?? {}), '': '' } }));
    }
  };

  const removeParam = (index: number) => {
    if (!selectedMeta || !selectedRule || selectedMeta.filter) return;
    const rows = Object.entries(((selectedRule as PayloadRule).params ?? {}) as Record<string, unknown>);
    rows.splice(index, 1);
    updateSelectedRule((rule) => ({ ...rule, params: Object.fromEntries(rows) }));
  };

  const updateFilterPath = (index: number, value: string) => {
    const rows = [...(((selectedRule as PayloadFilterRule | undefined)?.params ?? []) as string[])];
    rows[index] = value;
    updateSelectedRule((rule) => ({ ...rule, params: rows }));
  };

  const addFilterPath = () => {
    updateSelectedRule((rule) => ({ ...rule, params: [...(((rule as PayloadFilterRule).params ?? []) as string[]), ''] }));
  };

  const removeFilterPath = (index: number) => {
    const rows = [...(((selectedRule as PayloadFilterRule | undefined)?.params ?? []) as string[])];
    rows.splice(index, 1);
    updateSelectedRule((rule) => ({ ...rule, params: rows }));
  };

  const save = async () => {
    setMessage('');
    setSuccess('');
    try {
      await putPayloadYaml(session, YAML.stringify(cleanPayload(payload)));
      setSuccess('Payload 规则已保存');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const paramRows =
    selectedRule && selectedMeta && !selectedMeta.filter
      ? Object.entries(((selectedRule as PayloadRule).params ?? {}) as Record<string, unknown>)
      : [];
  const filterRows =
    selectedRule && selectedMeta?.filter ? (((selectedRule as PayloadFilterRule).params ?? []) as string[]) : [];

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Payload 规则</h1>
          <p>用交互式规则编辑 default、override 和 filter；完整 YAML 只保留在配置中心。</p>
        </div>
        <div className="actions">
          <button className="button button-ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="button button-primary" onClick={save}>
            <Save size={16} />
            保存
          </button>
        </div>
      </div>
      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />
      <div className="grid sidebar-grid">
        <div className="panel list-panel">
          {phases.map((phase) => {
            const rules = getRules(payload, phase.key);
            return (
              <div className="payload-phase" key={phase.key}>
                <div className="payload-phase-header">
                  <div>
                    <strong>{phase.label}</strong>
                    <span>{rules.length} rules</span>
                  </div>
                  <button className="icon-button" type="button" onClick={() => addRule(phase.key)}>
                    <Plus size={16} />
                  </button>
                </div>
                {rules.map((rule, index) => (
                  <button
                    className={`list-item ${selected?.phase === phase.key && selected.index === index ? 'active' : ''}`}
                    key={`${phase.key}-${index}`}
                    onClick={() => setSelected({ phase: phase.key, index })}
                  >
                    <strong>{phase.label} #{index + 1}</strong>
                    <span>{modelSummary(rule)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="panel form-panel">
          {!selected || !selectedRule || !selectedMeta ? (
            <EmptyState title="选择或新增一条 Payload 规则" />
          ) : (
            <>
              <div className="panel-toolbar">
                <div>
                  <h2>
                    {selectedMeta.label} #{selected.index + 1}
                  </h2>
                  <p className="muted">{selectedMeta.description}</p>
                </div>
                <button className="button button-danger" onClick={removeRule}>
                  <Trash2 size={16} />
                  删除规则
                </button>
              </div>

              <div className="subsection">
                <div className="subsection-header">
                  <h3>匹配模型</h3>
                  <button className="button button-ghost" type="button" onClick={addMatcher}>
                    <Plus size={16} />
                    添加匹配器
                  </button>
                </div>
                <datalist id="payload-model-options">
                  <option value="*" />
                  {models.map((model) => (
                    <option key={model.id} value={model.id} />
                  ))}
                </datalist>
                <div className="repeat-list">
                  {(selectedRule.models ?? []).map((matcher, matcherIndex) => (
                    <div className="nested-panel" key={`matcher-${matcherIndex}`}>
                      <div className="repeat-row matcher-main-row">
                        <label>
                          模型
                          <input
                            list="payload-model-options"
                            value={matcher.name ?? '*'}
                            onChange={(event) => updateMatcher(matcherIndex, { name: event.target.value })}
                          />
                        </label>
                        <label>
                          目标协议
                          <select
                            value={matcher.protocol ?? ''}
                            onChange={(event) =>
                              updateMatcher(matcherIndex, { protocol: event.target.value as Protocol })
                            }
                          >
                            <option value="">不限</option>
                            {protocols.map((protocol) => (
                              <option key={protocol} value={protocol}>
                                {protocolLabel(protocol)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          来源协议
                          <select
                            value={matcher['from-protocol'] ?? ''}
                            onChange={(event) =>
                              updateMatcher(matcherIndex, { 'from-protocol': event.target.value as Protocol })
                            }
                          >
                            <option value="">不限</option>
                            {protocols.map((protocol) => (
                              <option key={protocol} value={protocol}>
                                {protocolLabel(protocol)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="icon-button" type="button" onClick={() => removeMatcher(matcherIndex)}>
                          <X size={16} />
                        </button>
                      </div>

                      <div className="mini-grid">
                        <ConditionList
                          title="Headers"
                          rows={Object.entries(matcher.headers ?? {}).map(([key, value]) => [key, value])}
                          valuePlaceholder="Header value"
                          onAdd={() => addMatcherHeader(matcherIndex)}
                          onRemove={(rowIndex) => removeMatcherHeader(matcherIndex, rowIndex)}
                          onChange={(rowIndex, field, value) =>
                            updateMatcherHeader(matcherIndex, rowIndex, field, value)
                          }
                        />
                        <ConditionList
                          title="match"
                          rows={((matcher.match ?? []) as Array<Record<string, unknown>>).map((row) => {
                            const entry = Object.entries(row)[0] ?? ['', ''];
                            return [entry[0], serializeValue(entry[1])];
                          })}
                          valuePlaceholder="YAML value"
                          onAdd={() => addMatchEntry(matcherIndex, 'match')}
                          onRemove={(rowIndex) => removeMatchEntry(matcherIndex, 'match', rowIndex)}
                          onChange={(rowIndex, field, value) =>
                            updateMatchEntry(matcherIndex, 'match', rowIndex, field, value)
                          }
                        />
                        <ConditionList
                          title="not-match"
                          rows={((matcher['not-match'] ?? []) as Array<Record<string, unknown>>).map((row) => {
                            const entry = Object.entries(row)[0] ?? ['', ''];
                            return [entry[0], serializeValue(entry[1])];
                          })}
                          valuePlaceholder="YAML value"
                          onAdd={() => addMatchEntry(matcherIndex, 'not-match')}
                          onRemove={(rowIndex) => removeMatchEntry(matcherIndex, 'not-match', rowIndex)}
                          onChange={(rowIndex, field, value) =>
                            updateMatchEntry(matcherIndex, 'not-match', rowIndex, field, value)
                          }
                        />
                        <PathList
                          title="exist"
                          rows={matcher.exist ?? []}
                          onAdd={() => addPath(matcherIndex, 'exist')}
                          onRemove={(rowIndex) => removePath(matcherIndex, 'exist', rowIndex)}
                          onChange={(rowIndex, value) => updatePathList(matcherIndex, 'exist', rowIndex, value)}
                        />
                        <PathList
                          title="not-exist"
                          rows={matcher['not-exist'] ?? []}
                          onAdd={() => addPath(matcherIndex, 'not-exist')}
                          onRemove={(rowIndex) => removePath(matcherIndex, 'not-exist', rowIndex)}
                          onChange={(rowIndex, value) => updatePathList(matcherIndex, 'not-exist', rowIndex, value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="subsection">
                <div className="subsection-header">
                  <h3>{selectedMeta.filter ? '删除路径' : '写入参数'}</h3>
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={selectedMeta.filter ? addFilterPath : addParam}
                  >
                    <Plus size={16} />
                    添加
                  </button>
                </div>
                {selectedMeta.filter ? (
                  <PathList
                    title="filter params"
                    rows={filterRows}
                    onAdd={addFilterPath}
                    onRemove={removeFilterPath}
                    onChange={updateFilterPath}
                  />
                ) : (
                  <ConditionList
                    title={selectedMeta.raw ? 'JSON fragment params' : 'YAML params'}
                    rows={paramRows.map(([key, value]) => [key, serializeValue(value)])}
                    valuePlaceholder={selectedMeta.raw ? '{"type":"json_object"}' : 'YAML value'}
                    onAdd={addParam}
                    onRemove={removeParam}
                    onChange={updateParam}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ConditionList({
  title,
  rows,
  valuePlaceholder,
  onAdd,
  onRemove,
  onChange
}: {
  title: string;
  rows: Array<[string, string]>;
  valuePlaceholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
}) {
  return (
    <div className="condition-box">
      <div className="condition-title">
        <span>{title}</span>
        <button className="icon-button" type="button" onClick={onAdd}>
          <Plus size={14} />
        </button>
      </div>
      {rows.length === 0 ? (
        <span className="muted">未设置</span>
      ) : (
        <div className="repeat-list compact">
          {rows.map(([key, value], index) => (
            <div className="repeat-row condition-row" key={`${title}-${index}`}>
              <input
                aria-label={`${title} key`}
                placeholder="Path / key"
                value={key}
                onChange={(event) => onChange(index, 'key', event.target.value)}
              />
              <input
                aria-label={`${title} value`}
                placeholder={valuePlaceholder}
                value={value}
                onChange={(event) => onChange(index, 'value', event.target.value)}
              />
              <button className="icon-button" type="button" onClick={() => onRemove(index)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PathList({
  title,
  rows,
  onAdd,
  onRemove,
  onChange
}: {
  title: string;
  rows: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="condition-box">
      <div className="condition-title">
        <span>{title}</span>
        <button className="icon-button" type="button" onClick={onAdd}>
          <Plus size={14} />
        </button>
      </div>
      {rows.length === 0 ? (
        <span className="muted">未设置</span>
      ) : (
        <div className="repeat-list compact">
          {rows.map((value, index) => (
            <div className="repeat-row path-row" key={`${title}-${index}`}>
              <input
                aria-label={`${title} path`}
                placeholder="metadata.client_debug"
                value={value}
                onChange={(event) => onChange(index, event.target.value)}
              />
              <button className="icon-button" type="button" onClick={() => onRemove(index)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
