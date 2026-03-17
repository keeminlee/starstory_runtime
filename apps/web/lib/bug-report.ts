import { APP_VERSION } from "@/lib/version";

export type BugReportContext = {
  path?: string | null;
  campaignSlug?: string | null;
  sessionId?: string | null;
  sessionTitle?: string | null;
  issue?: string | null;
};

export const LINEAR_BUG_REPORT_URL = process.env.NEXT_PUBLIC_LINEAR_BUG_REPORT_URL?.trim() || null;

function normalizeValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildBugReportHref(context: BugReportContext): string {
  const params = new URLSearchParams();

  const path = normalizeValue(context.path);
  const campaignSlug = normalizeValue(context.campaignSlug);
  const sessionId = normalizeValue(context.sessionId);
  const sessionTitle = normalizeValue(context.sessionTitle);
  const issue = normalizeValue(context.issue);

  if (path) {
    params.set("path", path);
  }
  if (campaignSlug) {
    params.set("campaignSlug", campaignSlug);
  }
  if (sessionId) {
    params.set("sessionId", sessionId);
  }
  if (sessionTitle) {
    params.set("sessionTitle", sessionTitle);
  }
  if (issue) {
    params.set("issue", issue);
  }

  const query = params.toString();
  return query.length > 0 ? `/report-bug?${query}` : "/report-bug";
}

export function buildBugReportBody(context: BugReportContext): string {
  const lines = [
    "Summary:",
    normalizeValue(context.issue) ?? "Describe the bug.",
    "",
    "Where it happened:",
    `Path: ${normalizeValue(context.path) ?? "unknown"}`,
    `Campaign: ${normalizeValue(context.campaignSlug) ?? "n/a"}`,
    `Session ID: ${normalizeValue(context.sessionId) ?? "n/a"}`,
    `Session title: ${normalizeValue(context.sessionTitle) ?? "n/a"}`,
    "",
    "Environment:",
    `App version: ${APP_VERSION}`,
    "",
    "What did you expect to happen?",
    "",
    "What actually happened?",
    "",
    "Steps to reproduce:",
    "1.",
    "2.",
    "3.",
  ];

  return lines.join("\n");
}