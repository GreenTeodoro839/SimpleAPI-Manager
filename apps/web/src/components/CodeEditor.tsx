import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { useThemeStore } from '@/store/theme';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, minHeight = '420px', readOnly }: CodeEditorProps) {
  const themeMode = useThemeStore((state) => state.effective);
  const mirrorTheme = themeMode === 'dark' ? 'dark' : 'light';

  return (
    <div className="code-editor" style={{ minHeight }}>
      <CodeMirror
        value={value}
        minHeight={minHeight}
        theme={mirrorTheme}
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
