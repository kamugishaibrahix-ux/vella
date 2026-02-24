"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { BaseCard } from "./BaseCard";

const volumeData = [
  { day: "Mon", sessions: 820 },
  { day: "Tue", sessions: 940 },
  { day: "Wed", sessions: 1010 },
  { day: "Thu", sessions: 980 },
  { day: "Fri", sessions: 1130 },
  { day: "Sat", sessions: 760 },
  { day: "Sun", sessions: 690 },
];

export function ConversationVolumeChart() {
  return (
    <BaseCard
      title="Conversation Volume"
      subtitle="Daily text + voice sessions"
      icon={<Activity className="h-4 w-4 text-emerald-400" />}
      footer="Volume spikes on Fridays; weekend usage leans heavier toward voice sessions."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={volumeData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid
            stroke="rgba(30,64,175,0.35)"
            strokeDasharray="4 4"
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
            width={38}
            tick={{ fill: "rgba(148,163,184,0.9)", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.6)" }}
            contentStyle={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(56,189,248,0.5)",
              borderRadius: "0.9rem",
              padding: "8px 10px",
            }}
            labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
            itemStyle={{ color: "#bbf7d0", fontSize: 12 }}
          />
          <defs>
            <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.95} />
              <stop offset="60%" stopColor="#22c55e" stopOpacity={0.8} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <Bar dataKey="sessions" radius={[8, 8, 3, 3]} fill="url(#volumeFill)" />
        </BarChart>
      </ResponsiveContainer>
    </BaseCard>
  );
}


