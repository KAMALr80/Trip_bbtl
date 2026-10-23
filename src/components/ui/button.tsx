import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold cursor-pointer transition-[transform,background-color,border-color,color,filter,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.97] motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "night-primary border-0 text-primary-foreground hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border-2 border-input bg-transparent text-foreground hover:border-blue hover:text-blue",
        secondary:
          "border-2 border-border bg-secondary text-secondary-foreground hover:border-blue",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        playful: "night-primary border-0 text-primary-foreground hover:brightness-110",
        green:
          "border-0 bg-neon-cool text-primary-foreground shadow-[0_0_0_2px_rgba(34,211,238,.9),0_6px_14px_rgba(34,211,238,.2)] hover:brightness-110",
        subtle: "border-2 border-border bg-secondary text-secondary-foreground hover:border-blue",
      },
      size: {
        default: "h-12 px-[18px] py-[13px]",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-14 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
