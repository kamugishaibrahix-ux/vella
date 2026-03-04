"use client";

import { useState, useEffect, useCallback } from "react";
import type { Contract } from "@/lib/contracts/contractStore";
import {
  getAllContracts,
  updateContractStatus,
  saveContract,
  cleanupExpiredContracts,
} from "@/lib/contracts/contractStore";
import {
  calculateContractStatus,
  getTimeRemaining,
  calculateProgress,
  formatDuration,
  formatTimeRemaining,
  createQuickContract,
} from "@/lib/contracts/contractLogic";

// ---------------------------------------------------------------------------
// Design Tokens - Compact
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  caption: "#C8C7C2",
  divider: "#E2E1DD",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  terracotta: "#7A4F3E",
  terracottaLight: "#F5EDEA",
  brass: "#7A6340",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InMotionPanelProps {
  systemPhase?: string;
}

export function InMotionPanel({ systemPhase }: InMotionPanelProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [now, setNow] = useState(Date.now());
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState(25);
  const [violationConfirm, setViolationConfirm] = useState<string | null>(null);
  const [showOtherContracts, setShowOtherContracts] = useState(false);

  // Refresh every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load contracts
  const loadContracts = useCallback(async () => {
    await cleanupExpiredContracts();
    const all = await getAllContracts();
    // Sort by start time, most recent first
    all.sort((a, b) => b.startTime - a.startTime);
    setContracts(all);
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Handlers
  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    const contract = createQuickContract(newTitle, newDuration, "time_block");
    await saveContract(contract);
    setNewTitle("");
    setShowCreate(false);
    await loadContracts();
  }, [newTitle, newDuration, loadContracts]);

  const handleComplete = useCallback(async (id: string) => {
    await updateContractStatus(id, "completed", Date.now());
    await loadContracts();
  }, [loadContracts]);

  const handleViolate = useCallback(async (id: string) => {
    if (violationConfirm !== id) {
      setViolationConfirm(id);
      return;
    }
    await updateContractStatus(id, "violated", Date.now());
    setViolationConfirm(null);
    await loadContracts();
  }, [loadContracts, violationConfirm]);

  const handleLateComplete = useCallback(async (id: string) => {
    await updateContractStatus(id, "completed", Date.now());
    await loadContracts();
  }, [loadContracts]);

  // Calculate contract states
  const contractStates = contracts.map((c) => ({
    contract: c,
    status: calculateContractStatus(c, now),
    timeRemaining: getTimeRemaining(c, now),
    progress: calculateProgress(c, now),
  }));

  // Find active contracts (currently running)
  const activeContracts = contractStates.filter(
    (cs) => cs.status === "active" || (cs.status === "pending" && cs.contract.startTime <= now && cs.contract.endTime >= now)
  );

  // Primary active contract (first one, or most recent)
  const primaryActive = activeContracts[0];

  // Other contracts (pending, expired, completed, violated - excluding primary)
  const otherContracts = contractStates.filter(
    (cs) => cs.contract.id !== primaryActive?.contract.id
  );

  // Pending contracts for display
  const pendingContracts = otherContracts.filter((cs) => cs.status === "pending");

  // Phase-based text logic (deterministic, no motivational language)
  function getEmptyStateMessage(phase?: string): string {
    switch (phase) {
      case "recovery":
        return "Recovery phase active. Reduced contract load recommended.";
      case "volatile":
        return "Elevated volatility detected. Single-task contracts advised.";
      case "overloaded":
        return "System overloaded. Contract execution paused.";
      case "growth":
        return "Growth phase. Full contract capacity available.";
      default:
        return "No active contracts. Ready to begin.";
    }
  }

  // Check for overlapping contracts warning
  const hasOverlappingActive = activeContracts.length > 1;

  // Empty state
  if (contracts.length === 0 && !showCreate) {
    return (
      <section style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: T.shadow }}>
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            margin: "0 0 12px",
            textTransform: "uppercase",
          }}
        >
          IN MOTION
        </p>

        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 15,
            color: T.secondary,
            margin: "0 0 14px",
          }}
        >
          {getEmptyStateMessage(systemPhase)}
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: T.dmSans,
            fontSize: 14,
            fontWeight: 600,
            height: 44,
            padding: "0 20px",
            background: T.forest,
            color: "white",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          + Set Contract
        </button>
      </section>
    );
  }

  // Create form (shown when creating new contract)
  if (showCreate) {
    return (
      <section style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: T.shadow }}>
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            margin: "0 0 12px",
            textTransform: "uppercase",
          }}
        >
          NEW CONTRACT
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What are you working on?"
            style={{
              fontFamily: T.dmSans,
              fontSize: 15,
              padding: "10px 12px",
              border: `1.5px solid ${T.divider}`,
              borderRadius: 10,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {[15, 25, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => setNewDuration(m)}
                style={{
                  flex: 1,
                  fontFamily: T.dmSans,
                  fontSize: 13,
                  fontWeight: newDuration === m ? 600 : 400,
                  padding: "8px",
                  border: `1.5px solid ${newDuration === m ? T.forest : T.divider}`,
                  borderRadius: 8,
                  background: newDuration === m ? T.forestLight : "white",
                  color: newDuration === m ? T.forest : T.secondary,
                  cursor: "pointer",
                }}
              >
                {m}m
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              style={{
                flex: 1,
                fontFamily: T.dmSans,
                fontSize: 14,
                fontWeight: 600,
                height: 44,
                background: T.forest,
                color: "white",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Start Contract
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 14,
                height: 44,
                padding: "0 16px",
                background: "transparent",
                color: T.secondary,
                border: `1.5px solid ${T.divider}`,
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: T.shadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          IN MOTION
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: T.dmSans,
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            background: "transparent",
            color: T.forest,
            border: `1.5px solid ${T.forest}`,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          + New
        </button>
      </div>

      {/* Overlapping Warning */}
      {hasOverlappingActive && (
        <div
          style={{
            background: T.terracottaLight,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.terracotta,
              margin: 0,
            }}
          >
            Multiple contracts overlapping.
          </p>
        </div>
      )}

      {/* Primary Active Contract */}
      {primaryActive ? (
        <div style={{ marginBottom: pendingContracts.length > 0 || otherContracts.length > 0 ? 12 : 0 }}>
          <ContractCard
            state={primaryActive}
            now={now}
            onComplete={handleComplete}
            onViolate={handleViolate}
            onLateComplete={handleLateComplete}
            violationConfirm={violationConfirm}
            isPrimary
          />
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 14,
              color: T.secondary,
              margin: "0 0 10px",
            }}
          >
            No active contract.
          </p>
        </div>
      )}

      {/* Pending/Upcoming Contracts */}
      {pendingContracts.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: T.tertiary,
              margin: "0 0 8px",
              textTransform: "uppercase",
            }}
          >
            Upcoming
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingContracts.slice(0, 2).map((cs) => (
              <ContractCard
                key={cs.contract.id}
                state={cs}
                now={now}
                onComplete={handleComplete}
                onViolate={handleViolate}
                onLateComplete={handleLateComplete}
                violationConfirm={violationConfirm}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Contracts Collapsible */}
      {otherContracts.length > pendingContracts.length && (
        <div>
          <button
            onClick={() => setShowOtherContracts(!showOtherContracts)}
            style={{
              width: "100%",
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.secondary,
              background: "transparent",
              border: "none",
              padding: "8px 0",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Other contracts ({otherContracts.length - pendingContracts.length})</span>
            <span style={{ fontSize: 10 }}>{showOtherContracts ? "▲" : "▼"}</span>
          </button>

          {showOtherContracts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {otherContracts
                .filter((cs) => cs.status !== "pending")
                .map((cs) => (
                  <ContractCard
                    key={cs.contract.id}
                    state={cs}
                    now={now}
                    onComplete={handleComplete}
                    onViolate={handleViolate}
                    onLateComplete={handleLateComplete}
                    violationConfirm={violationConfirm}
                    compact
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Contract Card
// ---------------------------------------------------------------------------

interface ContractState {
  contract: Contract;
  status: ReturnType<typeof calculateContractStatus>;
  timeRemaining: number;
  progress: number;
}

interface ContractCardProps {
  state: ContractState;
  now: number;
  onComplete: (id: string) => void;
  onViolate: (id: string) => void;
  onLateComplete: (id: string) => void;
  violationConfirm: string | null;
  isPrimary?: boolean;
  compact?: boolean;
}

function ContractCard({
  state,
  now,
  onComplete,
  onViolate,
  onLateComplete,
  violationConfirm,
  isPrimary,
  compact,
}: ContractCardProps) {
  const { contract, status, timeRemaining, progress } = state;
  const isExpired = status === "expired";
  const isActive = status === "active";
  const isPending = status === "pending";
  const isCompleted = status === "completed";
  const isViolated = status === "violated";

  if (compact) {
    return (
      <div
        style={{
          background: "white",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span
              style={{
                fontFamily: T.dmSans,
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                padding: "2px 5px",
                borderRadius: 3,
                background: isActive
                  ? T.forestLight
                  : isExpired
                  ? T.terracottaLight
                  : isCompleted
                  ? T.bg
                  : isViolated
                  ? T.terracottaLight
                  : T.bg,
                color: isActive
                  ? T.forest
                  : isExpired
                  ? T.terracotta
                  : isCompleted
                  ? T.secondary
                  : isViolated
                  ? T.terracotta
                  : T.secondary,
              }}
            >
              {isActive ? "ACTIVE" : isExpired ? "EXPIRED" : isCompleted ? "DONE" : isViolated ? "VIOLATED" : "PENDING"}
            </span>
            {isPending && (
              <span style={{ fontFamily: T.dmSans, fontSize: 11, color: T.tertiary }}>
                in {formatDuration(contract.startTime - now)}
              </span>
            )}
            {isActive && (
              <span style={{ fontFamily: T.dmSans, fontSize: 11, color: T.tertiary }}>
                {formatDuration(timeRemaining)} left
              </span>
            )}
          </div>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 13,
              fontWeight: 500,
              color: T.text,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {contract.title}
          </p>
        </div>

        {isExpired && (
          <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
            <button
              onClick={() => onLateComplete(contract.id)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
                background: T.forest,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Complete
            </button>
            <button
              onClick={() => onViolate(contract.id)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                padding: "6px 10px",
                background: "transparent",
                color: T.terracotta,
                border: `1px solid ${T.terracotta}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Violate
            </button>
          </div>
        )}

        {isActive && (
          <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
            <button
              onClick={() => onComplete(contract.id)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                fontWeight: 600,
                padding: "6px 10px",
                background: T.forest,
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "white", borderRadius: 10, padding: "14px 16px" }}>
      {/* Header: Title + Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h3
          style={{
            fontFamily: T.dmSans,
            fontSize: isPrimary ? 18 : 16,
            fontWeight: 600,
            color: T.text,
            margin: 0,
            flex: 1,
          }}
        >
          {contract.title}
        </h3>
        <span
          style={{
            fontFamily: T.dmSans,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "3px 8px",
            borderRadius: 5,
            background: isActive ? T.forestLight : isExpired ? T.terracottaLight : T.bg,
            color: isActive ? T.forest : isExpired ? T.terracotta : T.secondary,
            marginLeft: 8,
            whiteSpace: "nowrap",
          }}
        >
          {isActive ? "ACTIVE" : isExpired ? "EXPIRED" : isPending ? "PENDING" : status?.toUpperCase()}
        </span>
      </div>

      {/* Active: Countdown + Progress */}
      {isActive && (
        <>
          <div
            style={{
              fontFamily: T.dmSans,
              fontSize: 36,
              fontWeight: 700,
              color: T.text,
              letterSpacing: "-0.02em",
              margin: "4px 0",
            }}
          >
            {formatDuration(timeRemaining)}
          </div>

          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.tertiary,
              margin: "0 0 12px",
            }}
          >
            {formatTimeRemaining(timeRemaining)}
          </p>

          <div
            style={{
              height: 4,
              background: T.divider,
              borderRadius: 2,
              marginBottom: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: T.forest,
                borderRadius: 2,
                transition: "width 1s linear",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onComplete(contract.id)}
              style={{
                flex: 1,
                fontFamily: T.dmSans,
                fontSize: 14,
                fontWeight: 600,
                height: 40,
                background: T.forest,
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Mark Complete
            </button>
            <button
              onClick={() => onViolate(contract.id)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 13,
                height: 40,
                padding: "0 14px",
                background: "transparent",
                color: T.terracotta,
                border: `1.5px solid ${T.terracotta}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {violationConfirm === contract.id ? "Confirm" : "Violate"}
            </button>
          </div>

          {violationConfirm === contract.id && (
            <p
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                color: T.terracotta,
                margin: "8px 0 0",
              }}
            >
              This will mark the contract as violated. Click again to confirm.
            </p>
          )}
        </>
      )}

      {/* Pending: Start time */}
      {isPending && (
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 13,
            color: T.secondary,
            margin: 0,
          }}
        >
          Starts in {formatDuration(contract.startTime - now)}
        </p>
      )}

      {/* Expired: Action buttons */}
      {isExpired && (
        <>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 13,
              color: T.secondary,
              margin: "0 0 12px",
            }}
          >
            This contract expired. What happened?
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onLateComplete(contract.id)}
              style={{
                flex: 1,
                fontFamily: T.dmSans,
                fontSize: 14,
                fontWeight: 600,
                height: 40,
                background: T.forest,
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Mark Completed
            </button>
            <button
              onClick={() => onViolate(contract.id)}
              style={{
                fontFamily: T.dmSans,
                fontSize: 13,
                height: 40,
                padding: "0 14px",
                background: "transparent",
                color: T.terracotta,
                border: `1.5px solid ${T.terracotta}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {violationConfirm === contract.id ? "Confirm" : "Accept Violation"}
            </button>
          </div>

          {violationConfirm === contract.id && (
            <p
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                color: T.terracotta,
                margin: "8px 0 0",
              }}
            >
              This will record a contract violation. Click again to confirm.
            </p>
          )}
        </>
      )}
    </div>
  );
}

