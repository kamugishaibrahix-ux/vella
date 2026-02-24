"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { Gauge } from "lucide-react";
import { BaseCard } from "./BaseCard";

const breakdownData = [
  { label: "Positive", value: 58 },
  { label: "Neutral", value: 28 },
  { label: "Negative", value: 14 },
];

const barColors: Record<string, string> = {
  Positive: "#22c55e",
  Neutral: "#38bdf8",
  Negative: "#f97373",
};

export function SentimentBreakdownBars() {
  return (
    <BaseCard
      title="Sentiment Breakdown"
      subtitle="Share of classified sessions"
      icon={<Gauge className="h-4 w-4 text-cyan-400" />}
      footer="Negative sessions remain below 15% and are stable week-over-week."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={breakdownData}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(148,163,184,0.95)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.7)" }}
            contentStyle={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(96,165,250,0.5)",
              borderRadius: "0.9rem",
              padding: "8px 10px",
            }}
            labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
            itemStyle={{ fontSize: 12 }}
          />
          <Bar
            dataKey="value"
            radius={[8, 8, 8, 8]}
            background={{ fill: "rgba(15,23,42,0.8)" }}
          >
            {breakdownData.map((entry) => (
              <Cell key={entry.label} fill={barColors[entry.label]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </BaseCard>
  );
}


