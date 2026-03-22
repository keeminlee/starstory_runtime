import { DISPLAY_APP_VERSION } from "@/lib/version";
import { useVerboseMode } from "@/providers/verbose-mode-provider";

export default function VersionBadge() {
  const { hasHydrated, verboseModeEnabled, toggleVerboseMode } = useVerboseMode();

  if (!DISPLAY_APP_VERSION) return null;

  return (
    <button
      type="button"
      onClick={toggleVerboseMode}
      style={{
        position: "fixed",
        bottom: 10,
        left: 10,
        padding: "3px 8px",
        borderRadius: 999,
        border: verboseModeEnabled
          ? "1px solid rgba(205,188,126,0.52)"
          : "1px solid rgba(255,255,255,0.16)",
        background: verboseModeEnabled ? "rgba(62,48,14,0.86)" : "rgba(8,12,20,0.72)",
        color: "rgba(255,255,255,0.92)",
        fontSize: "11px",
        letterSpacing: "0.03em",
        opacity: hasHydrated ? 0.92 : 0.7,
        fontFamily: "monospace",
        zIndex: 9999,
        pointerEvents: "auto",
        cursor: "pointer",
        transition: "background-color 160ms ease, border-color 160ms ease, opacity 160ms ease",
      }}
      aria-label="Toggle verbose mode"
      aria-pressed={verboseModeEnabled}
      title={verboseModeEnabled ? "Verbose mode enabled" : "Verbose mode disabled"}
    >
      {DISPLAY_APP_VERSION}
    </button>
  );
}
