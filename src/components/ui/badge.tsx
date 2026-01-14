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
          "border-transparent bg-aurora-red/20 text-aurora-red hover:bg-aurora-red/30",
        outline: "text-foreground border-border/50",
        // Aurora color variants for status
        frost:
          "border-transparent bg-frost/20 text-frost hover:bg-frost/30",
        success:
          "border-transparent bg-aurora-green/20 text-aurora-green hover:bg-aurora-green/30",
        warning:
          "border-transparent bg-aurora-yellow/20 text-aurora-yellow hover:bg-aurora-yellow/30",
        info:
          "border-transparent bg-aurora-purple/20 text-aurora-purple hover:bg-aurora-purple/30",
        pending:
          "border-transparent bg-muted text-muted-foreground",
        running:
          "border-transparent bg-frost/20 text-frost animate-pulse",
        completed:
          "border-transparent bg-aurora-green/20 text-aurora-green",
        error:
          "border-transparent bg-aurora-red/20 text-aurora-red",
        paused:
          "border-transparent bg-aurora-yellow/20 text-aurora-yellow",
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
