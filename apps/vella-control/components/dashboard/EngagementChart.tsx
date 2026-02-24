"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

type EngagementChartData = Array<{
  date: string;
  tokens: number;
  feedback: number;
  sessions: number;
}>;

type EngagementChartProps = {
  data: EngagementChartData;
};

export function EngagementChart({ data }: EngagementChartProps) {
  // Format data for chart - use sessions as primary metric
  const chartData = data.map((item) => {
    const date = new Date(item.date);
    const dayLabel = date.toLocaleDateString(undefined, { weekday: "short" });
    return {
      label: dayLabel,
      value: item.sessions,
      tokens: item.tokens,
      feedback: item.feedback,
    };
  });

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
        No engagement data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="engagementFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "rgba(226,232,240,0.6)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ stroke: "rgba(226,232,240,0.25)", strokeWidth: 1 }}
          contentStyle={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: "12px",
            padding: "10px 12px",
          }}
          labelStyle={{ color: "#e2e8f0" }}
          itemStyle={{ color: "#c4b5fd" }}
          formatter={(value: number) => [value.toLocaleString(), "Sessions"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#engagementFill)"
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#818cf8"
          strokeWidth={1.5}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}


