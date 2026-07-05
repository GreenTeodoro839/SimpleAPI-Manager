import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  KeyRound,
  RefreshCw,
  Search,
  TimerReset,
  XCircle
} from 'lucide-react';
import { errorMessage, getCallLog } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { StatCard } from '@/components/StatCard';
import { compactNumber, integer, percent, protocolLabel, statusTone, tokenNumber } from '@/utils/format';
import type { CallLogEntry, CallLogTokens } from '@/types';

type RangeKey = 'today' | '7d' | '14d' | '30d' | 'all';
type ViewMode = 'realtime' | 'api_key' | 'model';
type StatusFilter = 'all' | 'success' | 'failed';

const rangeOptions: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '7 天' },
  { key: '14d', label: '14 天' },
  { key: '30d', label: '30 天' },
  { key: 'all', label: '全部' }
];

const viewOptions: Array<{ key: ViewMode; label: string }> = [
  { key: 'realtime', label: '实时' },
  { key: 'api_key', label: 'API Key' },
  { key: 'model', label: '模型' }
];

function numberValue(value?: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function tokenTotal(tokens?: CallLogTokens) {
  const total = numberValue(tokens?.total_tokens);
  if (total > 0) return total;
  return (
    numberValue(tokens?.input_tokens) +
    numberValue(tokens?.output_tokens) +
    numberValue(tokens?.cache_read_tokens) +
    numberValue(tokens?.cache_creation_tokens) +
    numberValue(tokens?.cached_tokens) +
    numberValue(tokens?.reasoning_tokens)
  );
}

function cacheTokens(tokens?: CallLogTokens) {
  return (
    numberValue(tokens?.cache_read_tokens) +
    numberValue(tokens?.cache_creation_tokens) +
    numberValue(tokens?.cached_tokens)
  );
}

function isFailed(entry: CallLogEntry) {
  return entry.failed || entry.http_status >= 400 || entry.http_status === 0;
}

function errorDetail(entry: CallLogEntry) {
  const error = entry.error?.trim();
  if (error) return error;
  if (entry.http_status) return `HTTP ${entry.http_status}`;
  return '请求失败，暂无错误详情';
}

function formatDuration(ms?: number) {
  const value = numberValue(ms);
  if (!value) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${integer(value)} ms`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function shortID(value: string) {
  if (!value) return '--';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function matchesRange(entry: CallLogEntry, range: RangeKey) {
  if (range === 'all') return true;
  const time = new Date(entry.timestamp).getTime();
  if (Number.isNaN(time)) return true;
  const now = Date.now();
  if (range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return time >= start.getTime();
  }
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
  return time >= now - days * 24 * 60 * 60 * 1000;
}

function includesText(entry: CallLogEntry, query: string) {
  if (!query) return true;
  const haystack = [
    entry.request_id,
    entry.endpoint,
    entry.api_key,
    entry.alias,
    entry.provider,
    entry.provider_type,
    entry.model,
    entry.internal_model,
    entry.source_protocol,
    String(entry.http_status),
    entry.error
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

interface GroupRow {
  key: string;
  label: string;
  sublabel: string;
  calls: number;
  failures: number;
  input: number;
  output: number;
  cache: number;
  reasoning: number;
  total: number;
  latency: number;
}

function groupEntries(
  entries: CallLogEntry[],
  keyFor: (entry: CallLogEntry) => string,
  labelFor: (entry: CallLogEntry) => string,
  sublabelFor: (entry: CallLogEntry) => string
) {
  const grouped = new Map<string, GroupRow>();
  entries.forEach((entry) => {
    const key = keyFor(entry) || 'unknown';
    const tokens = entry.tokens ?? {};
    const row =
      grouped.get(key) ??
      {
        key,
        label: labelFor(entry) || '未知',
        sublabel: sublabelFor(entry),
        calls: 0,
        failures: 0,
        input: 0,
        output: 0,
        cache: 0,
        reasoning: 0,
        total: 0,
        latency: 0
      };
    row.calls += 1;
    row.failures += isFailed(entry) ? 1 : 0;
    row.input += numberValue(tokens.input_tokens);
    row.output += numberValue(tokens.output_tokens);
    row.cache += cacheTokens(tokens);
    row.reasoning += numberValue(tokens.reasoning_tokens);
    row.total += tokenTotal(tokens);
    row.latency += numberValue(entry.latency_ms);
    grouped.set(key, row);
  });
  return Array.from(grouped.values()).sort((a, b) => b.calls - a.calls);
}

export function RequestMonitorPage() {
  const session = usePanelSession();
  const [entries, setEntries] = useState<CallLogEntry[]>([]);
  const [message, setMessage] = useState('');
  const [syncWarning, setSyncWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<RangeKey>('7d');
  const [viewMode, setViewMode] = useState<ViewMode>('realtime');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [apiKeyFilter, setApiKeyFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(300);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [errorTooltip, setErrorTooltip] = useState<{
    x: number;
    y: number;
    message: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await getCallLog(session, limit);
      setEntries(result.items);
      setSyncWarning(result.syncError ?? '');
    } catch (error) {
      setMessage(errorMessage(error));
      setSyncWarning('');
    } finally {
      setLoading(false);
    }
  }, [limit, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => void refresh(), refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh, refreshSeconds]);

  const filterOptions = useMemo(() => {
    const apiKeys = new Set<string>();
    const models = new Set<string>();
    const providers = new Set<string>();
    entries.forEach((entry) => {
      if (entry.api_key) apiKeys.add(entry.api_key);
      if (entry.internal_model) models.add(entry.internal_model);
      if (entry.provider) providers.add(entry.provider);
    });
    return {
      apiKeys: Array.from(apiKeys).sort(),
      models: Array.from(models).sort(),
      providers: Array.from(providers).sort()
    };
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!matchesRange(entry, range)) return false;
        if (!includesText(entry, query.trim())) return false;
        if (statusFilter === 'success' && isFailed(entry)) return false;
        if (statusFilter === 'failed' && !isFailed(entry)) return false;
        if (apiKeyFilter !== 'all' && entry.api_key !== apiKeyFilter) return false;
        if (modelFilter !== 'all' && entry.internal_model !== modelFilter) return false;
        if (providerFilter !== 'all' && entry.provider !== providerFilter) return false;
        return true;
      }),
    [apiKeyFilter, entries, modelFilter, providerFilter, query, range, statusFilter]
  );

  const totals = useMemo(() => {
    const calls = filteredEntries.length;
    const failures = filteredEntries.filter(isFailed).length;
    const input = filteredEntries.reduce((sum, item) => sum + numberValue(item.tokens?.input_tokens), 0);
    const output = filteredEntries.reduce((sum, item) => sum + numberValue(item.tokens?.output_tokens), 0);
    const cache = filteredEntries.reduce((sum, item) => sum + cacheTokens(item.tokens), 0);
    const reasoning = filteredEntries.reduce(
      (sum, item) => sum + numberValue(item.tokens?.reasoning_tokens),
      0
    );
    const total = filteredEntries.reduce((sum, item) => sum + tokenTotal(item.tokens), 0);
    const latency = filteredEntries.reduce((sum, item) => sum + numberValue(item.latency_ms), 0);
    return {
      calls,
      failures,
      input,
      output,
      cache,
      reasoning,
      total,
      averageLatency: calls ? latency / calls : 0,
      successRate: calls ? ((calls - failures) / calls) * 100 : 100
    };
  }, [filteredEntries]);

  const apiKeyRows = useMemo(
    () =>
      groupEntries(
        filteredEntries,
        (entry) => entry.api_key,
        (entry) => entry.api_key,
        (entry) => `${protocolLabel(entry.source_protocol)} · ${entry.endpoint || 'unknown endpoint'}`
      ),
    [filteredEntries]
  );

  const modelRows = useMemo(
    () =>
      groupEntries(
        filteredEntries,
        (entry) => entry.internal_model,
        (entry) => entry.internal_model || entry.alias || entry.model,
        (entry) => `${entry.provider || 'unknown provider'} · ${entry.model || entry.alias || '-'}`
      ),
    [filteredEntries]
  );

  const aggregateRows = viewMode === 'api_key' ? apiKeyRows : modelRows;

  const showErrorTooltip = (event: MouseEvent<HTMLElement>, entry: CallLogEntry) => {
    setErrorTooltip({
      x: Math.min(event.clientX + 12, window.innerWidth - 340),
      y: Math.min(event.clientY + 12, window.innerHeight - 160),
      message: errorDetail(entry)
    });
  };

  const showFocusedErrorTooltip = (event: FocusEvent<HTMLElement>, entry: CallLogEntry) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setErrorTooltip({
      x: Math.min(rect.left, window.innerWidth - 340),
      y: Math.min(rect.bottom + 8, window.innerHeight - 160),
      message: errorDetail(entry)
    });
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>请求监控</h1>
          <p>最近 {integer(entries.length)} 条调用记录 · {autoRefresh ? `${refreshSeconds} 秒自动刷新` : '手动刷新'}</p>
        </div>
        <button className="button button-ghost" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice
        tone="warning"
        message={
          syncWarning
            ? `同步 SimpleAPI 调用记录失败，正在显示本地数据库记录：${syncWarning}`
            : ''
        }
        onClose={() => setSyncWarning('')}
      />

      <div className="monitor-controls panel">
        <div className="segment-control" role="group" aria-label="时间范围">
          {rangeOptions.map((item) => (
            <button
              className={range === item.key ? 'active' : ''}
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 request、API Key、模型、Provider、状态码"
          />
        </label>
        <label>
          状态
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">全部</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
        </label>
        <label>
          API Key
          <select value={apiKeyFilter} onChange={(event) => setApiKeyFilter(event.target.value)}>
            <option value="all">全部</option>
            {filterOptions.apiKeys.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="all">全部</option>
            {filterOptions.models.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
            <option value="all">全部</option>
            {filterOptions.providers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          最近
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            <option value={100}>100 条</option>
            <option value={300}>300 条</option>
            <option value={500}>500 条</option>
            <option value={1000}>1000 条</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          自动
        </label>
        <label>
          间隔
          <select
            disabled={!autoRefresh}
            value={refreshSeconds}
            onChange={(event) => setRefreshSeconds(Number(event.target.value))}
          >
            <option value={5}>5 秒</option>
            <option value={10}>10 秒</option>
            <option value={30}>30 秒</option>
          </select>
        </label>
      </div>

      <div className="stats-grid">
        <StatCard label="调用" value={compactNumber(totals.calls)} icon={<Activity />} tone="blue" />
        <StatCard
          label="成功率"
          value={percent(totals.successRate)}
          icon={<CheckCircle2 />}
          tone={totals.failures ? 'amber' : 'green'}
        />
        <StatCard label="失败" value={compactNumber(totals.failures)} icon={<XCircle />} tone="red" />
        <StatCard label="Tokens" value={tokenNumber(totals.total)} icon={<Database />} tone="violet" />
        <StatCard
          label="缓存"
          value={tokenNumber(totals.cache)}
          icon={<KeyRound />}
          sublabel={`推理 ${tokenNumber(totals.reasoning)}`}
          tone="green"
        />
        <StatCard
          label="平均耗时"
          value={formatDuration(totals.averageLatency)}
          icon={<TimerReset />}
          sublabel={`I ${tokenNumber(totals.input)} / O ${tokenNumber(totals.output)}`}
          tone="amber"
        />
      </div>

      <div className="panel">
        <div className="panel-toolbar">
          <h2>调用记录</h2>
          <div className="segment-control compact" role="group" aria-label="监控视图">
            {viewOptions.map((item) => (
              <button
                className={viewMode === item.key ? 'active' : ''}
                key={item.key}
                type="button"
                onClick={() => setViewMode(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <EmptyState title={loading ? '加载调用记录中' : '暂无调用记录'} />
        ) : viewMode === 'realtime' ? (
          <div className="table-wrap">
            <table className="monitor-table">
              <thead>
                <tr>
                  <th>API Key</th>
                  <th>模型</th>
                  <th>Provider</th>
                  <th>协议</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th>时间</th>
                  <th>Tokens</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const failed = isFailed(entry);
                  const tokens = entry.tokens ?? {};
                  return (
                    <tr key={`${entry.request_id}-${entry.timestamp}-${entry.provider}-${entry.http_status}`}>
                      <td>
                        <div className="cell-stack">
                          <strong>{entry.api_key || '未知 Key'}</strong>
                          <span>{entry.endpoint || '-'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <code>{entry.alias || entry.internal_model || '-'}</code>
                          <span>{entry.model || entry.internal_model || '-'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>{entry.provider || '-'}</strong>
                          <span>{protocolLabel(entry.provider_type)}</span>
                        </div>
                      </td>
                      <td>{protocolLabel(entry.source_protocol)}</td>
                      <td>
                        {failed ? (
                          <span
                            className="badge danger error-badge"
                            tabIndex={0}
                            onBlur={() => setErrorTooltip(null)}
                            onFocus={(event) => showFocusedErrorTooltip(event, entry)}
                            onMouseEnter={(event) => showErrorTooltip(event, entry)}
                            onMouseLeave={() => setErrorTooltip(null)}
                            onMouseMove={(event) => showErrorTooltip(event, entry)}
                          >
                            失败
                          </span>
                        ) : (
                          <span className={`badge ${statusTone(entry.http_status)}`}>
                            {entry.http_status || '成功'}
                          </span>
                        )}
                      </td>
                      <td>{formatDuration(entry.latency_ms)}</td>
                      <td>{formatTime(entry.timestamp)}</td>
                      <td>
                        <div className="token-stack">
                          <strong>{tokenNumber(tokenTotal(tokens))}</strong>
                          <span>
                            I {tokenNumber(tokens.input_tokens ?? 0)} · O {tokenNumber(tokens.output_tokens ?? 0)}
                          </span>
                          <span>
                            C {tokenNumber(cacheTokens(tokens))} · R {tokenNumber(tokens.reasoning_tokens ?? 0)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <code>{shortID(entry.request_id)}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="monitor-table">
              <thead>
                <tr>
                  <th>{viewMode === 'api_key' ? 'API Key' : '模型'}</th>
                  <th>调用</th>
                  <th>成功率</th>
                  <th>失败</th>
                  <th>平均耗时</th>
                  <th>Tokens</th>
                  <th>输入</th>
                  <th>输出</th>
                  <th>缓存</th>
                  <th>推理</th>
                </tr>
              </thead>
              <tbody>
                {aggregateRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div className="cell-stack">
                        <strong>{row.label}</strong>
                        <span>{row.sublabel}</span>
                      </div>
                    </td>
                    <td>{integer(row.calls)}</td>
                    <td>{percent(row.calls ? ((row.calls - row.failures) / row.calls) * 100 : 100)}</td>
                    <td>{integer(row.failures)}</td>
                    <td>{formatDuration(row.calls ? row.latency / row.calls : 0)}</td>
                    <td>{tokenNumber(row.total)}</td>
                    <td>{tokenNumber(row.input)}</td>
                    <td>{tokenNumber(row.output)}</td>
                    <td>{tokenNumber(row.cache)}</td>
                    <td>{tokenNumber(row.reasoning)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="monitor-footer">
        <Clock3 size={14} />
        <span>
          已加载 {integer(entries.length)} 条 · 当前显示 {integer(filteredEntries.length)} 条
        </span>
      </div>
      {errorTooltip && (
        <div
          className="error-tooltip"
          role="tooltip"
          style={{ left: errorTooltip.x, top: errorTooltip.y }}
        >
          {errorTooltip.message}
        </div>
      )}
    </section>
  );
}
