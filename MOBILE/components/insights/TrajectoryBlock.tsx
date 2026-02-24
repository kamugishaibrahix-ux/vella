"use client";

import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";

export type TrajectoryData = {
  connectionDepth: number | string;
  progressIndex: number | string;
};

type MetricRowProps = {
  label: string;
  value: number | string;
};

function MetricRow({ label, value }: MetricRowProps) {
  const isNumber = typeof value === "number";
  const [display, setDisplay] = useState(isNumber ? 0 : value);
  useEffect(() => {
    if (typeof value !== "number") {
      setDisplay(value);
      return;
    }
    const ctrl = animate(0, value, {
      duration: 0.5,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => ctrl.stop();
  }, [value]);
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-vella-muted">{label}</span>
      <span className="text-sm font-medium text-vella-text">
        {typeof display === "number" ? display : String(display)}
      </span>
    </div>
  );
}

type TrajectoryBlockProps = {
  data: TrajectoryData;
};

export function TrajectoryBlock({ data }: TrajectoryBlockProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold tracking-tight text-vella-text">Trajectory</h2>
      <div className="space-y-0">
        <MetricRow label="Connection Depth" value={data.connectionDepth} />
        <MetricRow label="Progress Index" value={data.progressIndex} />
      </div>
    </motion.section>
  );
}
