import { ArchiveShell } from "@/components/layout/archive-shell";
import { BugReportPanel } from "@/components/report-bug/bug-report-panel";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  return typeof value === "string" ? value : null;
}

export default async function ReportBugPage({ searchParams }: PageProps) {
  const query = await searchParams;

  return (
    <ArchiveShell section="Report Bug">
      <BugReportPanel
        context={{
          path: readQueryValue(query.path),
          campaignSlug: readQueryValue(query.campaignSlug),
          sessionId: readQueryValue(query.sessionId),
          sessionTitle: readQueryValue(query.sessionTitle),
          issue: readQueryValue(query.issue),
        }}
      />
    </ArchiveShell>
  );
}