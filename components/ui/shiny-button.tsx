import type React from "react"
import { cn } from "@/lib/utils"

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

export function ShinyButton({ children, className, ...props }: ShinyButtonProps) {
  return (
    <button className={cn("shiny-cta", className)} {...props}>
      <span>{children}</span>
    </button>
  )
}
