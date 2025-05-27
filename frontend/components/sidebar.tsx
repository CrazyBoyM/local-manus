"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Book, Globe, BookOpen, Command, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

// 更新Task接口以匹配API返回格式
interface Task {
  id: string
  title: string
  status: string // 例如 running, completed, failed, queued
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

// 用于显示的任务类型，包含UI相关属性
interface UITask {
  id: string
  title: string
  time: string
  status?: string
  icon: string
}

interface SidebarProps {
  tasks: UITask[]
  loading: boolean
  error: string | null
  onSelectTask: (taskId: string) => void
  selectedTask: string | null
  isOpen: boolean
  onToggle: () => void
  onCreateTask: () => void
}

export function Sidebar({ 
  tasks, 
  loading, 
  error, 
  onSelectTask, 
  selectedTask, 
  isOpen, 
  onToggle, 
  onCreateTask 
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)

  // 根据icon字符串返回对应的图标组件
  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'book-open':
        return <BookOpen className="h-5 w-5 text-gray-700" />
      case 'globe':
        return <Globe className="h-5 w-5 text-gray-700" />
      case 'book':
      default:
        return <Book className="h-5 w-5 text-gray-700" />
    }
  }

  const filteredTasks = tasks.filter((task) => 
    (task.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  )
  

  // 处理新建任务的快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onCreateTask()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onCreateTask])

  if (!isOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center bg-[#ebebeb] py-3">
        <Button variant="ghost" size="icon" className="mb-4 h-8 w-8 text-gray-500" onClick={onToggle}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <div className="flex flex-col items-center gap-4">
          {tasks.map((task) => (
            <Button
              key={task.id}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-full", selectedTask === task.id ? "bg-gray-200" : "")}
              onClick={() => onSelectTask(task.id)}
            >
              {getIconComponent(task.icon)}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#ebebeb]">
      {/* 头部 */}
      <div className="flex h-14 items-center justify-between px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={onToggle}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" onClick={() => {}}>
          <Search className="h-5 w-5" />
        </Button>
      </div>

      {/* 新建任务按钮 */}
      <div className="px-4 pb-3">
        <Button
          className="w-full justify-between gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 h-10 rounded-xl text-sm font-normal"
          variant="outline"
          onClick={onCreateTask}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>新建任务</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </Button>
      </div>

      {/* 搜索栏 - 仅在聚焦或内容时显示 */}
      {(searchFocused || searchQuery) && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索"
              className="pl-9 h-9 border-gray-200 bg-white text-sm rounded-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* 任务列表 - 加载状态 */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">正在加载任务...</p>
        </div>
      )}

      {/* 任务列表 - 错误状态 */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* 任务列表 - 内容 */}
      {!loading && !error && (
        <div className="flex-1 overflow-y-auto px-4">
          {filteredTasks.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500">未找到任务</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "mb-2 rounded-xl p-3 cursor-pointer",
                  selectedTask === task.id ? "bg-white shadow-sm" : "hover:bg-white/60",
                )}
                onClick={() => onSelectTask(task.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                    {getIconComponent(task.icon)}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <h3 className="text-sm font-medium text-gray-800">{task.title}</h3>
                    {task.status && <p className="text-xs text-gray-500 line-clamp-1">{task.status}</p>}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">{task.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
