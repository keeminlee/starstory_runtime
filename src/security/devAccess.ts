import { cfg } from "../config/env.js";

function getDevUserIdSet(): Set<string> {
  const devUserIds = cfg.access?.devUserIds;
  if (!Array.isArray(devUserIds)) return new Set<string>();
  return new Set(devUserIds);
}

export function isDevUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getDevUserIdSet().has(userId);
}
