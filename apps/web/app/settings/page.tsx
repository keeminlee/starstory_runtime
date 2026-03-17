import { ArchiveShell } from "@/components/layout/archive-shell";
import { PreferencesPanel } from "@/components/settings/preferences-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { WebDataError } from "@/lib/mappers/errorMappers";
import { getGuildProviderSettingsModel } from "@/lib/server/providerSettings";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  try {
    const settings = await getGuildProviderSettingsModel(query);

    return (
      <ArchiveShell section="Settings">
        <div className="space-y-8 pb-16">
          <header className="space-y-2">
            <h1 className="text-4xl font-serif">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Guild-scoped admin settings for the selected archive guild.
            </p>
          </header>

          <PreferencesPanel initialSettings={settings} />
        </div>
      </ArchiveShell>
    );
  } catch (error) {
    if (error instanceof WebDataError && error.code === "unauthorized") {
      return (
        <ArchiveShell section="Settings">
          <EmptyState
            title="No guild admin settings available"
            description="Guild settings are visible only for guild archives that show DM access on the dashboard."
          />
        </ArchiveShell>
      );
    }
    throw error;
  }
}
