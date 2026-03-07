import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/layout/archive-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { SessionActions } from "@/components/session/session-actions";
import { RecapTabs } from "@/components/session/recap-tabs";
import { SessionHeader } from "@/components/session/session-header";
import { TranscriptViewer } from "@/components/session/transcript-viewer";
import { WebApiError } from "@/lib/api/http";
import { getSessionDetailApi } from "@/lib/api/sessions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SessionPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const query = await searchParams;
  let session = null as Awaited<ReturnType<typeof getSessionDetailApi>>["session"] | null;

  try {
    const response = await getSessionDetailApi(sessionId, query);
    session = response.session;
  } catch (error) {
    if (error instanceof WebApiError && error.status === 404) {
      session = null;
    } else {
      throw error;
    }
  }

  if (!session) {
    notFound();
  }

  const recapEmptyDescription =
    session.artifacts.recap === "missing"
      ? "No recap exists yet for this session. Use Regenerate recap to generate one."
      : session.artifacts.recap === "unavailable"
        ? "Recap retrieval failed for this session. Try regenerating recap, then refresh this view."
        : "Recap data is currently unavailable for this session.";

  const transcriptEmptyDescription =
    session.artifacts.transcript === "missing"
      ? "No transcript has been recorded for this session yet."
      : session.artifacts.transcript === "unavailable"
        ? "Transcript retrieval failed for this session. Retry this page or check ingestion health."
        : "Transcript data is currently unavailable for this session.";

  return (
    <ArchiveShell section="Session" activePath="/sessions" campaignName={session.campaignName}>
      <div className="space-y-8 pb-16">
        <SessionHeader session={session} />
        <SessionActions session={session} searchParams={query} />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {session.recap && session.artifacts.recap === "available" ? (
              <RecapTabs recap={session.recap} status={session.artifacts.recap} warnings={session.warnings} />
            ) : (
              <EmptyState
                title={session.artifacts.recap === "missing" ? "No recap yet" : "Recap unavailable"}
                description={recapEmptyDescription}
              />
            )}
          </div>
          <div className="lg:col-span-5">
            {session.transcript.length > 0 && session.artifacts.transcript === "available" ? (
              <TranscriptViewer
                entries={session.transcript}
                status={session.artifacts.transcript}
                warnings={session.warnings}
              />
            ) : (
              <EmptyState
                title={session.artifacts.transcript === "missing" ? "No transcript yet" : "Transcript unavailable"}
                description={transcriptEmptyDescription}
              />
            )}
          </div>
        </div>
      </div>
    </ArchiveShell>
  );
}
