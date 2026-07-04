import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, minHeight = '420px', readOnly }: CodeEditorProps) {
  return (
    <div className="code-editor" style={{ minHeight }}>
      <CodeMirror
        value={value}
        minHeight={minHeight}
        basicSetup={{
          foldGutter: true,
          lineNumbers: true,
          highlightActiveLine: true
        }}
        extensions={[yamlLanguage()]}
        editable={!readOnly}
        onChange={onChange}
      />
    </div>
  );
}
