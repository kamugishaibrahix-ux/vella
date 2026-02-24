"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "active" | "paused" | "trial" | "warning";

type CLTableProps<T extends Record<string, any>> = {
  columns: { key: keyof T; label: string }[];
  data: T[];
  renderStatus?: (value: Status) => React.ReactNode;
};

function statusBadge(status: Status) {
  const styles: Record<Status, string> = {
    active: "bg-emerald-500/20 text-emerald-400",
    paused: "bg-amber-500/20 text-amber-400",
    trial: "bg-indigo-500/20 text-indigo-400",
    warning: "bg-amber-500/20 text-amber-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function CLTable<T extends Record<string, any>>({
  columns,
  data,
  renderStatus,
}: CLTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/30 text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((column) => (
              <TableHead key={String(column.key)} className="bg-card/20 font-semibold">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={String(row[columns[0].key])}
              className="border-b border-border/30 text-sm text-foreground transition hover:bg-accent/5"
            >
              {columns.map((column) => {
                const value = row[column.key];
                if (column.key === "status") {
                  return (
                    <TableCell key={String(column.key)}>
                      {renderStatus ? renderStatus(value) : statusBadge(value)}
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={String(column.key)}>
                    <span className={column.key === "endpoint" ? "font-mono text-xs" : ""}>
                      {value}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


