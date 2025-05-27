"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Play, Pause} from "lucide-react"
import { SearchOperation } from "./operation-components/search-operation"
import { BrowseOperation } from "./operation-components/browse-operation"
import { EditOperation } from "./operation-components/edit-operation"
import { TerminalOperation } from "./operation-components/terminal-operation"
import { AttachmentViewer } from "./attachment-viewer"
import {
  OperationStep,
  OperationSubStep,
  SearchOperationDataResponse,
  BrowseOperationDataResponse,
  EditOperationDataResponse,
  TerminalOperationDataResponse,
  ActionOperationDataResponse,
  MessageOperationDataResponse,
  SearchResultItemResponse
} from "@/types"

interface OperationPanelProps {
  taskId: string | null;
  operationSteps: OperationStep[];
  loading: boolean;
}

export function OperationPanel({ taskId, operationSteps, loading }: OperationPanelProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [currentSubStep, setCurrentSubStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [viewingFile, setViewingFile] = useState<{
    viewing: boolean;
    fileName: string;
    fileType: string;
    fileUrl?: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // **重置当前步骤索引，当 operationSteps 变化时**
  useEffect(() => {
    // 当 operationSteps 更新时，确保索引在有效范围内
    if (operationSteps.length > 0) {
      if (currentStep >= operationSteps.length) {
        setCurrentStep(operationSteps.length - 1);
      }
      const currentStepData = operationSteps[currentStep];
      if (currentStepData && currentSubStep >= currentStepData.subSteps.length) {
        setCurrentSubStep(Math.max(0, currentStepData.subSteps.length - 1));
      }
    } else {
      setCurrentStep(0);
      setCurrentSubStep(0);
    }
  }, [operationSteps, currentStep, currentSubStep]);

  // 监听文件查看事件
  useEffect(() => {
    const handleViewFile = (event: CustomEvent) => {
      console.log("接收到文件查看事件:", event.detail);
      if (event.detail) {
        const { fileName, fileType, fileUrl } = event.detail;
        setViewingFile({
          viewing: true,
          fileName: fileName || "未命名文件",
          fileType: fileType || "text",
          fileUrl: fileUrl || ""
        });
      }
    };

    window.addEventListener('viewFile', handleViewFile as EventListener);
    return () => {
      window.removeEventListener('viewFile', handleViewFile as EventListener);
    };
  }, []);

  const nextStep = () => {
    const currentStepData = operationSteps[currentStep]
    if (currentSubStep < currentStepData.subSteps.length - 1) {
      setCurrentSubStep(currentSubStep + 1)
    } else if (currentStep < operationSteps.length - 1) {
      setCurrentStep(currentStep + 1)
      setCurrentSubStep(0)
    }
  }

  const prevStep = () => {
    if (currentSubStep > 0) {
      setCurrentSubStep(currentSubStep - 1)
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      const prevStepSubSteps = operationSteps[currentStep - 1].subSteps
      setCurrentSubStep(prevStepSubSteps.length - 1)
    }
  }

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }
  
  // **自动播放逻辑**
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying) {
      interval = setInterval(() => {
        const currentStepData = operationSteps[currentStep]
        if (!currentStepData) return

        if (currentSubStep < currentStepData.subSteps.length - 1) {
          setCurrentSubStep((prev) => prev + 1)
        } else if (currentStep < operationSteps.length - 1) {
          setCurrentStep((prev) => prev + 1)
          setCurrentSubStep(0)
        } else {
          setIsPlaying(false)
        }
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [isPlaying, currentStep, currentSubStep, operationSteps])

  // 处理关闭文件查看器
  const handleCloseViewer = () => {
    console.log("关闭文件查看器");
    setViewingFile(null);
  }
  
  // 如果处于文件查看模式，返回文件查看组件
  if (viewingFile && viewingFile.viewing) {
    console.log("渲染文件查看器:", viewingFile);
    return (
      <div className="flex h-screen flex-col bg-white dark:bg-slate-900 overflow-hidden">
        <AttachmentViewer
          fileName={viewingFile.fileName}
          fileType={viewingFile.fileType}
          fileUrl={viewingFile.fileUrl}
          fileContent={viewingFile.fileType === 'text' ? "这是文件内容示例" : undefined}
          onClose={handleCloseViewer}
        />
      </div>
    );
  }

  // **处理新任务状态**
  if (taskId && taskId.startsWith("new-task")) {
    return (
      <div className="flex h-screen flex-col bg-[#f8f8f7]">
        <div className="flex h-12 items-center justify-between border-b border-manus-border px-4">
          <h2 className="text-base font-medium text-manus-text">AI Staff 的电脑</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md px-4">
            <p className="text-manus-text-secondary mb-2">
              开始新的对话，AI Staff 将在这里显示操作内容
            </p>
            <p className="text-xs text-manus-text-secondary">
              请在左侧输入指令以开始交互，AI 的操作将会显示在这里
            </p>
          </div>
        </div>
      </div>
    );
  }

  // **处理空状态或加载状态**
  if ((!taskId || taskId === "null" || taskId === "undefined") && operationSteps.length === 0) {
    return (
      <div className="flex h-screen flex-col bg-[#f8f8f7]">
        <div className="flex h-12 items-center justify-between border-b border-manus-border px-4">
          <h2 className="text-base font-medium text-manus-text">AI Staff 的电脑</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center max-w-md px-4">
            <p className="text-manus-text-secondary mb-2">
              {!taskId ? "请选择一个任务" : "开始新的对话，AI Staff 将在这里显示操作内容"}
            </p>
            <p className="text-xs text-manus-text-secondary">
              AI Staff 会在这里展示搜索、浏览和编辑等操作的详细内容
            </p>
          </div>
        </div>
      </div>
    );
  }

  // **处理加载中状态**
  if (loading || (taskId && operationSteps.length === 0)) {
    return (
      <div className="flex h-screen flex-col bg-[#f8f8f7]">
        <div className="flex h-12 items-center justify-between border-b border-manus-border px-4">
          <h2 className="text-base font-medium text-manus-text">AI Staff 的电脑</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-manus-text-secondary">
              {loading ? "正在加载操作内容..." : "暂无操作记录"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentStepData = operationSteps[currentStep]
  const currentSubStepData = currentStepData?.subSteps[currentSubStep]

  // **渲染操作内容**
  const renderOperationContent = () => {
    if (!currentSubStepData) return null

    switch (currentSubStepData.type) {
      case "search":
        const searchData = currentSubStepData.data as SearchOperationDataResponse | undefined;
        return (
          <SearchOperation 
            data={searchData} 
            query={currentSubStepData.content} 
          />
        );
      case "browse":
        const browseData = currentSubStepData.data as BrowseOperationDataResponse | undefined;
        return (
          <BrowseOperation 
            data={browseData} 
            url={currentSubStepData.url} 
          />
        );
      case "edit":
        const editData = currentSubStepData.data as EditOperationDataResponse | undefined;
        return (
          <EditOperation 
            data={editData} 
            fileName={currentSubStepData.fileName} 
          />
        );
      case "terminal":
        const terminalData = currentSubStepData.data as TerminalOperationDataResponse | undefined;
        return (
          <TerminalOperation 
            data={terminalData}
            content={currentSubStepData.content} 
          />
        );
      case "message":
      case "action":
      default:
        return (
          <div className="h-full flex items-center justify-center">
            <p className="text-manus-text-secondary">不支持的操作类型</p>
          </div>
        );
    }
  }

  // **拖动处理函数**
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleProgressBarClick(e);
    
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const progressBar = document.querySelector('.progress-bar-container');
    if (!progressBar) return;
    
    const rect = progressBar.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = offsetX / rect.width;
    
    updatePositionFromPercentage(percentage);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  // **提取共用的位置更新逻辑**
  const updatePositionFromPercentage = (percentage: number) => {
    const totalSubSteps = operationSteps.reduce((acc, step) => acc + step.subSteps.length, 0);
    const targetPosition = Math.floor(percentage * totalSubSteps);
    
    let targetStep = 0;
    let targetSubStep = 0;
    let currentCount = 0;
    
    for (let i = 0; i < operationSteps.length; i++) {
      if (currentCount + operationSteps[i].subSteps.length > targetPosition) {
        targetStep = i;
        targetSubStep = targetPosition - currentCount;
        break;
      }
      currentCount += operationSteps[i].subSteps.length;
    }
    
    setCurrentStep(targetStep);
    setCurrentSubStep(targetSubStep);
  };

  // **复用点击处理函数**
  const handleProgressBarClick = (e: React.MouseEvent) => {
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = offsetX / rect.width;
    
    updatePositionFromPercentage(percentage);
  };

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex h-12 items-center border-b border-gray-200 dark:border-gray-700 px-4">
        <h2 className="text-base font-medium text-gray-800 dark:text-gray-200">AI Staff 的电脑</h2>
      </div>

      {/* 操作内容区域 */}
      <div className="flex-1 overflow-hidden">
        {renderOperationContent()}
      </div>

      {/* 底部控制栏 */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500"
              onClick={prevStep}
              disabled={currentStep === 0 && currentSubStep === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500"
              onClick={nextStep}
              disabled={
                operationSteps.length === 0 ||
                (currentStep === operationSteps.length - 1 &&
                currentSubStep === operationSteps[operationSteps.length - 1]?.subSteps.length - 1)
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* 进度条 */}
        <div 
          className="h-1 rounded-full bg-[#f8f8f7] dark:bg-gray-800 relative cursor-pointer progress-bar-container"
          onClick={handleProgressBarClick}
          onMouseDown={handleDragStart}
        >
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{
              width: `${(() => {
                const totalSubSteps = operationSteps.reduce((acc, step) => acc + step.subSteps.length, 0);
                let currentPosition = 0;
                for (let i = 0; i < currentStep; i++) {
                  currentPosition += operationSteps[i].subSteps.length;
                }
                currentPosition += currentSubStep;
                
                if (currentStep === operationSteps.length - 1 && 
                    currentSubStep === operationSteps[operationSteps.length - 1].subSteps.length - 1) {
                  return 100;
                }
                
                return totalSubSteps > 0 ? (currentPosition / (totalSubSteps - 1)) * 100 : 0;
              })()}%`,
            }}
          ></div>
        </div>
        
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500 truncate max-w-[200px]">
              {currentStepData?.title || "AI Staff 正在工作"}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {currentSubStepData?.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
