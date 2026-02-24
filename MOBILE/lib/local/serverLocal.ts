"use server";

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".vella");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function serverLocalGet(key: string): Promise<any | null> {
  ensureDir();
  const file = path.join(DATA_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function serverLocalSet(key: string, value: any): Promise<void> {
  ensureDir();
  const file = path.join(DATA_DIR, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

