import { ArchiveShell } from "@/components/layout/archive-shell";
import { MeepoDashboard } from "@/components/dev/meepo-dashboard";

export const dynamic = "force-dynamic";

export default function DevMeepoPage() {
  return (
    <ArchiveShell section="Runtime Inspector" showCampaignSelector={false}>
      <MeepoDashboard />
    </ArchiveShell>
  );
}
