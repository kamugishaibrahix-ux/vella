"use client";

import { motion } from "framer-motion";

export type ConditionData = {
  recovery: string;
  discipline: string;
  focus: string;
  risk?: number | string;
  escalation?: number | string;
};

function formatState(s: string): string {
  if (!s || s === "na") return "—";
  return s.replace(/_/g, " ");
}

type PillarProps = {
  title: string;
  state: string;
};

function Pillar({ title, state }: PillarProps) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-xs uppercase tracking-wider text-vella-muted">{title}</span>
      <span className="mt-1 text-lg font-medium text-vella-text">{formatState(state)}</span>
      <span className="mt-1 block h-px w-8 bg-vella-accent-muted" aria-hidden />
    </div>
  );
}

type ConditionBlockProps = {
  data: ConditionData;
};

export function ConditionBlock({ data }: ConditionBlockProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-vella-text">Behavioural condition</h2>
      <div className="flex flex-row justify-between gap-4">
        <Pillar title="Recovery" state={data.recovery} />
        <Pillar title="Discipline" state={data.discipline} />
        <Pillar title="Focus" state={data.focus} />
      </div>
    </motion.section>
  );
}
