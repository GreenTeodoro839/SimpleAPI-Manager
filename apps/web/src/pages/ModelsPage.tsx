import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { listModels } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { EmptyState } from '@/components/EmptyState';
import { protocolLabel } from '@/utils/format';
import type { InternalModel } from '@/types';

export function ModelsPage() {
  const session = usePanelSession();
  const [models, setModels] = useState<InternalModel[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setModels(await listModels(session));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>模型索引</h1>
          <p>以 internal model id 展示，统计和路由都以 aliasA 维度为准。</p>
        </div>
        <button className="button button-ghost" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="panel">
        {models.length === 0 ? (
          <EmptyState title="暂无模型" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Provider</th>
                  <th>协议</th>
                  <th>aliasA</th>
                  <th>真实模型</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id}>
                    <td><code>{model.id}</code></td>
                    <td>{model.provider}</td>
                    <td>{protocolLabel(model.provider_type)}</td>
                    <td>{model.aliasA}</td>
                    <td>{model.upstream_model}</td>
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
