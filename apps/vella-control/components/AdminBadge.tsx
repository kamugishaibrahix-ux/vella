"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function AdminBadge() {
  const [email, setEmail] = useState<string | null>(null);
  const [env, setEnv] = useState<string>("DEV");

  useEffect(() => {
    // Determine environment
    const nodeEnv = process.env.NODE_ENV || "development";
    const isStaging = process.env.NEXT_PUBLIC_ENV === "staging" || process.env.VERCEL_ENV === "staging";
    const isProd = process.env.NEXT_PUBLIC_ENV === "production" || process.env.VERCEL_ENV === "production";

    if (isProd) {
      setEnv("PROD");
    } else if (isStaging) {
      setEnv("STAGING");
    } else {
      setEnv("DEV");
    }

    // Fetch current user email
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.user?.email) {
            setEmail(data.user.email);
          }
        }
      } catch (error) {
        console.error("[AdminBadge] Failed to fetch user", error);
      }
    };

    void fetchUser();
  }, []);

  if (!email && env === "DEV") {
    // In dev, don't show badge if no user
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {email && (
        <span className="text-sm text-muted-foreground">{email}</span>
      )}
      <Badge
        variant={env === "PROD" ? "destructive" : env === "STAGING" ? "default" : "secondary"}
        className="text-xs"
      >
        {env}
      </Badge>
    </div>
  );
}

