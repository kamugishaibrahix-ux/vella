"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { ContractCard } from "@/components/checkin/ContractCard";
import { ContractModal } from "@/components/checkin/ContractModal";
import { WeeklyCrystal } from "@/components/checkin/WeeklyCrystal";
import { AlignmentSigil } from "@/components/checkin/AlignmentSigil";
import type { WeeklyContract, Rating } from "@/app/checkin/types";
import {
  addContract,
  deleteContract,
  countContracts,
  createEmptyState,
  getWeekKey,
  getTodayKey,
  addCheckin,
  hasCheckedInToday,
  calculateDailyScore,
  migrateContractOrigin,
} from "@/app/checkin/engine";
import { getUserAllowed, getLimitMessage } from "@/app/checkin/limits";
import { getSelectedDomainLabels } from "@/lib/focusAreas";
import { addLocalBehaviourEvent } from "@/lib/local/behaviourEventsLocal";

const STORAGE_KEY = "vella-checkin-v1";

// ---------------------------------------------------------------------------
// OS State types (mirrors GET /api/checkin/contracts response)
// ---------------------------------------------------------------------------
interface OSWeekly {
  used: number;
  cap: number;
  remaining: number;
}

interface OSSystem {
  phase: string;
  top_priority_domain: string;
  urgency_level: number | null;
  enforcement_mode: string;
  updated_at: string;
}

interface OSBudget {
  constraint_level: string;
}

interface OSContract {
  id: string;
  template_id: string;
  domain: string;
  origin: string;
  severity: string;
  enforcement_mode: string;
  duration_days: number;
  budget_weight: number;
  created_at: string;
  expires_at: string;
}

interface OSPayload {
  ok: boolean;
  planTier: string;
  weekly: OSWeekly;
  system: OSSystem | null;
  budget: OSBudget | null;
  contracts: OSContract[];
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Local app state
// ---------------------------------------------------------------------------
interface AppState {
  weekKey: string;
  contracts: WeeklyContract[];
  todayRatings: Record<string, Rating>;
  isLocked: boolean;
  completedDays: number;
}

// ---------------------------------------------------------------------------
// Capacity bar component
// ---------------------------------------------------------------------------
function CapacityBar({ used, cap, constraintLevel }: { used: number; cap: number; constraintLevel?: string }) {
  const total = 5;
  const filled = Math.min(used, cap);
  // Constraint-level responsive fill color
  const fillColor =
    constraintLevel === "critical" ? "bg-red-500" :
    constraintLevel === "elevated" ? "bg-amber-500" :
    "bg-emerald-500";
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < filled
              ? i < cap
                ? fillColor
                : "bg-red-400"
              : i < cap
                ? "bg-slate-200"
                : "bg-slate-100"
          }`}
        />
      ))}
    </div>
  );
}

export default function CheckinPage() {
  const [state, setState] = useState<AppState>({
    weekKey: getWeekKey(),
    contracts: [],
    todayRatings: {},
    isLocked: false,
    completedDays: 0,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // OS state from API
  const [osWeekly, setOsWeekly] = useState<OSWeekly | null>(null);
  const [osSystem, setOsSystem] = useState<OSSystem | null>(null);
  const [osBudget, setOsBudget] = useState<OSBudget | null>(null);

  // Selected domains from canonical focus areas store (not derived from contracts)
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  // Refs for sigil animation - detect completedDays delta
  const prevCompletedDaysRef = useRef(state.completedDays);
  const showSigilRef = useRef(false);
  const sigilTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const currentWeek = getWeekKey();

        // Check if week rolled over
        if (parsed.weekKey === currentWeek) {
          // Migrate legacy "vella" origins at read boundary
          const migratedContracts = (parsed.contracts || []).map(
            (c: WeeklyContract & { origin: string }) => ({
              ...c,
              origin: migrateContractOrigin(c.origin),
            })
          );
          setState({
            weekKey: parsed.weekKey,
            contracts: migratedContracts,
            todayRatings: parsed.todayRatings || {},
            isLocked: parsed.isLocked || false,
            completedDays: parsed.completedDays || 0,
          });
        } else {
          // Week changed - reset, system contracts will come from API
          const migratedContracts = (parsed.contracts || []).map(
            (c: WeeklyContract & { origin: string }) => ({
              ...c,
              origin: migrateContractOrigin(c.origin),
            })
          );
          setState({
            weekKey: currentWeek,
            contracts: migratedContracts.filter(
              (c: WeeklyContract) => c.origin === "user"
            ),
            todayRatings: {},
            isLocked: false,
            completedDays: 0,
          });
        }
      } catch {
        // Invalid storage, start fresh
      }
    }
    setIsHydrated(true);

    // Load selected domains from focus areas store
    setSelectedDomains(getSelectedDomainLabels());
  }, []);

  // Fetch OS contracts on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchOS() {
      try {
        const res = await fetch("/api/checkin/contracts");
        if (!res.ok) return;
        const data: OSPayload = await res.json();
        if (cancelled) return;

        // Store weekly + system + budget metadata
        setOsWeekly(data.weekly);
        setOsSystem(data.system);
        setOsBudget(data.budget ?? null);

        // Convert API contracts to local WeeklyContract shape
        const systemContracts: WeeklyContract[] = data.contracts.map((c) => ({
          id: c.id,
          title: c.template_id,
          focusArea: c.domain,
          origin: "system" as const,
          createdAt: c.created_at,
          weekKey: getWeekKey(),
        }));

        // Merge: replace system contracts, keep local user contracts clamped to remaining slots
        setState((prev) => {
          const localUserContracts = prev.contracts.filter(
            (c) => c.origin === "user"
          );
          const maxUserSlots = Math.max(0, data.weekly.cap - systemContracts.length);
          const clampedUser = localUserContracts.slice(0, maxUserSlots);
          return {
            ...prev,
            contracts: [...systemContracts, ...clampedUser],
          };
        });
      } catch {
        // API unavailable — continue with local-only contracts
      }
    }
    fetchOS();
    return () => { cancelled = true; };
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, isHydrated]);

  // Calculate counts — use OS weekly if available, else local fallback
  const { vellaCount, userCount } = countContracts(state.contracts);
  const osRemaining = osWeekly ? osWeekly.remaining : null;
  const isObserveMode = osSystem?.enforcement_mode === "observe";
  const isStrictMode = osSystem?.enforcement_mode === "strict";
  const canAdd = isObserveMode
    ? false
    : osRemaining !== null
      ? osRemaining > 0 && userCount < (osWeekly!.cap - vellaCount)
      : userCount < getUserAllowed(vellaCount) && vellaCount + userCount < 6;
  const limitText = isObserveMode
    ? "Observe mode active"
    : isStrictMode
      ? "Strict mode: duration limited to 7 days"
      : osRemaining !== null && osRemaining <= 0
        ? "Weekly capacity reached"
        : getLimitMessage(vellaCount, userCount);

  // Handlers
  const handleCreateContract = useCallback((data: { title: string; focusArea: string; purpose?: string }) => {
    const engineState = createEmptyState(state.weekKey);
    engineState.contracts = state.contracts;

    const result = addContract(engineState, {
      title: data.title,
      focusArea: data.focusArea,
      origin: "user",
    });

    if (result.success) {
      setState((prev) => ({
        ...prev,
        contracts: result.state.contracts,
      }));
      setIsModalOpen(false);
    }
  }, [state.weekKey, state.contracts]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteContract = useCallback((id: string) => {
    const contract = state.contracts.find((c) => c.id === id);
    if (!contract) return;

    // Show confirmation first
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }

    // Confirmed - proceed with delete
    const engineState = createEmptyState(state.weekKey);
    engineState.contracts = state.contracts;

    const result = deleteContract(engineState, id);
    if (result.success) {
      setState((prev) => ({
        ...prev,
        contracts: result.state.contracts,
        todayRatings: Object.fromEntries(
          Object.entries(prev.todayRatings).filter(([key]) => key !== id)
        ),
      }));
      setDeleteConfirmId(null);
    }
  }, [state.weekKey, state.contracts, deleteConfirmId]);

  const handleRate = useCallback((contractId: string, rating: Rating) => {
    setState((prev) => ({
      ...prev,
      todayRatings: {
        ...prev.todayRatings,
        [contractId]: rating,
      },
    }));
  }, []);

  const handleLockIn = useCallback(() => {
    const engineState = createEmptyState(state.weekKey);
    engineState.contracts = state.contracts;

    const result = addCheckin(engineState, state.todayRatings);

    if (result.success) {
      setState((prev) => ({
        ...prev,
        isLocked: true,
        completedDays: prev.completedDays + 1,
      }));
      // Write local behaviour event for completed check-in (best-effort)
      addLocalBehaviourEvent({
        event_type: "commitment_completed",
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [state.weekKey, state.contracts, state.todayRatings]);

  // Check if all contracts are rated
  const allRated = state.contracts.length > 0 &&
    state.contracts.every((c) => state.todayRatings[c.id] !== undefined);

  // Daily score
  const dailyScore = calculateDailyScore(state.todayRatings);

  // Detect completedDays change and trigger sigil animation
  useEffect(() => {
    const prevDays = prevCompletedDaysRef.current;
    const currentDays = state.completedDays;
    
    if (currentDays > prevDays && state.isLocked) {
      // Show sigil for 1.2 seconds
      showSigilRef.current = true;
      
      if (sigilTimeoutRef.current) {
        clearTimeout(sigilTimeoutRef.current);
      }
      
      sigilTimeoutRef.current = setTimeout(() => {
        showSigilRef.current = false;
        // Force re-render to hide sigil
        setState((prev) => ({ ...prev }));
      }, 1200);
    }
    
    prevCompletedDaysRef.current = currentDays;
  }, [state.completedDays, state.isLocked]);

  if (!isHydrated) {
    return (
      <div className="flex-1 min-h-0 bg-[#F3F4F6] flex items-center justify-center">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F3F4F6]">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hidden">
      <div className="max-w-xl mx-auto px-6">
      {/* Header */}
      <header className="sticky top-0 z-40 py-4 bg-[#F3F4F6]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Weekly Alignment</h1>
            <p className="text-xs text-slate-500">{state.weekKey}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Create button */}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canAdd}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                canAdd
                  ? isStrictMode
                    ? "bg-amber-600/10 text-amber-700 hover:bg-amber-600/20"
                    : "bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
              title={limitText || "Create contract"}
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </button>

            {/* Weekly crystal indicator */}
            <div className="scale-75 origin-right">
              <WeeklyCrystal 
                completedDays={state.completedDays} 
                isLocked={state.isLocked}
              />
            </div>
          </div>
        </div>

        {/* OS Header Layer */}
        {(selectedDomains.length > 0 || osWeekly || osSystem) && (
          <div className="mt-3 space-y-2">
            {/* A) Selected Domains */}
            {selectedDomains.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedDomains.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}

            {/* B) Weekly Capacity */}
            {osWeekly && (
              <div className="space-y-1">
                <p className="text-[11px] text-slate-500">
                  Weekly Capacity: {osWeekly.used} / {osWeekly.cap}
                </p>
                <CapacityBar used={osWeekly.used} cap={osWeekly.cap} constraintLevel={osBudget?.constraint_level} />
              </div>
            )}

            {/* C) Enforcement Mode */}
            {osSystem && (
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                isObserveMode ? "bg-slate-200 text-slate-500" :
                isStrictMode ? "bg-amber-50 text-amber-600" :
                "bg-slate-100 text-slate-500"
              }`}>
                Mode: {osSystem.enforcement_mode}
              </span>
            )}

            {/* Observe mode inline message */}
            {isObserveMode && (
              <p className="text-[10px] text-slate-400">Observe mode active</p>
            )}

            {/* Capacity reached hint */}
            {osWeekly && osWeekly.remaining <= 0 && (
              <p className="text-[10px] text-slate-400">Weekly capacity reached</p>
            )}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="pb-32 pt-6">
        {/* Sigil animation after lock-in */}
        {showSigilRef.current ? (
          <div className="flex justify-center py-12">
            <AlignmentSigil 
              completedDays={state.completedDays} 
              isAnimating={true}
            />
          </div>
        ) : state.isLocked ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm mb-4">Today&apos;s alignment recorded.</p>
            <div className="flex justify-center">
              <WeeklyCrystal 
                completedDays={state.completedDays} 
                isLocked={true}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Contracts list */}
            <div className="space-y-3">
              {state.contracts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No contracts yet.</p>
                  <p className="text-sm mt-1">Create your first weekly commitment.</p>
                </div>
              ) : (
                state.contracts.map((contract) => (
                  <ContractCard
                    key={contract.id}
                    contract={contract}
                    rating={state.todayRatings[contract.id]}
                    onRate={(rating) => handleRate(contract.id, rating)}
                    onEdit={() => {/* TODO */}}
                    onDelete={() => handleDeleteContract(contract.id)}
                    isDeleteConfirm={deleteConfirmId === contract.id}
                    onCancelDelete={() => setDeleteConfirmId(null)}
                    topPriorityDomain={osSystem?.top_priority_domain}
                  />
                ))
              )}
            </div>

            {/* Micro-reflection (only when struggling) */}
            {Object.entries(state.todayRatings).some(([, r]) => r === "struggling") && !state.isLocked && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-800 mb-2">What disrupted your edge today?</p>
                <input
                  type="text"
                  placeholder="One line reflection (optional)"
                  className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Lock-in button */}
      {!state.isLocked && state.contracts.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#F3F4F6] to-transparent">
          <div className="max-w-xl mx-auto px-6">
            <button
              onClick={handleLockIn}
              disabled={!allRated}
              className={`w-full py-4 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300 ${
                allRated
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 active:scale-[0.98]"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {!allRated
                ? `Rate all ${state.contracts.length} contracts`
                : "Lock In Today's Alignment"}
            </button>
            {allRated && (
              <p className="text-center text-xs text-emerald-600/60 mt-2 tracking-wide">
                Score: {Math.round(dailyScore * 100)}%
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      <ContractModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateContract}
        isDisabled={!canAdd}
        helperText={limitText || undefined}
      />
      </div>
      </div>
    </div>
  );
}
