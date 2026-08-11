import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Activity, Coins, RefreshCw } from 'lucide-react';
import { errorMessage, getQuota } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { StatCard } from '@/components/StatCard';
import { formatCredits, protocolLabel, statusTone, tokenNumber } from '@/utils/format';
import type { QuotaRecentItem, QuotaResponse, QuotaWindow } from '@/types';

function formatDuration(ms?: number) {
  const value = Number(ms) || 0;
  if (!value) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)} s`;
  return `${value} ms`;
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

function tokenBreakdown(tokens?: QuotaWindow['tokens']) {
  return [
    { label: '输入', value: tokens?.input_tokens },
    { label: '输出', value: tokens?.output_tokens },
    { label: '缓存读取', value: tokens?.cache_read_tokens },
    { label: '缓存写入', value: tokens?.cache_creation_tokens },
    { label: '缓存命中', value: tokens?.cached_tokens },
    { label: '推理', value: tokens?.reasoning_tokens },
    { label: '合计', value: tokens?.total_tokens }
  ];
}

function WindowCard({ title, window }: { title: string; window?: QuotaWindow }) {
  if (!window) return null;
  const rows = tokenBreakdown(window.tokens);
  const unlimited = !(window.limit > 0);
  const availableDisplay = unlimited ? '不限' : formatCredits(window.available);
  return (
    <div className="panel">
      <div className="panel-toolbar">
        <h2>{title}</h2>
        <span className="muted">
          {unlimited ? '本窗口未设限额' : `限额 ${formatCredits(window.limit)} credits · 剩余 ${formatCredits(window.available)} credits`}
        </span>
      </div>
      <div className="stats-grid">
        <StatCard
          label="可用 credits"
          value={availableDisplay}
          icon={<Coins />}
          tone={unlimited ? 'blue' : 'green'}
          sublabel={unlimited ? '未设限额' : undefined}
        />
        <StatCard
          label="已用 credits"
          value={formatCredits(window.used)}
          icon={<Activity />}
          tone={!unlimited && window.used > window.limit ? 'red' : 'blue'}
          sublabel={unlimited ? '未设限额' : `限额 ${formatCredits(window.limit)}`}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>token 类别</th>
              <th>已用</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{tokenNumber(Number(row.value) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentRow({ item }: { item: QuotaRecentItem }) {
  const tokens = item.tokens ?? {};
  const total = Number(tokens.total_tokens) || 0;
  return (
    <tr>
      <td><code>{item.model || '-'}</code></td>
      <td>{protocolLabel(item.protocol)}</td>
      <td>
        {item.failed ? (
          <span className="badge danger">失败</span>
        ) : (
          <span className={`badge ${statusTone(item.http_status)}`}>{item.http_status || '成功'}</span>
        )}
      </td>
      <td>{formatTime(item.time)}</td>
      <td>{formatDuration(item.duration_ms)}</td>
      <td>{tokenNumber(total)}</td>
    </tr>
  );
}

export function QuotaPage() {
  const params = useParams();
  const key = params.apiKey ?? '';
  const session = usePanelSession();
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getQuota(session.panelBase, key));
    } catch (err) {
      setError(errorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [key, session.panelBase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="page quota-page">
      <div className="page-header">
        <div>
          <h1>用量查询</h1>
          <p>
            {data?.configured
              ? `API Key：${data.api_key_name ?? '-'}`
              : '查询 API key 的可用额度与最近请求（仅对配置了用量控制的 key 可用）。'}
          </p>
        </div>
        <button className="button button-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <Notice tone="danger" message={error} onClose={() => setError('')} />

      {loading ? (
        <div className="panel">
          <EmptyState title="加载中" />
        </div>
      ) : !data || !data.configured ? (
        <div className="panel">
          <EmptyState title="此 API key 未配置用量控制，或 key 无效" />
          <p className="muted" style={{ textAlign: 'center' }}>
            如需查看额度，请联系管理员为该 key 启用用量控制。
          </p>
        </div>
      ) : (
        <>
          <WindowCard title="最近 5 小时" window={data.usage_5h} />
          <WindowCard title="最近一周" window={data.usage_week} />
          <div className="panel">
            <div className="panel-toolbar">
              <h2>最近请求</h2>
              <span className="muted">模型按 aliasB 显示</span>
            </div>
            {(data.recent?.length ?? 0) === 0 ? (
              <EmptyState title="暂无请求记录" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>协议</th>
                      <th>状态</th>
                      <th>时间</th>
                      <th>耗时</th>
                      <th>Tokens</th>
                    </tr>
                  </thead>
                  <tbody>{data.recent?.map((item, index) => <RecentRow key={index} item={item} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
