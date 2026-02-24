// Local-first goals engine using server-local storage
"use server";

import { serverLocalGet, serverLocalSet } from "@/lib/local/serverLocal";

export type GoalType = "life" | "focus" | "weekly";
export type GoalStatus = "active" | "paused" | "completed" | "abandoned";
export type GoalActionStatus = "pending" | "in_progress" | "done" | "skipped";

export type UserGoal = {
  id: number;
  user_id: string;
  type: GoalType;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: number;
  target_date: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GoalAction = {
  id: number;
  goal_id: number;
  user_id: string;
  label: string;
  status: GoalActionStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

type StoredGoal = Omit<UserGoal, "id"> & { id: number };
type StoredGoalAction = Omit<GoalAction, "id"> & { id: number };

function getStorageKey(userId: string | null): string {
  const uid = userId ?? "anonymous";
  return `goals:${uid}`;
}

function getActionsStorageKey(userId: string | null): string {
  const uid = userId ?? "anonymous";
  return `goal_actions:${uid}`;
}

async function loadGoals(userId: string | null): Promise<StoredGoal[]> {
  try {
    const key = getStorageKey(userId);
    const raw = await serverLocalGet(key);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function saveGoals(userId: string | null, goals: StoredGoal[]): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await serverLocalSet(key, goals);
  } catch (err) {
    console.error("[goalEngine] Failed to save goals", err);
  }
}

async function loadGoalActions(userId: string | null): Promise<StoredGoalAction[]> {
  try {
    const key = getActionsStorageKey(userId);
    const raw = await serverLocalGet(key);
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function saveGoalActions(userId: string | null, actions: StoredGoalAction[]): Promise<void> {
  try {
    const key = getActionsStorageKey(userId);
    await serverLocalSet(key, actions);
  } catch (err) {
    console.error("[goalEngine] Failed to save goal actions", err);
  }
}

async function generateGoalId(userId: string | null): Promise<number> {
  const goals = await loadGoals(userId);
  if (goals.length === 0) return 1;
  const maxId = Math.max(...goals.map((g) => g.id));
  return maxId + 1;
}

async function generateActionId(userId: string | null): Promise<number> {
  const actions = await loadGoalActions(userId);
  if (actions.length === 0) return 1;
  const maxId = Math.max(...actions.map((a) => a.id));
  return maxId + 1;
}

export async function listGoals(
  userId: string | null,
  type?: GoalType,
  _client?: unknown,
): Promise<UserGoal[]> {
  try {
    const goals = await loadGoals(userId);
    let filtered = goals.filter((g) => g.status === "active");

    if (type) {
      filtered = filtered.filter((g) => g.type === type);
    }

    // Sort: priority ASC, target_date ASC (nulls last), created_at DESC
    filtered.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.target_date && b.target_date) {
        return a.target_date.localeCompare(b.target_date);
      }
      if (a.target_date) return -1;
      if (b.target_date) return 1;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return filtered.map((g) => ({
      ...g,
      user_id: userId ?? "anonymous",
    }));
  } catch (error) {
    console.warn("[goalEngine] listGoals error", error);
    return [];
  }
}

export async function listGoalActions(
  userId: string | null,
  goalId: number,
  _client?: unknown,
): Promise<GoalAction[]> {
  try {
    const actions = await loadGoalActions(userId);
    const filtered = actions
      .filter((a) => a.goal_id === goalId)
      .sort((a, b) => {
        // Sort: status ASC, due_date ASC (nulls first), created_at ASC
        const statusOrder: Record<GoalActionStatus, number> = {
          pending: 0,
          in_progress: 1,
          done: 2,
          skipped: 3,
        };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (a.due_date && b.due_date) {
          return a.due_date.localeCompare(b.due_date);
        }
        if (a.due_date) return 1;
        if (b.due_date) return -1;
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      });

    return filtered.map((a) => ({
      ...a,
      user_id: userId ?? "anonymous",
    }));
  } catch (error) {
    console.warn("[goalEngine] listGoalActions error", error);
    return [];
  }
}

export async function createGoal(
  userId: string | null,
  input: {
    type: GoalType;
    title: string;
    description?: string;
    priority?: number;
    target_date?: string;
  },
  _client?: unknown,
): Promise<UserGoal | null> {
  try {
    const goals = await loadGoals(userId);
    const now = new Date().toISOString();
    const newGoal: StoredGoal = {
      id: await generateGoalId(userId),
      user_id: userId ?? "anonymous",
      type: input.type,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      status: "active",
      priority: input.priority ?? 2,
      target_date: input.target_date ?? null,
      created_at: now,
      updated_at: now,
    };

    goals.push(newGoal);
    await saveGoals(userId, goals);

    return {
      ...newGoal,
      user_id: userId ?? "anonymous",
    };
  } catch (error) {
    console.warn("[goalEngine] createGoal error", error);
    return null;
  }
}

export async function addGoalAction(
  userId: string | null,
  input: {
    goalId: number;
    label: string;
    due_date?: string;
  },
  _client?: unknown,
): Promise<GoalAction> {
  try {
    const actions = await loadGoalActions(userId);
    const now = new Date().toISOString();
    const newAction: StoredGoalAction = {
      id: await generateActionId(userId),
      goal_id: input.goalId,
      user_id: userId ?? "anonymous",
      label: input.label.trim(),
      status: "pending",
      due_date: input.due_date ?? null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    actions.push(newAction);
    await saveGoalActions(userId, actions);

    return {
      ...newAction,
      user_id: userId ?? "anonymous",
    };
  } catch (error) {
    console.error("[goalEngine] addGoalAction error", error);
    throw new Error(`[goalEngine] addGoalAction error: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

export async function updateGoalStatus(
  userId: string | null,
  goalId: number,
  status: GoalStatus,
  _client?: unknown,
): Promise<UserGoal | null> {
  try {
    const goals = await loadGoals(userId);
    const index = goals.findIndex((g) => g.id === goalId);
    if (index === -1) {
      console.warn("[goalEngine] updateGoalStatus: goal not found", goalId);
      return null;
    }

    goals[index] = {
      ...goals[index]!,
      status,
      updated_at: new Date().toISOString(),
    };

    await saveGoals(userId, goals);

    return {
      ...goals[index]!,
      user_id: userId ?? "anonymous",
    };
  } catch (error) {
    console.warn("[goalEngine] updateGoalStatus error", error);
    return null;
  }
}

export async function updateGoalActionStatus(
  userId: string | null,
  actionId: number,
  status: GoalActionStatus,
  _client?: unknown,
): Promise<GoalAction> {
  try {
    const actions = await loadGoalActions(userId);
    const index = actions.findIndex((a) => a.id === actionId);
    if (index === -1) {
      throw new Error(`[goalEngine] updateGoalActionStatus: action not found: ${actionId}`);
    }

    const now = new Date().toISOString();
    actions[index] = {
      ...actions[index]!,
      status,
      completed_at: status === "done" ? now : null,
      updated_at: now,
    };

    await saveGoalActions(userId, actions);

    return {
      ...actions[index]!,
      user_id: userId ?? "anonymous",
    };
  } catch (error) {
    console.error("[goalEngine] updateGoalActionStatus error", error);
    throw new Error(`[goalEngine] updateGoalActionStatus error: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
