import type React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode
  label: string
}

export function ActionButton({ icon, label, className, ...props }: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border-manus-border bg-white px-3 text-xs font-normal text-manus-text hover:bg-gray-50",
        className,
      )}
      {...props}
    >
      {icon && <span className="text-manus-text-secondary">{icon}</span>}
      {label}
    </Button>
  )
}
