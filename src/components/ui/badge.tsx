import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/20 text-primary hover:bg-primary/30",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-status-error/20 text-status-error hover:bg-status-error/30",
        outline: "text-foreground border-border/50",
        // AGC color variants for status
        frost:
          "border-transparent bg-agc-gold/20 text-agc-gold hover:bg-agc-gold/30",
        success:
          "border-transparent bg-status-success/20 text-status-success hover:bg-status-success/30",
        warning:
          "border-transparent bg-status-warning/20 text-status-warning hover:bg-status-warning/30",
        info:
          "border-transparent bg-status-info/20 text-status-info hover:bg-status-info/30",
        pending:
          "border-transparent bg-muted text-muted-foreground",
        running:
          "border-transparent bg-agc-gold/20 text-agc-gold animate-pulse",
        completed:
          "border-transparent bg-status-success/20 text-status-success",
        error:
          "border-transparent bg-status-error/20 text-status-error",
        paused:
          "border-transparent bg-status-warning/20 text-status-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
