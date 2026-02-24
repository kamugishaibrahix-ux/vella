"use client";

import { motion } from "framer-motion";

export type FrictionData = {
  recurringLoops: string[];
  distortions: string[];
  contradictions: boolean | string[];
};

type FrictionBlockProps = {
  data: FrictionData;
};

export function FrictionBlock({ data }: FrictionBlockProps) {
  const hasLoops = data.recurringLoops.length > 0;
  const hasDistortions = data.distortions.length > 0;
  const contradictionMessages = Array.isArray(data.contradictions)
    ? data.contradictions
    : data.contradictions
      ? ["Active contradiction detected."]
      : [];
  const hasAny = hasLoops || hasDistortions || contradictionMessages.length > 0;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold tracking-tight text-vella-text">Friction</h2>
      {!hasAny ? (
        <p className="text-sm text-vella-muted">No friction signals.</p>
      ) : (
        <div className="space-y-4">
          {hasLoops && (
            <div className="flex flex-wrap gap-2">
              {data.recurringLoops.map((loop) => (
                <span
                  key={loop}
                  className="rounded bg-vella-accent-soft/30 px-2.5 py-1 text-xs font-medium text-vella-text"
                >
                  {loop}
                </span>
              ))}
            </div>
          )}
          {hasDistortions && (
            <ul className="list-inside list-disc space-y-1 text-sm text-vella-muted">
              {data.distortions.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {contradictionMessages.length > 0 && (
            <div className="space-y-1">
              {contradictionMessages.map((msg) => (
                <p key={msg} className="text-sm text-vella-muted">
                  {msg}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
