import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getUsage } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { EChartsView } from '@/components/EChartsView';
import { integer, protocolLabel, tokenNumber } from '@/utils/format';
import type { UsageItem } from '@/types';

interface UsageRow {
  provider: string;
  internal_model: string;
  source_protocol: UsageItem['source_protocol'];
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
}

function successfulRequests(item: UsageItem) {
  return Math.max(0, item.requests - item.failures);
}

function usageCacheTokens(item: UsageRow | UsageItem) {
  return (item.cache_read_tokens ?? 0) + (item.cache_creation_tokens ?? 0) + (item.cached_tokens ?? 0);
}

function usageTotalTokens(item: UsageRow | UsageItem) {
  const total = item.total_tokens ?? 0;
  if (total > 0) return total;
  return item.input_tokens + item.output_tokens + usageCacheTokens(item) + (item.reasoning_tokens ?? 0);
}

function aggregateUsage(items: UsageItem[]) {
  const grouped = new Map<string, UsageRow>();

  items.forEach((item) => {
    const requests = successfulRequests(item);
    if (requests <= 0) return;

    const key = `${item.internal_model}\u0000${item.provider}\u0000${item.source_protocol}`;
    const row =
      grouped.get(key) ??
      {
        provider: item.provider,
        internal_model: item.internal_model,
        source_protocol: item.source_protocol,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        cached_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0
      };

    row.requests += requests;
    row.input_tokens += item.input_tokens;
    row.output_tokens += item.output_tokens;
    row.cache_read_tokens = (row.cache_read_tokens ?? 0) + (item.cache_read_tokens ?? 0);
    row.cache_creation_tokens = (row.cache_creation_tokens ?? 0) + (item.cache_creation_tokens ?? 0);
    row.cached_tokens = (row.cached_tokens ?? 0) + (item.cached_tokens ?? 0);
    row.reasoning_tokens = (row.reasoning_tokens ?? 0) + (item.reasoning_tokens ?? 0);
    row.total_tokens = (row.total_tokens ?? 0) + usageTotalTokens(item);
    grouped.set(key, row);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const tokenDiff = usageTotalTokens(b) - usageTotalTokens(a);
    if (tokenDiff) return tokenDiff;
    const requestDiff = b.requests - a.requests;
    if (requestDiff) return requestDiff;
    return a.internal_model.localeCompare(b.internal_model);
  });
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

  const usageRows = useMemo(() => aggregateUsage(items), [items]);

  const modelOption = useMemo(() => {
    const grouped = new Map<string, number>();
    usageRows.forEach((item) => grouped.set(item.internal_model, (grouped.get(item.internal_model) ?? 0) + item.requests));
    const rows = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 10, right: 16, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map(([name]) => name) },
      series: [{ type: 'bar', data: rows.map(([, value]) => value), itemStyle: { borderRadius: 4 } }]
    };
  }, [usageRows]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>用量统计</h1>
          <p>来自 manager-server 本地数据库，只统计成功调用的 token 用量。</p>
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
        {usageRows.length === 0 ? (
          <EmptyState title="暂无用量数据" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>Provider</th>
                  <th>协议</th>
                  <th>请求</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache</th>
                  <th>Reasoning</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((item) => (
                  <tr key={`${item.internal_model}-${item.provider}-${item.source_protocol}`}>
                    <td><code>{item.internal_model}</code></td>
                    <td>{item.provider}</td>
                    <td>{protocolLabel(item.source_protocol)}</td>
                    <td>{integer(item.requests)}</td>
                    <td>{tokenNumber(item.input_tokens)}</td>
                    <td>{tokenNumber(item.output_tokens)}</td>
                    <td>{tokenNumber(usageCacheTokens(item))}</td>
                    <td>{tokenNumber(item.reasoning_tokens ?? 0)}</td>
                    <td>{tokenNumber(usageTotalTokens(item))}</td>
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
