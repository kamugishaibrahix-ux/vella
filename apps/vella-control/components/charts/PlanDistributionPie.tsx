"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { BaseCard } from "./BaseCard";

const planData = [
  { name: "Free", value: 4268 },
  { name: "Pro", value: 2935 },
  { name: "Elite", value: 1012 },
];

const planColors = ["#38bdf8", "#a855f7", "#22c55e"];

export function PlanDistributionPie() {
  return (
    <BaseCard
      title="Plan Distribution"
      subtitle="Current user share by subscription tier"
      icon={<PieIcon className="h-4 w-4 text-violet-400" />}
      footer="Elite users are small in volume but drive a disproportionate share of token usage."
    >
      <div className="flex h-full flex-col gap-4 sm:flex-row">
        <div className="h-48 flex-1 sm:h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid rgba(148,163,184,0.5)",
                  borderRadius: "0.9rem",
                  padding: "8px 10px",
                }}
                labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
                itemStyle={{ fontSize: 12 }}
              />
              <Pie
                data={planData}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={3}
                stroke="rgba(15,23,42,1)"
                strokeWidth={2}
              >
                {planData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={planColors[index]}
                    className="transition-transform duration-200 hover:scale-105"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 text-xs text-slate-300">
          {planData.map((plan, index) => {
            const total = planData.reduce((acc, p) => acc + p.value, 0);
            const pct = Math.round((plan.value / total) * 100);
            return (
              <div key={plan.name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: planColors[index] }}
                  />
                  <span className="font-medium text-slate-100">{plan.name}</span>
                </div>
                <span className="tabular-nums text-slate-400">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </BaseCard>
  );
}


