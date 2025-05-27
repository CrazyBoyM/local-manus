"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize,
  Minimize,
  Download,
  Copy,
  ExternalLink,
} from "lucide-react";
import dynamic from "next/dynamic";

// 动态导入 Monaco Editor 以避免服务器端渲染问题
const Editor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <p>加载编辑器中...</p>
      </div>
    ),
  }
);

interface AttachmentViewerProps {
  fileName: string;
  fileType: string;
  fileContent?: string;
  fileUrl?: string;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

export function AttachmentViewer({
  fileName,
  fileType,
  fileContent,
  fileUrl,
  onClose,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: AttachmentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [code, setCode] = useState<string>(fileContent || "");
  const [isLoading, setIsLoading] = useState(!fileContent && !code);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    // 如果没有传入内容但有URL，尝试获取文件内容
    const fetchFileContent = async () => {
      if (!fileContent && fileUrl) {
        try {
          setIsLoading(true);
          // todo: 需要上传到后端获取url
          try {
            const response = await fetch(fileUrl);
            const text = await response.text();
            setCode(text);
          } catch (e) {
            console.error("获取文件内容失败:", e);
          }
        } catch (error) {
          console.error("Failed to fetch file content:", error);
          setCode(
            `// 无法加载文件内容: ${fileName}\n// 这可能是因为文件格式不支持或文件无法访问\n// 错误信息: ${error}`
          );
        } finally {
          setIsLoading(false);
        }
      } else if (!fileContent && !fileUrl) {
        setCode(`// ${fileName}\n// 没有提供文件内容或URL`);
        setIsLoading(false);
      }
    };

    fetchFileContent();
  }, [fileContent, fileUrl, fileName, fileType]);

  // 处理编辑器挂载
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
    // 编辑器加载完成后，如果内容为空，添加一些默认内容
    if (!code) {
      const defaultContent = `// ${fileName}\n// 文件内容为空或无法加载`;
      setCode(defaultContent);
      editor.setValue(defaultContent);
    }
  };

  // 确定编辑器语言
  const getEditorLanguage = () => {
    if (fileName) {
      const extension = fileName.split(".").pop()?.toLowerCase();

      const extensionMap: Record<string, string> = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        html: "html",
        css: "css",
        json: "json",
        md: "markdown",
        py: "python",
        java: "java",
        c: "c",
        cpp: "cpp",
        cs: "csharp",
        go: "go",
        php: "php",
        rb: "ruby",
        rs: "rust",
        swift: "swift",
        sh: "shell",
        txt: "plaintext",
      };

      return extension ? extensionMap[extension] || "plaintext" : "plaintext";
    }

    return "plaintext";
  };

  // 复制代码到剪贴板
  const handleCopyCode = () => {
    if (editorRef.current) {
      const code = editorRef.current.getValue();
      navigator.clipboard
        .writeText(code)
        .then(() => {
          console.log("代码已复制到剪贴板");
        })
        .catch((err) => {
          console.error("无法复制代码:", err);
        });
    }
  };

  // 下载文件
  const handleDownload = () => {
    if (fileUrl) {
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 如果没有URL但有内容，创建blob下载
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 切换全屏
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 对于图片文件，显示图片查看器
  if (fileType === "image" && fileUrl) {
    return (
      <div
        className={`flex flex-col h-full ${
          isFullscreen ? "fixed inset-0 z-50 bg-white" : ""
        }`}
      >
        {/* 头部工具栏 */}
        <div className="flex h-12 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4">
          <div className="flex items-center">
            <h2 className="text-base font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
              {fileName}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500"
              onClick={handleDownload}
              title="下载图片"
            >
              <Download className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500"
              onClick={toggleFullscreen}
              title={isFullscreen ? "退出全屏" : "全屏查看"}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500"
              onClick={onClose}
              title="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 图片容器 */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-100">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* 底部导航 */}
        {(hasPrevious || hasNext) && (
          <div className="flex justify-between p-2 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500"
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一个文件
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500"
              onClick={onNext}
              disabled={!hasNext}
            >
              下一个文件
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full ${
        isFullscreen ? "fixed inset-0 z-50 bg-white" : ""
      }`}
    >
      {/* 头部工具栏 */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="flex items-center">
          <h2 className="text-base font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
            {fileName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500"
            onClick={handleCopyCode}
            title="复制代码"
          >
            <Copy className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500"
            onClick={handleDownload}
            title="下载文件"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500"
            onClick={toggleFullscreen}
            title={isFullscreen ? "退出全屏" : "全屏查看"}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-500"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 编辑器容器 */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-manus-text-secondary">加载中...</p>
          </div>
        ) : (
          <Editor
            height="100%"
            language={getEditorLanguage()}
            value={code}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontFamily: "'Fira Code', monospace",
              fontSize: 14,
              lineNumbers: "on",
              wordWrap: "on",
            }}
            onMount={handleEditorDidMount}
          />
        )}
      </div>

      {/* 底部导航 */}
      {(hasPrevious || hasNext) && (
        <div className="flex justify-between p-2 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500"
            onClick={onPrevious}
            disabled={!hasPrevious}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一个文件
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500"
            onClick={onNext}
            disabled={!hasNext}
          >
            下一个文件
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
