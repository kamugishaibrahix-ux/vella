"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMMITMENT_DOMAIN_CODES,
  CADENCE_TYPES,
  TARGET_TYPES,
  type CommitmentDomainCode,
  type CadenceType,
  type TargetType,
} from "@/lib/execution/types";
import { saveCommitmentLocal } from "@/lib/local/db/commitmentsLocalRepo";

const DOMAIN_LABELS: Record<CommitmentDomainCode, string> = {
  sleep: "Sleep",
  focus: "Focus",
  routine: "Routine",
  fitness: "Fitness",
  abstinence: "Abstinence",
  social: "Social",
  other: "Other",
};

const CADENCE_LABELS: Record<CadenceType, string> = {
  recurring: "Recurring",
  deadline: "One-time deadline",
};

const TARGET_LABELS: Record<TargetType, string> = {
  count: "Count",
  duration: "Duration (mins)",
  boolean: "Yes / No",
  completion: "Completion",
};

type FormState = {
  domain: CommitmentDomainCode;
  cadence: CadenceType;
  targetType: TargetType;
  targetValue: string;
  description: string;
  motivation: string;
};

const INITIAL: FormState = {
  domain: "routine",
  cadence: "recurring",
  targetType: "boolean",
  targetValue: "1",
  description: "",
  motivation: "",
};

export default function CreateCommitmentPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) {
      setError("Description is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const commitmentCode = `${form.domain}_${form.cadence}`;

      const res = await fetch("/api/commitments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitment_code: commitmentCode,
          subject_code: form.domain,
          target_type: form.targetType,
          target_value: Number(form.targetValue) || 1,
          cadence_type: form.cadence,
          start_at: now,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create commitment");
        return;
      }

      const data = await res.json();
      const commitmentId = data.id;

      // Store encrypted local text (description + motivation)
      try {
        const userId = "local"; // Will be replaced with real userId from auth context
        await saveCommitmentLocal(
          userId,
          commitmentId,
          form.description.trim(),
          form.motivation.trim() || null,
          null
        );
      } catch {
        // Local save failure is non-blocking
      }

      router.push("/commitments");
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-5 py-6 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1 -ml-1 pressable"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-vella-text" strokeWidth={1.8} />
        </button>
        <h1 className="text-xl font-semibold text-vella-text">New commitment</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Domain */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-vella-text">Domain</legend>
          <div className="flex flex-wrap gap-2">
            {COMMITMENT_DOMAIN_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => update("domain", code)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium border pressable transition-colors",
                  form.domain === code
                    ? "bg-[var(--vella-primary)] text-white border-[var(--vella-primary)]"
                    : "bg-vella-bg-card text-vella-text border-vella-border"
                )}
              >
                {DOMAIN_LABELS[code]}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Cadence */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-vella-text">Type</legend>
          <div className="flex gap-2">
            {CADENCE_TYPES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => update("cadence", code)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium border pressable transition-colors flex-1 text-center",
                  form.cadence === code
                    ? "bg-[var(--vella-primary)] text-white border-[var(--vella-primary)]"
                    : "bg-vella-bg-card text-vella-text border-vella-border"
                )}
              >
                {CADENCE_LABELS[code]}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Target */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-vella-text">Measure</label>
            <select
              value={form.targetType}
              onChange={(e) => update("targetType", e.target.value as TargetType)}
              className="w-full rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-3 py-2.5 text-sm text-vella-text"
            >
              {TARGET_TYPES.filter((t) =>
                form.cadence === "deadline" ? t === "completion" || t === "boolean" : true
              ).map((t) => (
                <option key={t} value={t}>
                  {TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {form.targetType !== "boolean" && form.targetType !== "completion" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-vella-text">Target</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={form.targetValue}
                onChange={(e) => update("targetValue", e.target.value)}
                className="w-full rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-3 py-2.5 text-sm text-vella-text"
              />
            </div>
          )}
        </div>

        {/* Description (local-only) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-vella-text">
            What are you committing to?
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            placeholder="e.g. Exercise 3 times per week"
            className="w-full rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-3 py-2.5 text-sm text-vella-text placeholder:text-vella-muted resize-none"
          />
          <p className="text-xs text-vella-muted">Stored on-device only. Never sent to the server.</p>
        </div>

        {/* Motivation (local-only) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-vella-text">
            Why does this matter? <span className="text-vella-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={form.motivation}
            onChange={(e) => update("motivation", e.target.value)}
            rows={2}
            placeholder="e.g. I want to feel stronger and more energetic"
            className="w-full rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-3 py-2.5 text-sm text-vella-text placeholder:text-vella-muted resize-none"
          />
          <p className="text-xs text-vella-muted">Stored on-device only.</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-[var(--vella-radius-button)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "w-full rounded-[var(--vella-radius-button)] bg-[var(--vella-primary)] py-3 text-sm font-semibold text-white pressable transition-opacity",
            submitting && "opacity-60 cursor-not-allowed"
          )}
        >
          {submitting ? "Creating…" : "Create commitment"}
        </button>
      </form>
    </div>
  );
}
