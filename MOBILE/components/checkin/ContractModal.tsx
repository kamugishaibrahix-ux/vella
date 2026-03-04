"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { DOMAIN_METADATA, type FocusDomain } from "@/lib/focusAreas";

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; focusArea: string; purpose?: string }) => void;
  isDisabled?: boolean;
  helperText?: string;
}

const FOCUS_AREAS: FocusDomain[] = [
  "self-mastery",
  "addiction-recovery",
  "relationships",
  "emotional-intelligence",
  "performance-focus",
  "identity-purpose",
  "physical-health",
  "financial-discipline",
];

export function ContractModal({ isOpen, onClose, onCreate, isDisabled, helperText }: ContractModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [focusArea, setFocusArea] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!title.trim() || !focusArea) return;
    onCreate({
      title: title.trim(),
      focusArea,
      purpose: purpose.trim() || undefined,
    });
    // Reset
    setStep(1);
    setFocusArea("");
    setTitle("");
    setPurpose("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">New Contract</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="overflow-y-auto p-4 max-h-[calc(85vh-140px)]">
          {isDisabled && helperText ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-xl text-amber-600">⚠</span>
              </div>
              <p className="text-slate-600 text-sm">{helperText}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step 1: Focus Area */}
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">Select a focus area for this contract:</p>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {FOCUS_AREAS.map((area) => (
                      <button
                        key={area}
                        onClick={() => {
                          setFocusArea(area);
                          setStep(2);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          focusArea === area
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {DOMAIN_METADATA[area].label}
                        </p>
                        <p className="text-xs text-slate-500">
                          {DOMAIN_METADATA[area].description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Title */}
              {step === 2 && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStep(1)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ← Back to focus areas
                  </button>
                  <p className="text-sm text-slate-500">What are you committing to this week?</p>
                  <textarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Exercise for 30 minutes every morning..."
                    className="w-full h-24 p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-300 resize-none text-sm"
                  />
                  <button
                    onClick={() => title.trim() && setStep(3)}
                    disabled={!title.trim()}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Step 3: Purpose (Optional) */}
              {step === 3 && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStep(2)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ← Back to title
                  </button>
                  <p className="text-sm text-slate-500">Why does this matter? (optional)</p>
                  <input
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="One line about why this matters..."
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-300 text-sm"
                  />
                  <button
                    onClick={handleCreate}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
                  >
                    Create Contract
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safe area padding */}
        <div className="h-safe-area-inset-bottom bg-white" />
      </div>
    </div>
  );
}
