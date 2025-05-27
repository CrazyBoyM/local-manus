import { FileIcon, FileTextIcon, FileCodeIcon } from "lucide-react";
import { EditOperationDataResponse } from "../operation-panel";
import { OperationContainer } from "./operation-container";
import { useState, useEffect } from "react";
import Editor from '@monaco-editor/react';

interface EditOperationProps {
  data?: EditOperationDataResponse;
  fileName?: string;
}

export function EditOperation({ data, fileName }: EditOperationProps) {
  const displayFileName = data?.fileName || fileName || "未知文件";
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 检测当前主题
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDarkMode(darkModeMediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    darkModeMediaQuery.addEventListener("change", handleChange);
    
    return () => darkModeMediaQuery.removeEventListener("change", handleChange);
  }, []);
  
  // 根据文件类型选择合适的图标
  const getFileIcon = () => {
    const fileType = data?.fileType || "text";
    switch (fileType.toLowerCase()) {
      case "markdown":
      case "md":
        return <FileTextIcon className="h-4 w-4" />;
      case "javascript":
      case "typescript":
      case "python":
      case "java":
        return <FileCodeIcon className="h-4 w-4" />;
      default:
        return <FileIcon className="h-4 w-4" />;
    }
  };

  // 根据文件类型获取语言ID
  const getLanguageId = () => {
    const fileType = data?.fileType || "text";
    switch (fileType.toLowerCase()) {
      case "javascript":
      case "js":
        return "javascript";
      case "typescript":
      case "ts":
        return "typescript";
      case "markdown":
      case "md":
        return "markdown";
      case "python":
      case "py":
        return "python";
      case "java":
        return "java";
      case "html":
        return "html";
      case "css":
        return "css";
      case "json":
        return "json";
      default:
        return "plaintext";
    }
  };

  const modifiedContent = data?.content || "";
  
  // 编辑器选项配置 - 修复类型错误
  const editorOptions = {
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as 'on',
    wrappingIndent: 'same' as const,
    contextmenu: false,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'all' as const,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  };

  // 处理编辑器挂载
  const handleEditorDidMount = (editor: any, monaco: any) => {
    // 添加额外的配置
    editor.updateOptions({
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });

    // 适配主题
    monaco.editor.setTheme(isDarkMode ? 'vs-dark' : 'vs');
  };

  return (
    <OperationContainer 
      title={displayFileName}
      icon={getFileIcon()}
    >
      <div className="h-full flex flex-col">
        {/* 文件内容展示区域 - 直接显示内容，无需切换按钮 */}
        <div className="flex-1 w-full h-full overflow-hidden">
          {modifiedContent ? (
            <Editor
              height="100%"
              width="100%"
              theme={isDarkMode ? "vs-dark" : "vs"}
              language={getLanguageId()}
              value={modifiedContent}
              options={editorOptions}
              onMount={handleEditorDidMount}
              className="overflow-hidden"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-800">
              <p className="text-gray-500 dark:text-gray-400">文件内容为空</p>
            </div>
          )}
        </div>
      </div>
    </OperationContainer>
  );
} 