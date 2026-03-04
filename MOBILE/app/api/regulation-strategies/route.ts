import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";

/** Read-only tier (public): 60 req/60s per IP */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "regulation_strategies";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimitResult = await rateLimit({
    key: `ip:regulation_strategies:${ip}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const strategies = [
    {
      id: "box-breathing",
      name: "Box Breathing Reset",
      category: "breathing",
      difficulty: "micro",
      description: "Inhale, pause, exhale, pause — each for four counts to calm your nervous system.",
      whenToUse: "Use when your mind starts racing or you feel your pulse speed up.",
    },
    {
      id: "body-scan",
      name: "30-second Body Scan",
      category: "body",
      difficulty: "light",
      description: "Trace your attention from head to toes, softening each area as you move.",
      whenToUse: "Use when you feel disconnected from your body or emotions.",
    },
    {
      id: "thinking-shift",
      name: "Thought Reframe Checkpoint",
      category: "thinking",
      difficulty: "light",
      description: "Write the thought, label the distortion, then restate it in balanced language.",
      whenToUse: "Use when you notice harsh self-talk or catastrophic thinking.",
    },
    {
      id: "stoic-zoomout",
      name: "Stoic Zoom-Out",
      category: "stoic",
      difficulty: "light",
      description: "Imagine the same situation a year from now to shrink today’s intensity.",
      whenToUse: "Use when frustration spikes or you feel stuck in the moment.",
    },
    {
      id: "journal-prompt",
      name: "Three Lines Of Truth",
      category: "journaling",
      difficulty: "deep",
      description: "Line 1: what happened. Line 2: how it felt. Line 3: what you need now.",
      whenToUse: "Use after emotional conversations or overwhelming days.",
    },
    {
      id: "micro-habit",
      name: "One-minute Grounding Walk",
      category: "habits",
      difficulty: "micro",
      description: "Step outside or around your space, naming three details you notice.",
      whenToUse: "Use between meetings or when energy dips unexpectedly.",
    },
  ];

  return NextResponse.json({ strategies });
}

