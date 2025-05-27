"use client";

import type React from "react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { useMobile } from "@/hooks/use-mobile";
import { ChatActions } from "./chat-actions";
import { useRouter } from "next/navigation";
import {
  Task,
  Message,
  Operation,
  Stage,
  TaskMetadata,
  TimelineItem,
  TaskResponse,
  TaskMetadataResponse,
  MessageResponse,
  StageResponse,
  OperationResponse,
  CreateMessageRequest
} from "@/types";

interface ChatAreaProps {
  taskId: string | null;
  taskData: Task | null;
  loading: boolean;
  error: string | null;
  onSendMessage: (content: string) => void;
}

export function ChatArea({
  taskId,
  taskData,
  loading,
  error,
  onSendMessage,
}: ChatAreaProps) {
  console.log(taskData, "taskData");
  const [input, setInput] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [stagesVisible, setStagesVisible] = useState<Record<string, boolean>>(
    {}
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<
    {
      name: string;
      type: "image" | "text" | "file";
      size: string;
      url?: string;
    }[]
  >([]);
  const router = useRouter();
  const [viewingFile, setViewingFile] = useState<{
    viewing: boolean;
    name: string;
    type: string;
    url?: string;
  } | null>(null);

  // console.log(JSON.stringify(taskData?.stages), "taskData");

  // 初始化阶段展开状态
  useEffect(() => {
    if (taskData?.stages) {
      const initialVisibility: Record<string, boolean> = {};
      taskData.stages.forEach((stage) => {
        initialVisibility[stage.id] = true; // 默认展开
      });
      setStagesVisible(initialVisibility);
    }
  }, [taskData?.stages]);

  // 使用useLayoutEffect来强制重新计算和应用布局
  useLayoutEffect(() => {
    // 强制布局计算，确保没有空白区域
    const root = document.documentElement;
    root.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    // 确保内容区域正确填充可用空间
    if (contentRef.current) {
      const updateHeight = () => {
        const viewportHeight = window.innerHeight;
        const headerHeight = 48; // 12px * 4 (h-12)
        const inputHeight = 56; // 按钮和输入框区域高度
        const availableHeight = viewportHeight - headerHeight - inputHeight;
        contentRef.current!.style.minHeight = `${availableHeight}px`;
        contentRef.current!.style.maxHeight = `${availableHeight}px`;
      };

      updateHeight();
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    return () => {
      // 清理
      root.style.height = "";
      document.body.style.height = "";
      document.body.style.margin = "";
      document.body.style.overflow = "";
    };
  }, []);

  // 滚动到消息底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [taskData?.messages]);

  const handleSendMessage = () => {
    if (!input.trim() || !taskId) return;
    onSendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleActions = () => {
    setShowActions(!showActions);
  };

  const handleAttachmentClick = (attachment: any) => {
    console.log("点击附件:", attachment);

    // 如果是文本文件且没有URL，创建一个文本示例
    let fileContent = "";
    if (attachment.type === "text" || attachment.type === "file") {
      if (!attachment.url) {
        fileContent = `// 这是 ${attachment.name} 的示例内容\n\n// 文件类型: ${attachment.type}\n// 文件大小: ${attachment.size}\n\n/* 这是一个示例文件，显示了Monaco编辑器的功能 */\n\nfunction example() {\n  console.log("Hello, world!");\n  return true;\n}\n`;
      }
    }

    // 触发自定义事件通知操作面板
    const event = new CustomEvent("viewFile", {
      detail: {
        fileName: attachment.name,
        fileType: attachment.type,
        fileUrl: attachment.url || "",
        fileContent: fileContent,
      },
    });
    window.dispatchEvent(event);

    // 更新本地状态
    setViewingFile({
      viewing: true,
      name: attachment.name,
      type: attachment.type,
      url: attachment.url || "",
    });
  };

  // 如果没有任务数据，显示加载状态
  if (loading && !taskData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#f8f8f7]">
        <p className="text-manus-text">正在加载...</p>
      </div>
    );
  }

  // 如果有错误，显示错误状态
  if (error && !loading && !taskData) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#f8f8f7]">
        <p className="text-red-500">{error}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          重试
        </Button>
      </div>
    );
  }

  // 添加在组件内部
  const getDetailText = (op: Operation) => {
    switch (op.type) {
      case "search":
        return op.content || "搜索";
      case "browse":
        return op.url || "浏览网页";
      case "file":
      case "edit":
        return op.fileName ? `文件: ${op.fileName}` : "文件操作";
      case "terminal":
        return op.data?.command || op.content || "终端命令";
      default:
        return op.content || "操作";
    }
  };

  // 渲染消息和操作的主函数
  const renderTimelineItems = () => {
    if (!taskData?.timeline || taskData.timeline.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-center">
            <h3 className="text-lg font-medium text-manus-text mb-2">
              开始新的对话
            </h3>
            <p className="text-sm text-manus-text-secondary mb-6">
              输入您的问题或指令，AI Staff 将为您提供帮助
            </p>
          </div>
        </div>
      );
    }

    // 类型安全地排序时间轴
    const sortedTimeline = [...taskData.timeline].sort(
      (a, b) => a.sequence_number - b.sequence_number
    );
    
    // 输出排序后的时间轴
    // console.log("Sorted timeline:", sortedTimeline);

    return sortedTimeline.map((item, index) => {
      // 用户消息
      if (item.element_type === "message" && item.sender === "user") {
        return (
          <div key={item.id} className="animate-in mb-4 flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-manus-text shadow-sm">
              {item.content}
            </div>
          </div>
        );
      }
      
      // 助手消息
      else if (item.element_type === "message" && item.sender === "assistant") {
        return (
          <div key={item.id} className="animate-in mb-4 flex justify-start">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-50 p-3 text-sm text-manus-text shadow-sm">
              {item.content}
            </div>
          </div>
        );
      }
      
      // 步骤
      else if (item.element_type === "step") {
        const step = taskData.stages.find(s => s.id === item.id);
        if (!step) return null;
        
        // 检查下一个元素是否也是步骤
        const nextItem = index < sortedTimeline.length - 1 ? sortedTimeline[index + 1] : null;
        const hasNextStep = nextItem && nextItem.element_type === "step";
        
        // console.log(`Step ${item.id}, nextItem:`, nextItem, `hasNextStep:`, hasNextStep);
        
        return (
          <div key={item.id} className="relative mt-2 mb-4">
            {/* 步骤垂直连接线 */}
            {hasNextStep && (
              <div className="absolute left-2.5 top-7 h-full w-0 border-l-2 border-dashed border-black -ml-px"></div>
            )}
            
            {/* 标题和折叠按钮 */}
            <div className="flex items-center py-2 relative z-10">
              <div
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                  step.status === "completed"
                    ? "bg-blue-100 text-blue-500"
                    : "bg-gray-200 text-manus-text-secondary"
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="flex items-center ml-1">
                <span className="text-sm font-medium text-manus-text">
                  {step.title}
                </span>

                {/* 折叠/展开按钮 */}
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded-full text-manus-text-secondary hover:bg-[#f8f8f7] ml-1"
                  onClick={() => {
                    const stagesVisibility = { ...stagesVisible };
                    stagesVisibility[step.id] = !stagesVisibility[step.id];
                    setStagesVisible(stagesVisibility);
                  }}
                >
                  {stagesVisible[step.id] ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M7 14l5-5 5 5H7z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M7 10l5 5 5-5H7z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 步骤内容 - 可折叠 */}
            {stagesVisible[step.id] && step.operations && step.operations.length > 0 && (
              <div className="ml-7 space-y-3 py-2">
                {step.operations.map((op) => (
                  <div key={op.id} className="space-y-1">
                    {/* 操作说明 */}
                    <div className="text-sm text-manus-text-secondary pl-2 font-medium">
                      {op.type === "search" && "搜索内容"}
                      {op.type === "browse" && "浏览网页"}
                      {op.type === "edit" && "编辑内容"}
                      {op.type === "terminal" && "终端命令"}
                      {/* 使用安全的类型检查 */}
                      {(op.type as string) === "action" && "执行操作"}
                    </div>

                    {/* 操作内容 */}
                    <div className="flex items-center gap-2 rounded-md bg-[#f8f8f7] p-2 shadow-sm">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-manus-text-secondary">
                        {/* 图标根据操作类型显示 */}
                        {op.type === "search" && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                        {op.type === "browse" && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M2 12H22M12 2C14.5013 4.73835 15.9228 8.29203 16 12C15.9228 15.708 14.5013 19.2616 12 22C9.49872 19.2616 8.07725 15.708 8 12C8.07725 8.29203 9.49872 4.73835 12 2Z"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                        {op.type === "edit" && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25Z"
                              fill="currentColor"
                            />
                            <path
                              d="M20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                        {op.type === "terminal" && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM5 12L7 10L5 8L6 7L9 10L6 13L5 12ZM16 15H10V13H16V15Z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                        {/* 使用安全的类型检查 */}
                        {(op.type as string) === "action" && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
                              fill="currentColor"
                            />
                            <path
                              d="M12 11L16 15H13V19H11V15H8L12 11Z"
                              fill="currentColor"
                            />
                            <path
                              d="M12 13L8 9H11V5H13V9H16L12 13Z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        className="text-xs text-manus-text-secondary truncate whitespace-nowrap overflow-hidden"
                        title={op.content || op.url || (op as any).file_name || op.fileName || "操作"}
                      >
                        {op.type === "edit" || op.type === "file" 
                          ? `编辑: ${(op as any).file_name || op.fileName || "未命名文件"}` 
                          : (op.content || op.url || (op as any).file_name || op.fileName || "操作")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      
      return null;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f8f7] overflow-hidden">
      {/* 头部标题  */}
      <div className="flex-none h-12 flex items-center border-b border-manus-border px-4">
        <h1 className="text-base font-medium text-manus-text">
          {!taskId ? "新对话" : taskData?.title || "加载中..."}
        </h1>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto relative" ref={contentRef}>
        <div className="mx-auto max-w-3xl space-y-6 p-4">
          {renderTimelineItems()}

          {showActions && <ChatActions taskId={taskId} />}

          {/* 任务完成状态提示 */}
          {taskData?.metadata.status === "completed" && (
            <div className="flex items-center justify-center gap-2 py-2 px-4 mx-auto my-4 bg-green-50 text-green-600 rounded-full max-w-max">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor" />
              </svg>
              <span className="text-sm font-medium">
               已完成当前任务
              </span>
            </div>
          )}

          {/* 增加底部间距，确保内容不被输入框遮挡 */}
          <div ref={messagesEndRef} className="h-20" />
        </div>
      </div>

      {/* 输入框 - 使用复杂布局设计 */}
      <div className="pb-3 relative bg-[#f8f8f7]">
        <div className="flex flex-col gap-3 rounded-[22px] transition-all relative bg-white py-3 max-h-[300px] shadow-[0px_12px_32px_0px_rgba(0,0,0,0.02)] border border-black/8 dark:border-manus-border">
          {/* 附件预览区域 - 可水平滚动 */}
          {attachments && attachments.length > 0 && (
            <div className="w-full relative rounded-md overflow-hidden flex-shrink-0 pb-3 -mb-3">
              {/* 左侧渐变遮罩和向左滚动按钮 - 仅在有溢出时显示 */}
              {attachments.length > 2 && (
                <div
                  className="absolute top-0 bottom-0 left-0 z-10 flex h-full items-center gap-2.5 px-3 cursor-pointer"
                  onClick={() =>
                    document
                      .getElementById("attachments-scroll")
                      ?.scrollBy(-300, 0)
                  }
                  style={{
                    backgroundImage:
                      "linear-gradient(270deg, rgba(255,255,255,0) 0%, #ffffff 100%)",
                  }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white overflow-hidden cursor-pointer hover:bg-gray-50 shadow-[0_0_1.25px_0_rgba(0,0,0,0.1),0_5px_16px_0_rgba(0,0,0,0.1)] backdrop-blur-[40px]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6"></path>
                    </svg>
                  </div>
                </div>
              )}

              {/* 附件横向滚动区域 */}
              <div
                id="attachments-scroll"
                className="w-full overflow-y-hidden overflow-x-auto scrollbar-hide pb-[10px] -mb-[10px] pl-4 pr-2 flex"
              >
                <div className="flex gap-3">
                  {/* 这里可以根据实际上传的附件动态生成 */}
                  {attachments.map((attachment, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 p-2 pr-2.5 w-[280px] rounded-[10px] bg-gray-50 group/attach relative overflow-hidden cursor-pointer hover:bg-[#f8f8f7]"
                      onClick={() => handleAttachmentClick(attachment)}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-md">
                        {attachment.type === "image" ? (
                          <img
                            alt={attachment.name}
                            className="object-cover w-full h-full border border-gray-200 rounded-md"
                            src={attachment.url}
                          />
                        ) : (
                          <div className="relative flex items-center justify-center">
                            <svg
                              width="32"
                              height="32"
                              viewBox="0 0 32 32"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M3.55566 26.8889C3.55566 28.6071 4.94856 30 6.66678 30H25.3334C27.0517 30 28.4446 28.6071 28.4446 26.8889V9.77778L20.6668 2H6.66678C4.94856 2 3.55566 3.39289 3.55566 5.11111V26.8889Z"
                                fill="#4D81E8"
                              ></path>
                              <path
                                d="M20.6685 6.66647C20.6685 8.38469 22.0613 9.77759 23.7796 9.77759H28.4462L20.6685 1.99981V6.66647Z"
                                fill="#9CC3F4"
                              ></path>
                              <path
                                opacity="0.9"
                                d="M10.1685 18.2363H21.8351"
                                stroke="white"
                                strokeWidth="1.75"
                                strokeLinecap="square"
                                strokeLinejoin="round"
                              ></path>
                              <path
                                opacity="0.9"
                                d="M10.1685 14.3472H12.1129"
                                stroke="white"
                                strokeWidth="1.75"
                                strokeLinecap="square"
                                strokeLinejoin="round"
                              ></path>
                              <path
                                opacity="0.9"
                                d="M15.0293 14.3472H16.9737"
                                stroke="white"
                                strokeWidth="1.75"
                                strokeLinecap="square"
                                strokeLinejoin="round"
                              ></path>
                              <path
                                opacity="0.9"
                                d="M10.1685 21.8333H21.8351"
                                stroke="white"
                                strokeWidth="1.75"
                                strokeLinecap="square"
                                strokeLinejoin="round"
                              ></path>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex-1 min-w-0 flex items-center">
                          <div className="text-sm text-manus-text text-ellipsis overflow-hidden whitespace-nowrap flex-1 min-w-0">
                            {attachment.name}
                          </div>
                          <button
                            className="hidden group-hover/attach:flex rounded-full p-[2px] bg-gray-500 transition-all duration-200 hover:opacity-85"
                            onClick={(e) => {
                              e.stopPropagation();
                              // 从附件列表中移除
                              setAttachments((prev) =>
                                prev.filter((_, i) => i !== index)
                              );
                            }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-white"
                            >
                              <path d="M18 6 6 18"></path>
                              <path d="m6 6 12 12"></path>
                            </svg>
                          </button>
                        </div>
                        <div className="text-xs text-manus-text-secondary">
                          {attachment.type === "image" ? "图片" : "文本"} ·{" "}
                          {attachment.size}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 右侧渐变遮罩和向右滚动按钮 - 仅在有溢出时显示 */}
              {attachments.length > 2 && (
                <div
                  className="absolute top-0 bottom-0 right-0 z-10 flex h-full items-center gap-2.5 px-3 cursor-pointer"
                  onClick={() =>
                    document
                      .getElementById("attachments-scroll")
                      ?.scrollBy(300, 0)
                  }
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(255,255,255,0) 0%, #ffffff 100%)",
                  }}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white overflow-hidden cursor-pointer hover:bg-gray-50 shadow-[0_0_1.25px_0_rgba(0,0,0,0.1),0_5px_16px_0_rgba(0,0,0,0.1)] backdrop-blur-[40px]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6"></path>
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 文本输入区域 - 增加默认高度 */}
          <div className="overflow-y-auto pl-4 pr-2 max-h-[250px]">
            <textarea
              className="flex rounded-md border-input focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 overflow-auto flex-1 bg-transparent p-0 pt-[1px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-full placeholder:text-manus-text-secondary text-[15px] shadow-none resize-none min-h-[60px]"
              rows={3}
              placeholder="向 AI Staff 发送消息"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // 自动调整高度
                e.target.style.height = "auto";
                e.target.style.height = `${Math.max(
                  60,
                  Math.min(e.target.scrollHeight, 220)
                )}px`;
              }}
              onKeyDown={handleKeyDown}
              style={{
                height: input
                  ? `${Math.max(
                      60,
                      Math.min(input.split("\n").length * 24 + 36, 220)
                    )}px`
                  : "60px",
              }}
            />
          </div>

          {/* 底部工具栏 */}
          <footer className="flex flex-row justify-between w-full px-3">
            {/* 左侧附件按钮 */}
            <div className="flex gap-2 pe-2 items-center">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const file = e.target.files[0];
                    const newAttachment = {
                      name: file.name,
                      type: file.type.startsWith("image/")
                        ? ("image" as const)
                        : ("file" as const),
                      size: `${(file.size / 1024).toFixed(2)} KB`,
                      url: file.type.startsWith("image/")
                        ? URL.createObjectURL(file)
                        : undefined,
                    };

                    setAttachments((prev) => [...prev, newAttachment]);
                    e.target.value = "";
                  }
                }}
                multiple={false}
              />
              <button
                className="rounded-full border border-manus-border inline-flex items-center justify-center gap-1 cursor-pointer text-xs text-manus-text-secondary hover:bg-[#f8f8f7] w-8 h-8 p-0"
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.234 20.252 21 12.3"></path>
                  <path d="m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486"></path>
                </svg>
              </button>
            </div>

            {/* 中间字数统计 */}
            <div className="ml-0 mr-auto inline-flex items-center text-xs font-normal leading-none text-manus-text-secondary">
              {input.length > 800 ? (
                <span className="text-red-500">{input.length}</span>
              ) : (
                <span>{input.length}</span>
              )}
              /1000
            </div>

            {/* 右侧发送按钮 */}
            <div className="flex gap-2">
              <button
                className={`whitespace-nowrap text-sm font-medium focus-visible:outline-none p-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  !input.trim() && attachments.length === 0
                    ? "cursor-not-allowed bg-[#f8f8f7] text-gray-400"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
                onClick={handleSendMessage}
                disabled={!input.trim() && attachments.length === 0}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
