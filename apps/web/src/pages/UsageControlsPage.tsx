import { useEffect, useMemo, useState } from 'react';
import { Gauge, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import {
  createUsageControl,
  deleteUsageControl,
  errorMessage,
  listApiKeys,
  listUsageControls,
  updateUsageControl
} from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { Notice } from '@/components/Notice';
import { formatCredits } from '@/utils/format';
import type { ClientApiKey, UsageControl } from '@/types';

interface Draft {
  id: string;
  api_key_name: string;
  limit_5h: number;
  limit_week: number;
}

function blankDraft(): Draft {
  return { id: '', api_key_name: '', limit_5h: 0, limit_week: 0 };
}

function draftFrom(control: UsageControl): Draft {
  return {
    id: control.id,
    api_key_name: control.api_key_name,
    limit_5h: control.limit_5h,
    limit_week: control.limit_week
  };
}

export function UsageControlsPage() {
  const session = usePanelSession();
  const [controls, setControls] = useState<UsageControl[]>([]);
  const [apiKeys, setApiKeys] = useState<ClientApiKey[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');

  const apiKeyNames = useMemo(() => new Set(apiKeys.map((key) => key.name)), [apiKeys]);
  const selected = useMemo(
    () => controls.find((control) => control.id === selectedId),
    [controls, selectedId]
  );
  const linkedKeyMissing =
    !!draft.api_key_name && !apiKeyNames.has(draft.api_key_name);

  const refresh = async () => {
    try {
      const [rows, keys] = await Promise.all([listUsageControls(session), listApiKeys(session)]);
      setControls(rows);
      setApiKeys(keys);
      if (!selectedId && rows[0]) {
        setSelectedId(rows[0].id);
        setDraft(draftFrom(rows[0]));
      }
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(errorMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<Draft>) => setDraft((current) => ({ ...current, ...p }));

  const save = async () => {
    setMessage('');
    setSuccess('');
    if (!draft.api_key_name) {
      setMessage('请选择一个 API key。');
      return;
    }
    try {
      if (selected) {
        await updateUsageControl(session, selected.id, {
          api_key_name: draft.api_key_name,
          api_key_value: selected.api_key_value,
          limit_5h: draft.limit_5h,
          limit_week: draft.limit_week
        });
        setSuccess(`已更新 ${draft.api_key_name} 的用量控制`);
      } else {
        const created = await createUsageControl(session, {
          api_key_name: draft.api_key_name,
          limit_5h: draft.limit_5h,
          limit_week: draft.limit_week
        });
        setSelectedId(created.id);
        setSuccess(`已创建 ${draft.api_key_name} 的用量控制`);
      }
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`删除 ${selected.api_key_name} 的用量控制？`)) return;
    try {
      await deleteUsageControl(session, selected.id);
      setSelectedId('');
      setDraft(blankDraft());
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>用量控制</h1>
          <p>
            为 API key 设置 5 小时 / 每周的可用 credits（滚动窗口）。超限自动禁用，周期过后自动恢复（两个窗口都未超限时）。
          </p>
        </div>
        <div className="actions">
          <button className="button button-ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button
            className="button button-primary"
            onClick={() => {
              setSelectedId('');
              setDraft(blankDraft());
              setMessage('');
              setSuccess('');
            }}
          >
            <Plus size={16} />
            新增
          </button>
        </div>
      </div>

      <Notice tone="danger" message={message} onClose={() => setMessage('')} />
      <Notice tone="success" message={success} onClose={() => setSuccess('')} />

      <div className="grid sidebar-grid">
        <div className="panel list-panel">
          {controls.length === 0 ? (
            <EmptyState title="暂无用量控制" />
          ) : (
            controls.map((control) => (
              <button
                className={`list-item ${control.id === selectedId ? 'active' : ''}`}
                key={control.id}
                onClick={() => {
                  setSelectedId(control.id);
                  setDraft(draftFrom(control));
                  setMessage('');
                  setSuccess('');
                }}
              >
                <strong>{control.api_key_name}</strong>
                {control.auto_disabled && <span className="badge danger">已自动禁用</span>}
                {!apiKeyNames.has(control.api_key_name) && (
                  <span className="badge warning">key 已不存在</span>
                )}
                <span>
                  5h {formatCredits(control.usage_5h)} / {formatCredits(control.limit_5h)} · 周{' '}
                  {formatCredits(control.usage_week)} / {formatCredits(control.limit_week)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="panel form-panel">
          <div className="panel-toolbar">
            <h2>
              <Gauge size={18} />
              {selected ? selected.api_key_name : '新增用量控制'}
            </h2>
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
              API Key
              <select
                value={draft.api_key_name}
                onChange={(event) => patch({ api_key_name: event.target.value })}
              >
                <option value="">选择 API key</option>
                {apiKeys.map((key) => (
                  <option key={key.name} value={key.name}>
                    {key.name}
                  </option>
                ))}
                {/* allow re-selecting a stale name so the admin can re-link */}
                {draft.api_key_name && !apiKeyNames.has(draft.api_key_name) && (
                  <option value={draft.api_key_name}>{draft.api_key_name}（已失效）</option>
                )}
              </select>
            </label>
          </div>

          {linkedKeyMissing && (
            <Notice
              tone="warning"
              message={`API key “${draft.api_key_name}” 在当前 key 列表中不存在（可能已重命名/删除）。请重新选择一个 key 以重新关联，用量控制的 id 不变。`}
            />
          )}

          <div className="form-grid">
            <label>
              5 小时限额（credits）
              <input
                type="number"
                step="any"
                min="0"
                value={draft.limit_5h === 0 ? '' : draft.limit_5h}
                onChange={(event) =>
                  patch({ limit_5h: event.target.value === '' ? 0 : Number(event.target.value) })
                }
                placeholder="0 = 不限制"
              />
              <span className="muted">滚动 5 小时窗口；0 表示该窗口不限制</span>
            </label>
            <label>
              每周限额（credits）
              <input
                type="number"
                step="any"
                min="0"
                value={draft.limit_week === 0 ? '' : draft.limit_week}
                onChange={(event) =>
                  patch({ limit_week: event.target.value === '' ? 0 : Number(event.target.value) })
                }
                placeholder="0 = 不限制"
              />
              <span className="muted">滚动 7 天窗口；0 表示该窗口不限制</span>
            </label>
          </div>

          {selected && (selected.usage_5h !== undefined || selected.usage_week !== undefined) && (
            <div className="subsection">
              <h3>当前用量</h3>
              <p className="muted">
                5h：已用 {formatCredits(selected.usage_5h)} / {formatCredits(selected.limit_5h)} ·
                本周：已用 {formatCredits(selected.usage_week)} / {formatCredits(selected.limit_week)}
                {selected.auto_disabled ? ' · 已因超额被自动禁用' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
