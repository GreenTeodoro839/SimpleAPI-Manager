import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Coins, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { deletePrice, errorMessage, listModels, listPrices, upsertPrice } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { formatCredits } from '@/utils/format';
import type { InternalModel, ModelPrice, RateRule } from '@/types';

type PriceKey =
  | 'input_price'
  | 'output_price'
  | 'cache_read_price'
  | 'cache_creation_price'
  | 'cached_price'
  | 'reasoning_price';

const priceFields: Array<{ key: PriceKey; label: string; hint: string }> = [
  { key: 'input_price', label: '输入（缓存未命中）', hint: 'input_tokens' },
  { key: 'output_price', label: '输出', hint: 'output_tokens' },
  { key: 'cache_read_price', label: '缓存读取（命中）', hint: 'cache_read_tokens' },
  { key: 'cache_creation_price', label: '缓存写入（创建）', hint: 'cache_creation_tokens' },
  { key: 'cached_price', label: '缓存命中（cached）', hint: 'cached_tokens' },
  { key: 'reasoning_price', label: '推理', hint: 'reasoning_tokens' }
];

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']; // index 0 = Sunday

function blankPrice(internalModel: string): ModelPrice {
  return {
    internal_model: internalModel,
    input_price: 0,
    output_price: 0,
    cache_read_price: 0,
    cache_creation_price: 0,
    cached_price: 0,
    reasoning_price: 0,
    rate_rules: []
  };
}

function blankRule(): RateRule {
  return { name: '', weekdays: [], start_hour: 0, end_hour: 24, multiplier: 1 };
}

function cloneRateRules(rules?: RateRule[]): RateRule[] {
  return (rules ?? []).map((rule) => ({ ...rule, weekdays: rule.weekdays ? [...rule.weekdays] : [] }));
}

function isConfigured(price?: ModelPrice) {
  if (!price) return false;
  return (
    price.input_price > 0 ||
    price.output_price > 0 ||
    price.cache_read_price > 0 ||
    price.cache_creation_price > 0 ||
    price.cached_price > 0 ||
    price.reasoning_price > 0
  );
}

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, hour) => hour); // 0..24

export function PricesPage() {
  const session = usePanelSession();
  const [models, setModels] = useState<InternalModel[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, ModelPrice>>({});
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<ModelPrice>(() => blankPrice(''));
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [modelRows, prices] = await Promise.all([listModels(session), listPrices(session)]);
      setModels(modelRows);
      const map: Record<string, ModelPrice> = {};
      prices.forEach((p) => {
        map[p.internal_model] = p;
      });
      setPriceMap(map);
      if (!selected && modelRows[0]) {
        const first = map[modelRows[0].id] ?? blankPrice(modelRows[0].id);
        setSelected(modelRows[0].id);
        setDraft({ ...first, rate_rules: cloneRateRules(first.rate_rules) });
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectModel = (id: string) => {
    setSelected(id);
    const existing = priceMap[id];
    setDraft(
      existing
        ? { ...existing, rate_rules: cloneRateRules(existing.rate_rules) }
        : blankPrice(id)
    );
    setMessage('');
    setSuccess('');
  };

  const patch = (key: PriceKey, value: string) => {
    const numeric = value === '' ? 0 : Number(value);
    setDraft((current) => ({ ...current, [key]: Number.isFinite(numeric) ? numeric : 0 }));
  };

  const addRule = () =>
    setDraft((current) => ({
      ...current,
      rate_rules: [...cloneRateRules(current.rate_rules), blankRule()]
    }));

  const updateRule = (index: number, patchRule: Partial<RateRule>) =>
    setDraft((current) => {
      const rules = cloneRateRules(current.rate_rules);
      rules[index] = { ...rules[index], ...patchRule };
      return { ...current, rate_rules: rules };
    });

  const removeRule = (index: number) =>
    setDraft((current) => ({
      ...current,
      rate_rules: cloneRateRules(current.rate_rules).filter((_, i) => i !== index)
    }));

  const moveRule = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const rules = cloneRateRules(current.rate_rules);
      const target = index + direction;
      if (target < 0 || target >= rules.length) return current;
      [rules[index], rules[target]] = [rules[target], rules[index]];
      return { ...current, rate_rules: rules };
    });

  const toggleWeekday = (index: number, day: number) =>
    setDraft((current) => {
      const rules = cloneRateRules(current.rate_rules);
      const set = new Set(rules[index].weekdays ?? []);
      if (set.has(day)) {
        set.delete(day);
      } else {
        set.add(day);
      }
      rules[index].weekdays = [0, 1, 2, 3, 4, 5, 6].filter((value) => set.has(value));
      return { ...current, rate_rules: rules };
    });

  const configuredCount = useMemo(
    () => models.filter((model) => isConfigured(priceMap[model.id])).length,
    [models, priceMap]
  );

  const rules = draft.rate_rules ?? [];

  const save = async () => {
    setMessage('');
    setSuccess('');
    const payload = { ...draft, internal_model: selected };
    if (!payload.internal_model) {
      setMessage('请先选择一个模型。');
      return;
    }
    try {
      await upsertPrice(session, payload);
      setSuccess(`已保存 ${payload.internal_model} 的价格`);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`删除 ${selected} 的价格（未设置后按 0 计费）？`)) return;
    try {
      await deletePrice(session, selected);
      setSuccess(`已删除 ${selected} 的价格`);
      setDraft(blankPrice(selected));
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>模型价格</h1>
          <p>
            按 provider/aliasA 设置价格，单位 credits / 1M token。未设置的字段按 0 计费。
            已配置 {configuredCount} / {models.length} 个模型。
          </p>
        </div>
        <button className="button button-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />

      <div className="grid sidebar-grid">
        <div className="panel list-panel">
          {models.length === 0 ? (
            <EmptyState title={loading ? '加载模型中' : '暂无模型'} />
          ) : (
            models.map((model) => {
              const price = priceMap[model.id];
              const configured = isConfigured(price);
              const ruleCount = price?.rate_rules?.length ?? 0;
              return (
                <button
                  className={`list-item ${model.id === selected ? 'active' : ''}`}
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                >
                  <strong>{model.id}</strong>
                  {configured ? (
                    <span>
                      in {formatCredits(price?.input_price)} · out {formatCredits(price?.output_price)} · cache{' '}
                      {formatCredits((price?.cache_read_price ?? 0) + (price?.cached_price ?? 0))}
                      {ruleCount > 0 ? ` · ${ruleCount} 条倍率` : ''}
                    </span>
                  ) : (
                    <span className="muted">未设置（按 0 计）</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="panel form-panel">
          <div className="panel-toolbar">
            <h2>
              <Coins size={18} />
              {selected || '选择左侧模型'}
            </h2>
            <div className="actions">
              {selected && isConfigured(priceMap[selected]) && (
                <button className="button button-danger" onClick={remove}>
                  <Trash2 size={16} />
                  删除价格
                </button>
              )}
              <button className="button button-primary" onClick={save} disabled={!selected}>
                <Save size={16} />
                保存
              </button>
            </div>
          </div>

          {!selected ? (
            <EmptyState title="选择左侧模型以设置价格" />
          ) : (
            <>
              <p className="muted">
                价格以 credits / 1M token 记。输入框可填任意精度，存储保留完整浮点数；列表与统计展示按 2 位小数四舍五入。
              </p>
              <div className="form-grid">
                {priceFields.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draft[field.key] === 0 ? '' : draft[field.key]}
                      onChange={(event) => patch(field.key, event.target.value)}
                      placeholder="0"
                    />
                    <span className="muted">credits / 1M token · {field.hint}</span>
                  </label>
                ))}
              </div>

              <div className="subsection">
                <div className="subsection-header">
                  <h3>时段倍率</h3>
                  <button className="button button-ghost" type="button" onClick={addRule}>
                    <Plus size={16} />
                    添加规则
                  </button>
                </div>
                <p className="muted">
                  按列表顺序匹配第一条命中的规则，乘到该请求的费用上；都不命中则用默认倍率 1。不填星期表示每天；
                  时间区间为半开 [起始, 结束)，结束可填 24（=午夜），起始 ≥ 结束 表示跨午夜（如 22 ~ 6）。
                  倍率 <strong>0 = 该时段免费</strong>；留空或未匹配规则按 1 计。时间按容器时区判断（镜像默认北京时间）。
                </p>
                <div className="repeat-list">
                  {rules.length === 0 ? (
                    <EmptyState title="未设置时段倍率（默认 1）" compact />
                  ) : (
                    rules.map((rule, index) => {
                      const weekdays = rule.weekdays ?? [];
                      return (
                        <div className="rate-rule-row" key={`rate-${index}`}>
                          <div className="rate-rule-line">
                            <label>
                              名称
                              <input
                                value={rule.name ?? ''}
                                onChange={(event) => updateRule(index, { name: event.target.value })}
                                placeholder="如：高峰"
                              />
                            </label>
                            <label>
                              起始
                              <select
                                value={rule.start_hour}
                                onChange={(event) => updateRule(index, { start_hour: Number(event.target.value) })}
                              >
                                {HOUR_OPTIONS.slice(0, 24).map((hour) => (
                                  <option key={hour} value={hour}>
                                    {String(hour).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                            </label>
                            <span className="muted">~</span>
                            <label>
                              结束
                              <select
                                value={rule.end_hour}
                                onChange={(event) => updateRule(index, { end_hour: Number(event.target.value) })}
                              >
                                {HOUR_OPTIONS.slice(1).map((hour) => (
                                  <option key={hour} value={hour}>
                                    {String(hour).padStart(2, '0')}:00
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              倍率
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={rule.multiplier}
                                onChange={(event) => {
                                  const n = event.target.value === '' ? 1 : Number(event.target.value);
                                  updateRule(index, { multiplier: Number.isFinite(n) ? n : 1 });
                                }}
                                placeholder="1"
                              />
                              <span className="muted">0 = 免费</span>
                            </label>
                            <div className="row-actions">
                              <button
                                className="icon-button"
                                type="button"
                                title="上移"
                                disabled={index === 0}
                                onClick={() => moveRule(index, -1)}
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                className="icon-button"
                                type="button"
                                title="下移"
                                disabled={index === rules.length - 1}
                                onClick={() => moveRule(index, 1)}
                              >
                                <ArrowDown size={16} />
                              </button>
                              <button
                                className="icon-button"
                                type="button"
                                title="删除"
                                onClick={() => removeRule(index)}
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="weekday-chips">
                            {WEEKDAY_LABELS.map((label, day) => {
                              const checked = weekdays.includes(day);
                              return (
                                <label className={`chip ${checked ? 'checked' : ''}`} key={day}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleWeekday(index, day)}
                                  />
                                  {label}
                                </label>
                              );
                            })}
                            {weekdays.length === 0 && <span className="muted">每天</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
