"use client";

import { useEffect, useMemo, useState } from "react";
import { DollarSign, Shield, TrendingDown, Users } from "lucide-react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { MetricCard } from "@/components/admin/MetricCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminSubscription } from "@/lib/api/adminSubscriptionsClient";
import {
  fetchAdminSubscriptions,
  updateSubscriptionStatus,
} from "@/lib/api/adminSubscriptionsClient";
import {
  fetchPromoCodes,
  createPromoCode,
  type PromoCode,
} from "@/lib/api/adminPromoCodesClient";
import { fetchRevenue, type RevenueData } from "@/lib/api/adminRevenueClient";
import { deactivatePromoCode } from "@/lib/api/adminPromoCodesClient";

type SubscriptionEventRow = {
  id: string;
  user: string;
  userId: string;
  plan: string;
  event: string;
  mrr: string;
  date: string;
  status: string;
};

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState([
    { id: "free", name: "Free", users: 0, tokenAllocation: 5000, seatLimit: 1, price: "$0", allowRealtime: false },
    { id: "pro", name: "Pro", users: 0, tokenAllocation: 40000, seatLimit: 3, price: "$49", allowRealtime: true },
    { id: "elite", name: "Elite", users: 0, tokenAllocation: 120000, seatLimit: 10, price: "$199", allowRealtime: true },
  ]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  const [refundEvent, setRefundEvent] = useState<SubscriptionEventRow | null>(null);
  const [savingSubscriptionId, setSavingSubscriptionId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isLoadingPromoCodes, setIsLoadingPromoCodes] = useState(false);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_percent: 20,
    applies_to_plan: "Pro",
    usage_limit: "",
    expires_at: "",
  });
  const [savingPromo, setSavingPromo] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadSubscriptions = async () => {
      try {
        setSubscriptionsError(null);
        const data = await fetchAdminSubscriptions();
        if (!isActive) {
          return;
        }
        const sorted = (data ?? [])
          .slice()
          .sort(
            (a, b) =>
              new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime(),
          );
        setSubscriptions(sorted);
      } catch (error) {
        console.error(error);
        if (isActive) {
          setSubscriptionsError("Failed to load subscriptions.");
          setSubscriptions([]); // Ensure subscriptions is always an array
        }
      } finally {
        if (isActive) {
          setIsLoadingSubscriptions(false);
        }
      }
    };

    loadSubscriptions();

    return () => {
      isActive = false;
    };
  }, []);

  // Load promo codes
  useEffect(() => {
    let isActive = true;
    const loadPromoCodes = async () => {
      setIsLoadingPromoCodes(true);
      try {
        const data = await fetchPromoCodes();
        if (isActive) {
          setPromoCodes(data);
        }
      } catch (error) {
        console.error("[SubscriptionsPage] Failed to load promo codes", error);
      } finally {
        if (isActive) {
          setIsLoadingPromoCodes(false);
        }
      }
    };
    void loadPromoCodes();
    return () => {
      isActive = false;
    };
  }, []);

  // Load revenue data
  useEffect(() => {
    let isActive = true;
    const loadRevenue = async () => {
      try {
        const data = await fetchRevenue();
        if (isActive) {
          setRevenue(data);
        }
      } catch (error) {
        console.error("[SubscriptionsPage] Failed to load revenue", error);
      }
    };
    void loadRevenue();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const safeSubscriptions = subscriptions ?? [];
    if (!safeSubscriptions.length) return;

    setPlans((prev) => {
      const planCounts = safeSubscriptions.reduce<Record<string, number>>((acc, sub) => {
        const name = sub.plan ?? "Unknown";
        acc[name] = (acc[name] ?? 0) + 1;
        return acc;
      }, {});

      const nextPlans = prev.map((plan) => ({
        ...plan,
        users: planCounts[plan.name] ?? plan.users,
      }));

      const additionalPlans = Object.entries(planCounts)
        .filter(([name]) => !nextPlans.some((plan) => plan.name === name))
        .map(([name, count]) => ({
          id: name.toLowerCase(),
          name,
          users: count,
          tokenAllocation: 0,
          seatLimit: 1,
          price: "$0",
          allowRealtime: false,
        }));

      return [...nextPlans, ...additionalPlans];
    });
  }, [subscriptions]);

  const subscriptionStats = useMemo(() => {
    const safeSubscriptions = subscriptions ?? [];
    const active = safeSubscriptions.filter((sub) => sub.status === "active").length;
    const cancelled = safeSubscriptions.filter((sub) => sub.status === "cancelled").length;
    return {
      total: safeSubscriptions.length,
      active,
      cancelled,
    };
  }, [subscriptions]);

  const derivedMetrics = useMemo(() => {
    const total = subscriptionStats.total;
    const activePercent = total ? Math.round((subscriptionStats.active / total) * 100) : 0;
    const churnPercent = total ? ((subscriptionStats.cancelled / total) * 100).toFixed(1) : "0.0";

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    };

    return [
      {
        title: "MRR",
        value: revenue?.mrr ? formatCurrency(revenue.mrr) : "—",
        subtitle: "Across all plans",
        icon: <DollarSign className="h-5 w-5" />,
      },
      {
        title: "Active subscriptions",
        value: subscriptionStats.active.toLocaleString(),
        subtitle: total ? `${activePercent}% of subscriptions` : "Loading...",
        icon: <Users className="h-5 w-5" />,
      },
      {
        title: "Churn rate",
        value: `${churnPercent}%`,
        subtitle: "Last 30 days",
        icon: <TrendingDown className="h-5 w-5" />,
      },
      {
        title: "Total subscriptions",
        value: total.toLocaleString(),
        subtitle: "All time",
        icon: <Shield className="h-5 w-5" />,
      },
    ];
  }, [subscriptionStats, revenue]);

  const recentEvents = useMemo<SubscriptionEventRow[]>(() => {
    return (subscriptions ?? []).slice(0, 8).map((sub) => ({
      id: sub.id,
      user: formatUserHandle(sub.user_id),
      userId: sub.user_id,
      plan: sub.plan ?? "Unknown",
      event: mapStatusToEvent(sub.status),
      mrr: "--",
      date: formatEventDate(sub.created_at),
      status: sub.status ?? "unknown",
    }));
  }, [subscriptions]);

  const handlePlanChange = (planId: string, field: "tokenAllocation" | "seatLimit" | "allowRealtime", value: number | boolean) => {
    setPlans((prev) =>
      prev.map((plan) => (plan.id === planId ? { ...plan, [field]: value } : plan)),
    );
  };

  const handleSavePlan = (planId: string) => {
    const plan = plans.find((plan) => plan.id === planId);
    // Requires new tables – skipped intentionally
    // Plan editing in the "Plan Overview" section is for plan definitions, not individual subscriptions
    // This requires a plan_templates table to store plan definitions
  };

  const handleBulkAction = async (action: "recalculate" | "sync") => {
    if (action === "recalculate") {
      try {
        const response = await fetch("/api/admin/subscriptions/bulk-recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to recalculate subscriptions");
        }
        // Reload subscriptions
        window.location.reload();
      } catch (error) {
        console.error("[SubscriptionsPage] Failed to recalculate", error);
      }
    } else if (action === "sync") {
      try {
        const response = await fetch("/api/admin/subscriptions/sync-stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to sync with Stripe");
        }
        // Reload subscriptions
        window.location.reload();
      } catch (error) {
        console.error("[SubscriptionsPage] Failed to sync", error);
      }
    }
  };

  const handleOpenUser = (userId: string) => {
    // Navigate to users page with this user selected (future enhancement)
    window.location.href = `/users?userId=${userId}`;
  };

  const handleUpdateSubscriptionStatus = async (subscriptionId: string, newStatus: "active" | "canceled" | "cancelled" | "past_due" | "trialing" | "paused") => {
    setSavingSubscriptionId(subscriptionId);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[subscriptionId];
      return next;
    });

    try {
      await updateSubscriptionStatus(subscriptionId, newStatus);
      // Update local state
      setSubscriptions((prev) =>
        prev.map((sub) =>
          sub.id === subscriptionId
            ? { ...sub, status: newStatus === "cancelled" ? "canceled" : newStatus, updated_at: new Date().toISOString() }
            : sub,
        ),
      );
    } catch (error) {
      console.error(error);
      setRowErrors((prev) => ({
        ...prev,
        [subscriptionId]: error instanceof Error ? error.message : "Failed to update subscription status",
      }));
    } finally {
      setSavingSubscriptionId(null);
    }
  };

  const handleRefund = () => {
    if (!refundEvent) return;
    // Requires new tables – skipped intentionally
    // Refund functionality requires Stripe integration and a refunds/transactions table
    setRefundEvent(null);
  };

  const handleCreatePromo = async () => {
    setSavingPromo(true);
    try {
      const promo = await createPromoCode({
        code: promoForm.code,
        discount_percent: promoForm.discount_percent,
        applies_to_plan: promoForm.applies_to_plan,
        usage_limit: promoForm.usage_limit ? Number(promoForm.usage_limit) : undefined,
        expires_at: promoForm.expires_at || undefined,
      });
      setPromoCodes((prev) => [promo, ...prev]);
      setPromoDialogOpen(false);
      setPromoForm({
        code: "",
        discount_percent: 20,
        applies_to_plan: "Pro",
        usage_limit: "",
        expires_at: "",
      });
    } catch (error) {
      console.error("[SubscriptionsPage] Failed to create promo code", error);
    } finally {
      setSavingPromo(false);
    }
  };

  const handleDeactivatePromo = async (id: string) => {
    try {
      const updated = await deactivatePromoCode(id);
      setPromoCodes((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (error) {
      console.error("[SubscriptionsPage] Failed to deactivate promo code", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Subscriptions & Payments"
        description="Monitor revenue, plan adoption, and subscription lifecycle events."
        actions={
          <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
            <DialogTrigger asChild>
              <Button>Create Promo Code</Button>
            </DialogTrigger>
            <DialogContent className="border border-border/40 bg-card text-foreground">
              <DialogHeader>
                <DialogTitle>New promo code</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Code</label>
                  <Input
                    placeholder="VELLA-FALL"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    className="border-border/40 bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Discount %</label>
                  <Input
                    type="number"
                    placeholder="20"
                    min="1"
                    max="100"
                    value={promoForm.discount_percent}
                    onChange={(e) => setPromoForm((prev) => ({ ...prev, discount_percent: Number(e.target.value) || 0 }))}
                    className="border-border/40 bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Applies to plan
                  </label>
                  <select
                    value={promoForm.applies_to_plan}
                    onChange={(e) => setPromoForm((prev) => ({ ...prev, applies_to_plan: e.target.value }))}
                    className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option>Free</option>
                    <option>Pro</option>
                    <option>Elite</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Usage limit (optional)</label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={promoForm.usage_limit}
                    onChange={(e) => setPromoForm((prev) => ({ ...prev, usage_limit: e.target.value }))}
                    className="border-border/40 bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Expires at (optional)</label>
                  <Input
                    type="datetime-local"
                    value={promoForm.expires_at}
                    onChange={(e) => setPromoForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                    className="border-border/40 bg-background text-foreground"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPromoDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleCreatePromo} disabled={savingPromo || !promoForm.code || !promoForm.discount_percent}>
                  {savingPromo ? "Creating..." : "Save promo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {derivedMetrics.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Requires new tables – skipped intentionally */}
        {false && (
          <section className="vc-card space-y-5 rounded-2xl border border-white/5 bg-surface/80 p-6 shadow-sm">
            <div className="border-b border-white/5 pb-4">
              <h2 className="text-lg font-semibold text-foreground">Plan Overview</h2>
              <p className="text-sm text-muted-foreground">Adjust allocations and gating per tier</p>
            </div>
            <div className="space-y-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-2xl border border-white/5 bg-background/40 p-4 text-sm text-muted-foreground shadow-inner shadow-black/5 transition hover:border-primary/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.users.toLocaleString()} users · {plan.price}/mo</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Realtime voice</span>
                      <Switch
                        checked={plan.allowRealtime}
                        onCheckedChange={(checked) => handlePlanChange(plan.id, "allowRealtime", checked)}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/80">
                      Monthly tokens
                      <Input
                        type="number"
                        value={plan.tokenAllocation}
                        onChange={(event) =>
                          handlePlanChange(plan.id, "tokenAllocation", Number(event.target.value))
                        }
                        className="bg-background/60 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground/80">
                      Seat limit
                      <Input
                        type="number"
                        value={plan.seatLimit}
                        onChange={(event) =>
                          handlePlanChange(plan.id, "seatLimit", Number(event.target.value))
                        }
                        className="bg-background/60 text-sm"
                      />
                    </label>
                    <div className="flex items-end justify-end">
                      <Button size="sm" className="w-full" onClick={() => handleSavePlan(plan.id)}>
                        Save plan
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-6 shadow-sm">
          <div className="border-b border-white/5 pb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Subscription Events</h2>
            <p className="text-sm text-muted-foreground">Audit inflows and outflows with inline remediation</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="overflow-hidden rounded-2xl border border-white/5">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/5">
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      User
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Plan
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Event
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      MRR
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Date
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSubscriptions ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        Loading subscription events...
                      </TableCell>
                    </TableRow>
                  ) : subscriptionsError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-destructive">
                        {subscriptionsError}
                      </TableCell>
                    </TableRow>
                  ) : recentEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                        No subscription activity recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentEvents.map((event) => (
                      <TableRow key={event.id} className="border-b border-white/5 text-sm text-muted-foreground transition hover:bg-white/5">
                        <TableCell className="font-medium text-foreground">{event.user}</TableCell>
                        <TableCell>{event.plan}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-1 text-xs ${getEventBadgeClasses(event.event)}`}>
                            {event.event}
                          </span>
                        </TableCell>
                        <TableCell>{event.mrr}</TableCell>
                        <TableCell>{event.date}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={savingSubscriptionId === event.id}
                                  className="text-foreground h-auto p-1"
                                >
                                  {savingSubscriptionId === event.id ? (
                                    "Updating..."
                                  ) : (
                          <span className={`rounded-full px-2 py-1 text-xs ${getStatusBadgeClasses(event.status)}`}>
                            {event.status}
                          </span>
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {["active", "canceled", "past_due", "trialing", "paused"].map((status) => (
                                  <DropdownMenuItem
                                    key={status}
                                    disabled={savingSubscriptionId === event.id || event.status === status}
                                    onClick={() => handleUpdateSubscriptionStatus(event.id, status as any)}
                                  >
                                    {status}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {rowErrors[event.id] && (
                              <span className="block text-xs text-destructive">{rowErrors[event.id]}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleOpenUser(event.userId)}>
                              Open user
                            </Button>
                            {/* Requires new tables – skipped intentionally */}
                            {false && (
                              <Button variant="secondary" size="sm" onClick={() => setRefundEvent(event)}>
                                Refund
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Bulk operations</h3>
          <p className="text-sm text-muted-foreground">Run maintenance tasks against plan data</p>
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="outline" onClick={() => handleBulkAction("recalculate")}>
              Recalculate token entitlements
            </Button>
            <Button variant="outline" onClick={() => handleBulkAction("sync")}>
              Sync plans from Stripe
            </Button>
          </div>
        </div>
      </div>

      {/* Promo Codes Section */}
      <section className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Promo Codes</h3>
            <p className="text-sm text-muted-foreground">Manage discount codes for subscriptions</p>
          </div>
        </div>
        {isLoadingPromoCodes ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading promo codes...</div>
        ) : promoCodes.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No promo codes created yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.map((promo) => (
                  <TableRow key={promo.id} className="border-b border-white/5 text-sm">
                    <TableCell className="font-medium text-foreground">{promo.code}</TableCell>
                    <TableCell>{promo.discount_percent}%</TableCell>
                    <TableCell>{promo.applies_to_plan}</TableCell>
                    <TableCell>{promo.times_used}</TableCell>
                    <TableCell>{promo.usage_limit ?? "∞"}</TableCell>
                    <TableCell>{formatDate(promo.expires_at)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-1 text-xs ${promo.is_active ? "bg-green-500/20 text-green-200" : "bg-gray-500/20 text-gray-200"}`}>
                        {promo.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {promo.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleDeactivatePromo(promo.id)}>
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(refundEvent)} onOpenChange={(open) => !open && setRefundEvent(null)}>
        <DialogContent className="border border-white/10 bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Refund recent charge</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Issue a refund for {refundEvent?.user} ({refundEvent?.plan} · {refundEvent?.mrr}).
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundEvent(null)}>
              Cancel
            </Button>
            <Button onClick={handleRefund}>Confirm refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getEventBadgeClasses(eventType: string) {
  switch (eventType) {
    case "Upgraded":
    case "Renewed":
      return "bg-emerald-500/20 text-emerald-100";
    case "Cancelled":
      return "bg-red-500/20 text-red-200";
    case "Trial":
      return "bg-purple-500/20 text-purple-200";
    case "Payment due":
      return "bg-amber-500/20 text-amber-100";
    default:
      return "bg-sky-500/20 text-sky-100";
  }
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "cancelled":
      return "bg-red-500/20 text-red-200";
    case "trial":
      return "bg-purple-500/20 text-purple-200";
    case "active":
      return "bg-green-600/20 text-green-200";
    default:
      return "bg-sky-500/20 text-sky-100";
  }
}

function formatUserHandle(userId?: string) {
  if (!userId) return "unknown";
  return userId.length <= 8 ? userId : `${userId.slice(0, 4)}...${userId.slice(-2)}`;
}

function formatEventDate(dateString?: string | null) {
  if (!dateString) return "--";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mapStatusToEvent(status?: string | null) {
  if (!status) return "Updated";
  switch (status) {
    case "active":
      return "Renewed";
    case "cancelled":
      return "Cancelled";
    case "trial":
    case "trialing":
      return "Trial";
    case "past_due":
      return "Payment due";
    default:
      return "Updated";
  }
}


