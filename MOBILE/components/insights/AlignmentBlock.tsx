"use client";

import { motion } from "framer-motion";

export type AlignmentData = {
  alignedValues: string[];
  misalignedValues: string[];
};

type AlignmentBlockProps = {
  data: AlignmentData;
};

function formatValue(s: string): string {
  return s.replace(/_/g, " ");
}

export function AlignmentBlock({ data }: AlignmentBlockProps) {
  const hasAligned = data.alignedValues.length > 0;
  const hasMisaligned = data.misalignedValues.length > 0;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold tracking-tight text-vella-text">Alignment</h2>
      <div className="space-y-3">
        {hasMisaligned && (
          <div>
            <p className="text-xs uppercase tracking-wider text-vella-muted">Drifting</p>
            <p className="mt-1 text-sm text-vella-text">
              {data.misalignedValues.map(formatValue).join(", ")}
            </p>
          </div>
        )}
        {hasAligned && (
          <div>
            <p className="text-xs uppercase tracking-wider text-vella-muted">Reinforced</p>
            <p className="mt-1 text-sm text-vella-text">
              {data.alignedValues.map(formatValue).join(", ")}
            </p>
          </div>
        )}
        {!hasAligned && !hasMisaligned && (
          <p className="text-sm text-vella-muted">No alignment data.</p>
        )}
      </div>
    </motion.section>
  );
}
