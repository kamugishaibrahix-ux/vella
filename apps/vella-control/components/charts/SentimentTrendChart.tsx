"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Sparkles } from "lucide-react";
import { BaseCard } from "./BaseCard";

const sentimentData = [
  { day: "Mon", score: 61 },
  { day: "Tue", score: 64 },
  { day: "Wed", score: 63 },
  { day: "Thu", score: 67 },
  { day: "Fri", score: 66 },
  { day: "Sat", score: 62 },
  { day: "Sun", score: 65 },
];

export function SentimentTrendChart() {
  return (
    <BaseCard
      title="Sentiment & Mood Trend"
      subtitle="Rolling 7-day sentiment index across all sessions"
      icon={<Sparkles className="h-4 w-4 text-sky-400" />}
      footer="Average mood index holds at 63. Low-sentiment dips correlate with late-evening voice sessions."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sentimentData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="sentimentStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
              <stop offset="50%" stopColor="#a855f7" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.95} />
            </linearGradient>
            <linearGradient id="sentimentFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
              <stop offset="40%" stopColor="rgba(129,140,248,0.25)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="rgba(148,163,184,0.18)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(148,163,184,0.9)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={30}
            tick={{ fill: "rgba(148,163,184,0.9)", fontSize: 11 }}
            domain={[56, 72]}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(148,163,184,0.4)",
              borderRadius: "0.9rem",
              padding: "8px 10px",
            }}
            labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
            itemStyle={{ color: "#bae6fd", fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="url(#sentimentStroke)"
            strokeWidth={2.6}
            dot={false}
            activeDot={{
              r: 5,
              stroke: "#0ea5e9",
              strokeWidth: 2,
              fill: "#020617",
            }}
            fill="url(#sentimentFill)"
          />
        </LineChart>
      </ResponsiveContainer>
    </BaseCard>
  );
}


