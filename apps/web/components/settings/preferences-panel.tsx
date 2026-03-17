"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GuildProviderSettingsModel } from "@/lib/types";
import { updateGuildProviderSettingsApi } from "@/lib/api/settings";
import { WebApiError } from "@/lib/api/http";

type PreferencesPanelProps = {
  initialSettings: GuildProviderSettingsModel;
};

type BannerState = {
  tone: "success" | "danger";
  message: string;
} | null;

export function PreferencesPanel({ initialSettings }: PreferencesPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState(initialSettings);
  const [sttProvider, setSttProvider] = useState<"whisper" | "deepgram">(initialSettings.sttProvider ?? initialSettings.effectiveSttProvider === "deepgram" ? "deepgram" : "whisper");
  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic" | "google">(initialSettings.llmProvider ?? initialSettings.effectiveLlmProvider);
  const [banner, setBanner] = useState<BannerState>(null);
  const canWriteSelectedGuild = settings.canWriteSelectedGuild;

  useEffect(() => {
    setSettings(initialSettings);
    setSttProvider(initialSettings.sttProvider ?? (initialSettings.effectiveSttProvider === "deepgram" ? "deepgram" : "whisper"));
    setLlmProvider(initialSettings.llmProvider ?? initialSettings.effectiveLlmProvider);
    setBanner(null);
  }, [initialSettings]);

  async function handleSave(): Promise<void> {
    setBanner(null);
    try {
      const response = await updateGuildProviderSettingsApi({
        guildId: settings.selectedGuildId,
        sttProvider,
        llmProvider,
      }, {
        guild_id: settings.selectedGuildId,
      });
      setSettings(response.settings);
      setSttProvider(response.settings.sttProvider ?? (response.settings.effectiveSttProvider === "deepgram" ? "deepgram" : "whisper"));
      setLlmProvider(response.settings.llmProvider ?? response.settings.effectiveLlmProvider);
      setBanner({ tone: "success", message: "Guild provider settings saved." });
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      const message = error instanceof WebApiError
        ? error.message
        : "Guild provider settings could not be saved right now.";
      setBanner({ tone: "danger", message });
    }
  }

  function handleGuildChange(guildId: string): void {
    setBanner(null);
    startTransition(() => {
      router.push(`/settings?guild_id=${encodeURIComponent(guildId)}`);
    });
  }

  const statusTone = banner?.tone === "danger"
    ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";

  return (
    <section className="space-y-6 rounded-2xl card-glass p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-serif">Guild Provider Settings</h2>
        <p className="text-sm text-muted-foreground">
          These settings apply to the selected guild archive and are not personal preferences.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Selected Guild</span>
        <select
          className="control-select min-w-48 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider w-full"
          value={settings.selectedGuildId}
          onChange={(event) => handleGuildChange(event.target.value)}
          disabled={isPending}
        >
          {settings.guildOptions.map((guild) => (
            <option key={guild.guildId} value={guild.guildId}>
              {guild.guildName}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">STT Provider</span>
          <select
            className="control-select min-w-48 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider w-full"
            value={sttProvider}
            onChange={(event) => setSttProvider(event.target.value as "whisper" | "deepgram")}
            disabled={isPending}
          >
            <option value="whisper">whisper</option>
            <option value="deepgram">deepgram</option>
          </select>
          <p className="text-sm text-muted-foreground">
            Effective provider: <span className="text-foreground">{settings.effectiveSttProvider}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Credential status: <span className="text-foreground">{settings.sttCredentialConfigured ? `configured (${settings.sttCredentialEnvKey ?? "none required"})` : `missing ${settings.sttCredentialEnvKey ?? "credential"}`}</span>
          </p>
        </label>

        <label className="block space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">LLM Provider</span>
          <select
            className="control-select min-w-48 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider w-full"
            value={llmProvider}
            onChange={(event) => setLlmProvider(event.target.value as "openai" | "anthropic" | "google")}
            disabled={isPending}
          >
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
            <option value="google">google</option>
          </select>
          <p className="text-sm text-muted-foreground">
            Effective provider: <span className="text-foreground">{settings.effectiveLlmProvider}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Credential status: <span className="text-foreground">{settings.llmCredentialConfigured ? `configured (${settings.llmCredentialEnvKey})` : `missing ${settings.llmCredentialEnvKey}`}</span>
          </p>
        </label>
      </div>

      {banner ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusTone}`}>
          {banner.message}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Changes persist at the guild layer and affect future runtime calls for this guild.
        </p>
        <button
          type="button"
          className="rounded-full border border-primary/40 bg-primary/15 px-5 py-2 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handleSave()}
          disabled={isPending}
        >
          {isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </section>
  );
}
