import { useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, Save, Trash2 } from 'lucide-react';
import { deletePrice, errorMessage, listModels, listPrices, upsertPrice } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { formatCredits } from '@/utils/format';
import type { InternalModel, ModelPrice } from '@/types';

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

function blankPrice(internalModel: string): ModelPrice {
  return {
    internal_model: internalModel,
    input_price: 0,
    output_price: 0,
    cache_read_price: 0,
    cache_creation_price: 0,
    cached_price: 0,
    reasoning_price: 0
  };
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
        setSelected(modelRows[0].id);
        setDraft(map[modelRows[0].id] ?? blankPrice(modelRows[0].id));
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
    setDraft(priceMap[id] ? { ...priceMap[id] } : blankPrice(id));
    setMessage('');
    setSuccess('');
  };

  const patch = (key: PriceKey, value: string) => {
    const numeric = value === '' ? 0 : Number(value);
    setDraft((current) => ({ ...current, [key]: Number.isFinite(numeric) ? numeric : 0 }));
  };

  const configuredCount = useMemo(
    () => models.filter((m) => isConfigured(priceMap[m.id])).length,
    [models, priceMap]
  );

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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
