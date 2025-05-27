import React from "react";

interface OperationContainerProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function OperationContainer({
  title,
  icon,
  children
}: OperationContainerProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 上部分：只显示标题和图标 */}
      <div className="bg-white dark:bg-slate-900 p-3 border-b border-gray-200 dark:border-gray-700 flex items-center">
        {icon && <div className="mr-2">{icon}</div>}
        <div className="truncate">
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{title}</h3>
        </div>
      </div>
      
      {/* 下部分：内容区域，铺满剩余空间 */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
} 