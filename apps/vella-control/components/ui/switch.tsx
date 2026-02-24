"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-gray-600 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-indigo-500",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }

