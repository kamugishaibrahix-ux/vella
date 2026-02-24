import type { ClassValue } from "clsx";
import clsx from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | number | Date, locale = "en-US") {
  const value = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return value.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

