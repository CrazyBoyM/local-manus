import { TerminalIcon } from "lucide-react";
import { TerminalOperationDataResponse } from "../operation-panel";
import { OperationContainer } from "./operation-container";
import { useEffect, useState } from "react";
import Editor from '@monaco-editor/react';

interface TerminalOperationProps {
  data?: TerminalOperationDataResponse;
  content?: string;
}

export function TerminalOperation({ data, content }: TerminalOperationProps) {
  // 获取命令和输出
  const command = data?.command || content || "Terminal";
  const output = data?.output || "";
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // 检测当前主题 (终端默认使用暗色主题)
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDarkMode(true); // 终端始终使用暗色主题
    
    return () => {};
  }, []);

  // 创建包含命令和输出的完整文本
  const fullTerminalText = `$ ${command}\n${output}`;
  
  // Monaco Editor 配置 - 修复类型错误
  const editorOptions: any = {
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as 'on',
    wrappingIndent: 'same' as const,
    lineNumbers: 'off' as 'off',
    renderLineHighlight: 'none' as const,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8
    },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
    contextmenu: false,
    overviewRulerBorder: false,
    renderIndentGuides: false,
    renderFinalNewline: false,
    cursorStyle: 'line' as const,
    cursorBlinking: 'blink' as const,
    cursorWidth: 0
  };

  // 自定义终端主题的配置
  const beforeMount = (monaco: typeof import('monaco-editor')) => {
    monaco.editor.defineTheme('terminal-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '888888' },
        { token: 'keyword', foreground: 'ff79c6' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'number', foreground: 'bd93f9' }
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#f8f8f2',
        'editorCursor.foreground': '#f8f8f2',
        'editor.lineHighlightBackground': '#44475a',
        'editorLineNumber.foreground': '#6272a4',
        'editor.selectionBackground': '#44475a',
        'editor.selectionHighlightBackground': '#424450'
      }
    });
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // 添加额外的配置
    editor.updateOptions({
      automaticLayout: true,
    });
    
    // 禁用编辑功能
    editor.onDidAttemptReadOnlyEdit(() => {
      // 阻止编辑
    });
  };

  return (
    <OperationContainer 
      title={command}
      icon={<TerminalIcon className="h-4 w-4" />}
    >
      <div className="h-full bg-gray-900 dark:bg-black text-white overflow-hidden">
        <Editor
          height="100%"
          theme="terminal-dark"
          language="shell"
          value={fullTerminalText}
          options={editorOptions}
          beforeMount={beforeMount}
          onMount={handleEditorDidMount}
          className="terminal-editor"
        />
      </div>
    </OperationContainer>
  );
} 