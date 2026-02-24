"use client";

import type { ReflectionPayload, ReflectionResult } from "./reflection";

export async function callVellaReflectionAPI(payload: ReflectionPayload & { locale?: string }): Promise<ReflectionResult> {
  const response = await fetch("/api/reflection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload.locale ? { "Accept-Language": payload.locale } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return {
      type: "error",
      message: "Vella couldn’t generate a reflection just now. Try again in a moment.",
    };
  }

  return response.json();
}

