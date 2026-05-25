import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:   "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-rose-500/30 bg-rose-500/15 text-rose-300",
        outline:     "border-glass text-foreground/85",
        success:     "border-green-500/30 bg-green-500/12 text-green-300",
        warning:     "border-amber-500/30 bg-amber-500/12 text-amber-300",
        muted:       "border-glass bg-glass text-muted-foreground",
        copper:      "border-copper/30 bg-copper/12 text-copper",
        teal:        "border-ttteal/30 bg-ttteal/12 text-ttteal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
