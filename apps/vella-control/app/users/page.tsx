"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUserRow } from "@/lib/api/adminUsersClient";
import {
  fetchAdminUsers,
  updateUserPlan,
  updateUserTokens,
  updateUserStatus,
  updateUserVoice,
  updateUserRealtime,
  updateUserNotes,
  updateUserShadowBan,
  updateUserFlagged,
} from "@/lib/api/adminUsersClient";
import { type PlanTier, getTierTokenLimit, isValidPlanTier, VALID_PLAN_TIERS } from "@vella/contract";

type UserStatus = "active" | "suspended" | "banned";
type UserPlan = string;

type UserRecord = {
  id: string;
  name: string;
  email: string;
  plan: UserPlan;
  status: UserStatus;
  lastActive: string;
  tokenBalance: number;
  tokensPerMonth: number;
  voiceEnabled: boolean;
  realtimeBeta: boolean;
  admin: boolean;
  lastActiveExact: string;
  shadowBan: boolean;
  flaggedForReview: boolean;
};

const statusOptions: { value: UserStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" },
];

// Generate plan options from shared contract
const planOptions: { value: UserPlan | "all"; label: string }[] = [
  { value: "all", label: "All plans" },
  ...(VALID_PLAN_TIERS as PlanTier[]).map((tier) => ({
    value: tier.charAt(0).toUpperCase() + tier.slice(1), // Capitalize
    label: tier.charAt(0).toUpperCase() + tier.slice(1),
  })),
];

const statusFilters: { value: "all" | UserStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...statusOptions,
];

const STATUS_FALLBACK: UserStatus = "active";

function normalizeStatus(value?: string | null): UserStatus {
  return statusOptions.some((option) => option.value === value) ? (value as UserStatus) : STATUS_FALLBACK;
}

function formatRelativeTime(dateString?: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - date.getTime()) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function mapAdminUserRow(row: AdminUserRow): UserRecord {
  const safePlan = row.plan ?? "Free";
  const lastActiveExact = row.last_active_at ?? row.updated_at ?? row.created_at ?? new Date().toISOString();
  
  // Normalize plan name for token lookup
  const normalizedTier = safePlan.toLowerCase().trim();
  const effectiveTier = isValidPlanTier(normalizedTier) ? normalizedTier : "free";
  
  return {
    id: row.user_id,
    name: row.full_name ?? row.email ?? row.user_id,
    email: row.email ?? "Not provided",
    plan: safePlan,
    status: normalizeStatus(row.status),
    lastActive: formatRelativeTime(lastActiveExact),
    tokenBalance: row.token_balance ?? 0,
    // Use shared contract for token limit - now: free=10k, pro=300k, elite=1M
    tokensPerMonth: row.tokens_per_month ?? getTierTokenLimit(effectiveTier),
    voiceEnabled: Boolean(row.voice_enabled),
    realtimeBeta: Boolean(row.realtime_beta),
    admin: Boolean(row.admin),
    lastActiveExact,
    shadowBan: Boolean(row.shadow_ban),
    flaggedForReview: Boolean(row.flagged_for_review),
  };
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [planSavingUserId, setPlanSavingUserId] = useState<string | null>(null);
  const [tokensSavingUserId, setTokensSavingUserId] = useState<string | null>(null);
  const [statusSavingUserId, setStatusSavingUserId] = useState<string | null>(null);
  const [voiceSavingUserId, setVoiceSavingUserId] = useState<string | null>(null);
  const [realtimeSavingUserId, setRealtimeSavingUserId] = useState<string | null>(null);
  const [notesSavingUserId, setNotesSavingUserId] = useState<string | null>(null);
  const [shadowBanSavingUserId, setShadowBanSavingUserId] = useState<string | null>(null);
  const [flaggedSavingUserId, setFlaggedSavingUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | UserPlan>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | UserStatus>("all");
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [accessFilter, setAccessFilter] = useState({
    voice: false,
    realtime: false,
    admin: false,
  });
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState({
    plan: "Free" as UserPlan,
    tokenAdjustment: 0,
    voiceEnabled: false,
    realtime: false,
    blockUploads: false,
    shadowBan: false,
    flaggedForReview: false,
    notes: "",
  });

  useEffect(() => {
    let isActive = true;

    const loadUsers = async () => {
      try {
        setUsersError(null);
        const url = flaggedFilter ? "/api/admin/users/list?flagged=true" : "/api/admin/users/list";
        const response = await fetch(url, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to load users");
        }
        const data = json.data ?? [];
        if (!isActive) return;
        setUsers(data.map(mapAdminUserRow));
      } catch (error) {
        console.error(error);
        if (isActive) {
          setUsersError("Failed to load users.");
          setUsers([]); // Ensure users is always an array
        }
      } finally {
        if (isActive) {
          setIsLoadingUsers(false);
        }
      }
    };

    loadUsers();

    return () => {
      isActive = false;
    };
  }, [flaggedFilter]);

  const selectedUser = useMemo(
    () => (users ?? []).find((user) => user.id === drawerUserId) ?? null,
    [drawerUserId, users],
  );

  const planFilterOptions = useMemo(() => {
    const safeUsers = users ?? [];
    const basePlans = planOptions.filter((option) => option.value !== "all");
    const uniquePlans = Array.from(new Set(safeUsers.map((user) => user.plan))).filter(Boolean);
    const additionalPlans = uniquePlans
      .filter((plan) => !basePlans.some((option) => option.value === plan))
      .map((plan) => ({ value: plan as UserPlan, label: plan }));
    return [planOptions[0], ...basePlans, ...additionalPlans];
  }, [users]);

  const planSelectOptions = planFilterOptions.filter((option) => option.value !== "all");

  useEffect(() => {
    if (selectedUser) {
      setDrawerState({
        plan: selectedUser.plan,
        tokenAdjustment: 0,
        voiceEnabled: selectedUser.voiceEnabled,
        realtime: selectedUser.realtimeBeta,
        blockUploads: false,
        shadowBan: selectedUser.shadowBan,
        flaggedForReview: selectedUser.flaggedForReview,
        notes: "",
      });
    }
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.id.toLowerCase().includes(search.toLowerCase());

      const matchesPlan = planFilter === "all" || user.plan === planFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const matchesAccess =
        (!accessFilter.voice || user.voiceEnabled) &&
        (!accessFilter.realtime || user.realtimeBeta) &&
        (!accessFilter.admin || user.admin);

      return matchesSearch && matchesPlan && matchesStatus && matchesAccess;
    });
  }, [users, search, planFilter, statusFilter, accessFilter]);

  const clearRowError = (userId: string) => {
    setRowErrors((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handlePlanUpdate = async (userId: string, newPlan: UserPlan) => {
    if (!newPlan) return;
    setPlanSavingUserId(userId);
    clearRowError(userId);
    try {
      await updateUserPlan(userId, newPlan);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, plan: newPlan } : user)),
      );
      clearRowError(userId);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to update plan" }));
    } finally {
      setPlanSavingUserId(null);
    }
  };

  const handleTokenAdjustmentSave = async (userId: string) => {
    if (drawerState.tokenAdjustment === 0) {
      setDrawerUserId(null);
      return;
    }
    setTokensSavingUserId(userId);
    clearRowError(userId);
    try {
      const newBalance = await updateUserTokens(userId, drawerState.tokenAdjustment);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, tokenBalance: newBalance } : user)),
      );
      setDrawerState((prev) => ({ ...prev, tokenAdjustment: 0 }));
      clearRowError(userId);
      setDrawerUserId(null);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to update tokens" }));
    } finally {
      setTokensSavingUserId(null);
    }
  };

  const handleStatusChange = async (userId: string, status: UserStatus) => {
    setStatusSavingUserId(userId);
    clearRowError(userId);
    try {
      await updateUserStatus(userId, status);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, status } : user)),
      );
      clearRowError(userId);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to update status" }));
    } finally {
      setStatusSavingUserId(null);
    }
  };

  const handleToggleAccess = async (
    userId: string,
    access: "voiceEnabled" | "realtimeBeta",
    value: boolean,
  ) => {
    if (access === "voiceEnabled") {
      setVoiceSavingUserId(userId);
    } else {
      setRealtimeSavingUserId(userId);
    }
    clearRowError(userId);
    try {
      if (access === "voiceEnabled") {
        await updateUserVoice(userId, value);
      } else {
        await updateUserRealtime(userId, value);
      }
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, [access]: value } : user)),
      );
      clearRowError(userId);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({
        ...prev,
        [userId]: `Failed to update ${access === "voiceEnabled" ? "voice" : "realtime"}`,
      }));
    } finally {
      if (access === "voiceEnabled") {
        setVoiceSavingUserId(null);
      } else {
        setRealtimeSavingUserId(null);
      }
    }
  };

  const handleShadowBanToggle = async (userId: string, value: boolean) => {
    clearRowError(userId);
    try {
      await updateUserShadowBan(userId, value);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, shadowBan: value } : user)),
      );
      clearRowError(userId);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to update shadow ban" }));
    }
  };

  const handleFlaggedToggle = async (userId: string, value: boolean) => {
    clearRowError(userId);
    try {
      await updateUserFlagged(userId, value);
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, flaggedForReview: value } : user)),
      );
      clearRowError(userId);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to update flagged status" }));
    }
  };

  const applyTokenAdjustment = (amount: number) => {
    if (!selectedUser) return;
    setDrawerState((prev) => ({ ...prev, tokenAdjustment: prev.tokenAdjustment + amount }));
  };

  const handleResetAllocation = async (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const delta = user.tokensPerMonth - user.tokenBalance;
    if (delta === 0) {
      setDrawerUserId(null);
      return;
    }

    setTokensSavingUserId(userId);
    clearRowError(userId);
    try {
      const newBalance = await updateUserTokens(userId, delta);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, tokenBalance: newBalance } : u)),
      );
      setDrawerState((prev) => ({ ...prev, tokenAdjustment: 0 }));
      clearRowError(userId);
      setDrawerUserId(null);
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({ ...prev, [userId]: "Failed to reset allocation" }));
    } finally {
      setTokensSavingUserId(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ["User ID", "Name", "Email", "Plan", "Status", "Token Balance", "Tokens/Month", "Voice Enabled", "Realtime Beta", "Last Active"];
    const rows = filteredUsers.map((user) => [
      user.id,
      user.name,
      user.email,
      user.plan,
      user.status,
      user.tokenBalance.toString(),
      user.tokensPerMonth.toString(),
      user.voiceEnabled ? "Yes" : "No",
      user.realtimeBeta ? "Yes" : "No",
      user.lastActive,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `users-export-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const drawerActions = selectedUser
    ? {
        grant5k: () => applyTokenAdjustment(5000),
        grant25k: () => applyTokenAdjustment(25000),
        resetAllocation: () => handleResetAllocation(selectedUser.id),
      }
    : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Users Management"
        description="Search, review, and take action on user accounts across the Vella platform."
        actions={
          <Button size="sm" variant="outline" onClick={handleExportCSV}>
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-surface/70 p-4 shadow-inner shadow-black/5">
        <Input
          placeholder="Search by name, email, or ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full max-w-xs bg-background/60 text-sm text-foreground"
        />
        <select
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value as UserPlan | "all")}
          className="rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {planFilterOptions.map((plan) => (
            <option key={plan.value} value={plan.value}>
              {plan.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as UserStatus | "all")}
          className="rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {statusFilters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={flaggedFilter}
            onChange={(e) => setFlaggedFilter(e.target.checked)}
            className="rounded border-white/10"
          />
          Flagged for review
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-white/10 bg-background/60 text-foreground">
              Access filters
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={accessFilter.voice}
              onCheckedChange={(checked) =>
                setAccessFilter((prev) => ({ ...prev, voice: Boolean(checked) }))
              }
            >
              Voice enabled
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={accessFilter.realtime}
              onCheckedChange={(checked) =>
                setAccessFilter((prev) => ({ ...prev, realtime: Boolean(checked) }))
              }
            >
              Realtime beta
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={accessFilter.admin}
              onCheckedChange={(checked) =>
                setAccessFilter((prev) => ({ ...prev, admin: Boolean(checked) }))
              }
            >
              Admin accounts
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-surface/80 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5">
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Voice</TableHead>
              <TableHead>Realtime</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingUsers ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : usersError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-destructive">
                  {usersError}
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                  No users match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className="border-white/5 text-sm text-muted-foreground transition hover:bg-white/5">
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      <span className="font-mono text-[11px] text-muted-foreground/80">{user.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{user.plan}</TableCell>
                  <TableCell>
                    <div className="text-sm text-foreground">{user.tokenBalance.toLocaleString()} tokens</div>
                    <p className="text-xs text-muted-foreground">{user.tokensPerMonth.toLocaleString()} / mo</p>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={user.voiceEnabled}
                      disabled={voiceSavingUserId === user.id}
                      onCheckedChange={(checked) => handleToggleAccess(user.id, "voiceEnabled", checked)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={user.realtimeBeta}
                      disabled={realtimeSavingUserId === user.id}
                      onCheckedChange={(checked) => handleToggleAccess(user.id, "realtimeBeta", checked)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-foreground">
                          {statusOptions.find((option) => option.value === user.status)?.label ?? user.status}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {statusOptions.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            disabled={statusSavingUserId === user.id}
                            onClick={() => handleStatusChange(user.id, option.value)}
                          >
                            {statusSavingUserId === user.id && option.value === user.status
                              ? "Updating..."
                              : option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>{user.lastActive}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-foreground"
                        onClick={() => setDrawerUserId(user.id)}
                      >
                        Manage
                      </Button>
                      {rowErrors[user.id] ? (
                        <span className="text-xs text-destructive">{rowErrors[user.id]}</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={Boolean(selectedUser)} onOpenChange={(open) => !open && setDrawerUserId(null)}>
        <SheetContent className="w-full overflow-hidden bg-background/95 text-foreground sm:max-w-xl">
          {selectedUser ? (
            <ScrollArea className="h-[calc(100vh-4rem)] pr-4">
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="text-xl font-semibold">{selectedUser.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </SheetHeader>

              <div className="mt-6 space-y-8">
                <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-5 shadow-sm">
                  <header className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Account & Plan</p>
                      <p className="text-xs text-muted-foreground">Control billing tier & entitlements</p>
                    </div>
                  </header>
                  <label className="flex flex-col gap-2 text-sm text-muted-foreground">
                    Plan
                    <select
                      value={drawerState.plan}
                      onChange={(event) => setDrawerState((prev) => ({ ...prev, plan: event.target.value as UserPlan }))}
                      className="rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {planSelectOptions.map((plan) => (
                        <option key={plan.value} value={plan.value}>
                          {plan.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    className="mt-4"
                    disabled={planSavingUserId === selectedUser.id}
                    onClick={() => handlePlanUpdate(selectedUser.id, drawerState.plan)}
                  >
                    {planSavingUserId === selectedUser.id ? "Applying..." : "Apply plan change"}
                  </Button>
                </section>

                <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-5 shadow-sm">
                  <header className="mb-4">
                    <p className="text-sm font-semibold text-foreground">Token adjustments</p>
                    <p className="text-xs text-muted-foreground">
                      Apply one-time token grants or reset allocation
                    </p>
                  </header>
                  <label className="flex flex-col gap-2 text-sm text-muted-foreground">
                    Adjustment amount
                    <Input
                      type="number"
                      value={drawerState.tokenAdjustment}
                      onChange={(event) =>
                        setDrawerState((prev) => ({ ...prev, tokenAdjustment: Number(event.target.value) }))
                      }
                      className="bg-background/60"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button size="sm" variant="secondary" onClick={drawerActions?.grant5k}>
                      +5K tokens
                    </Button>
                    <Button size="sm" variant="secondary" onClick={drawerActions?.grant25k}>
                      +25K tokens
                    </Button>
                    <Button size="sm" variant="outline" onClick={drawerActions?.resetAllocation}>
                      Reset to monthly allocation
                    </Button>
                  </div>
                </section>

                <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-5 shadow-sm">
                  <header className="mb-4">
                    <p className="text-sm font-semibold text-foreground">Access flags</p>
                    <p className="text-xs text-muted-foreground">Enable feature gates for this user</p>
                  </header>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Voice mode</p>
                        <p className="text-xs text-muted-foreground">Enables realtime speech interface</p>
                      </div>
                      <Switch
                        checked={drawerState.voiceEnabled}
                        disabled={voiceSavingUserId === selectedUser?.id}
                        onCheckedChange={async (checked) => {
                          if (selectedUser) {
                            setDrawerState((prev) => ({ ...prev, voiceEnabled: checked }));
                            await handleToggleAccess(selectedUser.id, "voiceEnabled", checked);
                          }
                        }}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Realtime beta</p>
                        <p className="text-xs text-muted-foreground">Unlock experimental realtime engine</p>
                      </div>
                      <Switch
                        checked={drawerState.realtime}
                        disabled={realtimeSavingUserId === selectedUser?.id}
                        onCheckedChange={async (checked) => {
                          if (selectedUser) {
                            setDrawerState((prev) => ({ ...prev, realtime: checked }));
                            await handleToggleAccess(selectedUser.id, "realtimeBeta", checked);
                          }
                        }}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                    {/* Requires new tables – skipped intentionally */}
                    {false && (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Block file uploads</p>
                          <p className="text-xs text-muted-foreground">Temporarily disable document ingest</p>
                        </div>
                        <Switch
                          checked={drawerState.blockUploads}
                          onCheckedChange={(checked) =>
                            setDrawerState((prev) => ({ ...prev, blockUploads: checked }))
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    )}
                  </div>
                </section>

                <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-5 shadow-sm">
                  <header className="mb-4">
                    <p className="text-sm font-semibold text-foreground">Safety & Abuse</p>
                    <p className="text-xs text-muted-foreground">
                      Hide the user in discovery and suppress outbound prompts
                    </p>
                  </header>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Shadow-ban user</p>
                      <p className="text-xs text-muted-foreground">
                        Keeps experience functional while removing signals
                      </p>
                    </div>
                    <Switch
                      checked={drawerState.shadowBan}
                      disabled={shadowBanSavingUserId === selectedUser?.id}
                      onCheckedChange={async (checked) => {
                        if (selectedUser) {
                          setDrawerState((prev) => ({ ...prev, shadowBan: checked }));
                          await handleShadowBanToggle(selectedUser.id, checked);
                        }
                      }}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Flag for review</p>
                      <p className="text-xs text-muted-foreground">
                        Mark user for manual review by admin team
                      </p>
                    </div>
                    <Switch
                      checked={drawerState.flaggedForReview}
                      disabled={flaggedSavingUserId === selectedUser?.id}
                      onCheckedChange={async (checked) => {
                        if (selectedUser) {
                          setDrawerState((prev) => ({ ...prev, flaggedForReview: checked }));
                          await handleFlaggedToggle(selectedUser.id, checked);
                        }
                      }}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                  <label className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
                    Internal notes
                    <Textarea
                      value={drawerState.notes}
                      onChange={(event) => {
                        const newNotes = event.target.value;
                        setDrawerState((prev) => ({ ...prev, notes: newNotes }));
                        // Autosave notes with debounce
                        if (selectedUser) {
                          clearTimeout((window as any).notesSaveTimeout);
                          (window as any).notesSaveTimeout = setTimeout(async () => {
                            if (selectedUser) {
                              setNotesSavingUserId(selectedUser.id);
                              try {
                                await updateUserNotes(selectedUser.id, newNotes);
                                clearRowError(selectedUser.id);
                              } catch (error) {
                                console.error(error);
                                setRowErrors((prev) => ({
                                  ...prev,
                                  [selectedUser.id]: "Failed to save notes",
                                }));
                              } finally {
                                setNotesSavingUserId(null);
                              }
                            }
                          }, 1000); // 1 second debounce
                        }
                      }}
                      placeholder="Add context for ops / trust team…"
                      className="min-h-[120px] bg-background/60"
                    />
                    {notesSavingUserId === selectedUser?.id && (
                      <span className="text-xs text-muted-foreground">Saving...</span>
                    )}
                  </label>
                </section>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setDrawerState((prev) => ({ ...prev, tokenAdjustment: 0, notes: "" }))}
                  >
                    Reset fields
                  </Button>
                  <Button
                    disabled={tokensSavingUserId === selectedUser?.id}
                    onClick={() => {
                      if (!selectedUser) return;
                      handleTokenAdjustmentSave(selectedUser.id);
                    }}
                  >
                    {tokensSavingUserId === selectedUser?.id ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

