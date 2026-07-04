import { useEffect, useState } from 'react';
import YAML from 'yaml';
import { RefreshCw, Save } from 'lucide-react';
import { errorMessage, getPayload, putPayloadYaml } from '@/api/managerApi';
import { usePanelSession } from '@/store/session';
import { CodeEditor } from '@/components/CodeEditor';
import { Notice } from '@/components/Notice';

export function PayloadPage() {
  const session = usePanelSession();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setDraft(YAML.stringify(await getPayload(session)));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const save = async () => {
    setMessage('');
    setSuccess('');
    try {
      await putPayloadYaml(session, draft);
      setSuccess('Payload 规则已保存');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Payload 规则</h1>
          <p>按 default、default-raw、override、override-raw、filter 顺序改写出站请求。</p>
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
      <div className="panel editor-panel">
        <CodeEditor value={draft} onChange={setDraft} minHeight="620px" />
      </div>
    </section>
  );
}
