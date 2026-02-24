"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Plan = {
  name: string;
  tokens: string;
  price: string;
};

export function PlanManageDrawer({ plan }: { plan: Plan }) {
  const [tokenAllowance, setTokenAllowance] = useState(plan.tokens);
  const [price, setPrice] = useState(plan.price);
  const [enabled, setEnabled] = useState(true);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          Manage
        </button>
      </SheetTrigger>
      <SheetContent className="w-full border-border/40 bg-background text-foreground sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{plan.name} controls</SheetTitle>
          <SheetDescription>
            Adjust allowances, pricing, and availability for this plan.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Monthly token allowance
            </label>
            <Input
              value={tokenAllowance}
              onChange={(event) => setTokenAllowance(event.target.value)}
              className="border-border/40 bg-background text-foreground"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Plan pricing
            </label>
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="border-border/40 bg-background text-foreground"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Plan enabled</p>
              <p className="text-xs text-muted-foreground">
                Disable to hide this plan from upgrade flows.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="border-border/40 text-foreground"
            >
              Cancel
            </Button>
          </SheetClose>
          <Button type="button">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


