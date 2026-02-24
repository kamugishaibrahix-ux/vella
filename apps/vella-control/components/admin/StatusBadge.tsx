import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "active"
  | "paused"
  | "cancelled"
  | "error"
  | "warning"
  | "info"
  | "trial";

type StatusBadgeProps = {
  status: Status;
};

const statusStyles: Record<Status, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-200 text-slate-700",
  error: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
  trial: "bg-violet-100 text-violet-700",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge className={cn("border-none capitalize", statusStyles[status])}>
      {status}
    </Badge>
  );
}


