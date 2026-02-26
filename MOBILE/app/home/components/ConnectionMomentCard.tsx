"use client";

export function ConnectionMomentCard({ line }: { line: string }) {
  return (
    <section
      className="rounded-vella-card p-5"
      style={{
        background: "var(--vella-accent-soft)",
        boxShadow: "none",
      }}
    >
      <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-2">
        Connection
      </p>
      <p className="text-sm leading-relaxed" style={{ color: "var(--vella-accent-muted)" }}>
        {line}
      </p>
    </section>
  );
}
