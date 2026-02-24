"use client";

import { Fragment } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const actions = [
  "View user details",
  "Adjust subscription",
  "Cancel subscription",
  "Add tokens",
  "Disable user",
  "Reinstate user",
];

export function EventActionsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent/20"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-xl border border-border/40 bg-card/60 p-1 text-sm shadow-lg backdrop-blur-sm"
      >
        {actions.map((action, index) => (
          <Fragment key={action}>
            <DropdownMenuItem className="rounded-lg text-foreground transition hover:bg-accent/10">
              {action}
            </DropdownMenuItem>
            {index === 2 && (
              <DropdownMenuSeparator className="my-1 bg-border/40" />
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


