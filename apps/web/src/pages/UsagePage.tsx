import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getUsage } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { EChartsView } from '@/components/EChartsView';
import { integer, protocolLabel, statusTone } from '@/utils/format';
import type { UsageItem } from '@/types';

function usageCacheTokens(item: UsageItem) {
  return (item.cache_read_tokens ?? 0) + (item.cache_creation_tokens ?? 0) + (item.cached_tokens ?? 0);
}

function usageTotalTokens(item: UsageItem) {
  const total = item.total_tokens ?? 0;
  if (total > 0) return total;
  return item.input_tokens + item.output_tokens + usageCacheTokens(item) + (item.reasoning_tokens ?? 0);
}

export function UsagePage() {
  const session = usePanelSession();
  const [items, setItems] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await getUsage(session));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const modelOption = useMemo(() => {
    const grouped = new Map<string, number>();
    items.forEach((item) => grouped.set(item.internal_model, (grouped.get(item.internal_model) ?? 0) + item.requests));
    const rows = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 10, right: 16, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map(([name]) => name) },
      series: [{ type: 'bar', data: rows.map(([, value]) => value), itemStyle: { borderRadius: 4 } }]
    };
  }, [items]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>用量统计</h1>
          <p>来自 SimpleAPI 内存统计，重启后会清空。</p>
        </div>
        <button className="button button-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="panel">
        <h2>模型请求排行</h2>
        <EChartsView option={modelOption} height={320} />
      </div>
      <div className="panel">
        {items.length === 0 ? (
          <EmptyState title="暂无用量数据" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>Provider</th>
                  <th>协议</th>
                  <th>状态</th>
                  <th>请求</th>
                  <th>失败</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache</th>
                  <th>Reasoning</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.internal_model}-${item.source_protocol}-${item.http_status}`}>
                    <td><code>{item.internal_model}</code></td>
                    <td>{item.provider}</td>
                    <td>{protocolLabel(item.source_protocol)}</td>
                    <td><span className={`badge ${statusTone(item.http_status)}`}>{item.http_status}</span></td>
                    <td>{integer(item.requests)}</td>
                    <td>{integer(item.failures)}</td>
                    <td>{integer(item.input_tokens)}</td>
                    <td>{integer(item.output_tokens)}</td>
                    <td>{integer(usageCacheTokens(item))}</td>
                    <td>{integer(item.reasoning_tokens ?? 0)}</td>
                    <td>{integer(usageTotalTokens(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
