import { ActionButton } from "./action-button"
import { FileText, CornerUpLeft, MousePointer, ChevronDown } from "lucide-react"

interface ChatActionsProps {
  taskId: string | null
}

export function ChatActions({ taskId }: ChatActionsProps) {
  const actions = [
    {
      id: "extract-text",
      label: "提取文本",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: "go-back",
      label: "返回上一步",
      icon: <CornerUpLeft className="h-4 w-4" />,
    },
    {
      id: "click-element",
      label: "点击元素",
      icon: <MousePointer className="h-4 w-4" />,
      description: "自由行 推荐-第一次去港澳必看攻略",
    },
    {
      id: "wait",
      label: "等待1秒",
      icon: <ChevronDown className="h-4 w-4" />,
    },
  ]

  return (
    <div className="space-y-2 py-2">
      {actions.map((action) => (
        <div key={action.id} className="flex items-center gap-2">
          <ActionButton icon={action.icon} label={action.label} />
          {action.description && <span className="text-xs text-gray-500">{action.description}</span>}
        </div>
      ))}
    </div>
  )
}
