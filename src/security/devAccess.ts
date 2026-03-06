import { cfg } from "../config/env.js";

const devUserIdSet = new Set(cfg.access.devUserIds);

export function isDevUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return devUserIdSet.has(userId);
}
