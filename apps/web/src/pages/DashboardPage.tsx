import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Database, KeyRound, Network, RefreshCw } from 'lucide-react';
import { getConfig, getManagerConfig, getUsage, listApiKeys, listModels, listProviders } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { StatCard } from '@/components/StatCard';
import { Notice } from '@/components/Notice';
import { EChartsView } from '@/components/EChartsView';
import { compactNumber, integer, percent, protocolLabel } from '@/utils/format';
import type { ClientApiKey, InternalModel, Provider, UsageItem } from '@/types';

function usageTokenTotal(item: UsageItem) {
  const total = item.total_tokens ?? 0;
  if (total > 0) return total;
  return (
    item.input_tokens +
    item.output_tokens +
    (item.cache_read_tokens ?? 0) +
    (item.cache_creation_tokens ?? 0) +
    (item.cached_tokens ?? 0) +
    (item.reasoning_tokens ?? 0)
  );
}

export function DashboardPage() {
  const session = usePanelSession();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [apiKeys, setApiKeys] = useState<ClientApiKey[]>([]);
  const [models, setModels] = useState<InternalModel[]>([]);
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [connection, setConnection] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [manager, config, providerRows, keyRows, modelRows, usageRows] = await Promise.all([
        getManagerConfig(session),
        getConfig(session),
        listProviders(session),
        listApiKeys(session),
        listModels(session),
        getUsage(session)
      ]);
      setConnection(manager.config.simpleApiConnection.baseUrl || '');
      setProviders(providerRows.length ? providerRows : config.providers ?? []);
      setApiKeys(keyRows.length ? keyRows : config.api_keys ?? []);
      setModels(modelRows);
      setUsage(usageRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const totals = useMemo(() => {
    const requests = usage.reduce((sum, item) => sum + item.requests, 0);
    const failures = usage.reduce((sum, item) => sum + item.failures, 0);
    const input = usage.reduce((sum, item) => sum + item.input_tokens, 0);
    const output = usage.reduce((sum, item) => sum + item.output_tokens, 0);
    const cache = usage.reduce(
      (sum, item) =>
        sum + (item.cache_read_tokens ?? 0) + (item.cache_creation_tokens ?? 0) + (item.cached_tokens ?? 0),
      0
    );
    const reasoning = usage.reduce((sum, item) => sum + (item.reasoning_tokens ?? 0), 0);
    const total = usage.reduce((sum, item) => sum + usageTokenTotal(item), 0);
    return {
      requests,
      failures,
      input,
      output,
      cache,
      reasoning,
      total,
      successRate: requests ? ((requests - failures) / requests) * 100 : 100
    };
  }, [usage]);

  const protocolOption = useMemo(() => {
    const grouped = new Map<string, number>();
    usage.forEach((item) => grouped.set(item.source_protocol, (grouped.get(item.source_protocol) ?? 0) + item.requests));
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          data: Array.from(grouped.entries()).map(([name, value]) => ({ name: protocolLabel(name), value }))
        }
      ]
    };
  }, [usage]);

  const providerOption = useMemo(() => {
    const grouped = new Map<string, number>();
    usage.forEach((item) => grouped.set(item.provider, (grouped.get(item.provider) ?? 0) + item.requests));
    const rows = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 10, right: 16, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: rows.map(([name]) => name) },
      series: [{ type: 'bar', data: rows.map(([, value]) => value), itemStyle: { borderRadius: 4 } }]
    };
  }, [usage]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>仪表盘</h1>
          <p>{connection ? `当前连接：${connection}` : '通过 manager-server 代理连接 SimpleAPI'}</p>
        </div>
        <button className="button button-ghost" type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <div className="stats-grid">
        <StatCard label="Provider" value={providers.length} icon={<Bot />} tone="blue" />
        <StatCard label="API Keys" value={apiKeys.length} icon={<KeyRound />} tone="green" />
        <StatCard label="内部模型" value={models.length} icon={<Database />} tone="violet" />
        <StatCard label="请求数" value={compactNumber(totals.requests)} icon={<Network />} tone="amber" />
        <StatCard label="成功率" value={percent(totals.successRate)} icon={<AlertTriangle />} tone={totals.failures ? 'red' : 'green'} />
        <StatCard label="Tokens" value={compactNumber(totals.total)} icon={<Database />} sublabel={`in ${integer(totals.input)} / out ${integer(totals.output)} / cache ${integer(totals.cache)}`} />
      </div>
      <div className="grid two">
        <div className="panel">
          <h2>协议流量</h2>
          <EChartsView option={protocolOption} />
        </div>
        <div className="panel">
          <h2>Provider 请求排行</h2>
          <EChartsView option={providerOption} />
        </div>
      </div>
    </section>
  );
}
