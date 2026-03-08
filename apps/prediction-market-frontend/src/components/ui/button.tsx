import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[calc(var(--radius)+999px)] border text-sm font-medium whitespace-nowrap tracking-[0.01em] transition-[background-color,border-color,color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-primary/26 hover:bg-[#f6eadb] hover:shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)]",
        accent:
          "border-accent/20 bg-accent text-accent-foreground shadow-[0_10px_24px_rgba(195,146,110,0.16),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-accent/28 hover:bg-[#ca9974] hover:shadow-[0_12px_28px_rgba(195,146,110,0.2)] focus-visible:ring-accent/30",
        destructive:
          "border-destructive/25 bg-destructive text-white hover:border-destructive/35 hover:bg-destructive/94 hover:shadow-[0_12px_28px_rgba(179,87,71,0.18)] focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border-border bg-background/90 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-accent/34 hover:bg-secondary/88 hover:text-foreground hover:shadow-[0_10px_22px_rgba(0,0,0,0.12)] dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-border hover:bg-secondary/92 hover:shadow-[0_10px_22px_rgba(0,0,0,0.12)]",
        ghost:
          "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-accent/50",
        link: "border-transparent p-0 text-muted-foreground underline-offset-4 hover:text-accent hover:underline",
        yes: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/20",
        no: "border-rose-500/25 bg-rose-500/10 text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/20",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-5",
        icon: "size-10 rounded-full",
        "icon-xs": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
