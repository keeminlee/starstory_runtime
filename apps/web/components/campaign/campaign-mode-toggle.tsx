"use client";

export type CampaignView = "chronicle" | "compendium";

type CampaignModeToggleProps = {
  activeView: CampaignView;
  onSwitch: (view: CampaignView) => void;
};

export function CampaignModeToggle({ activeView, onSwitch }: CampaignModeToggleProps) {
  return (
    <div className="mt-6 flex gap-1 rounded-full border border-border/60 bg-background/40 p-1 w-fit">
      <ToggleButton
        label="Chronicle"
        active={activeView === "chronicle"}
        onClick={() => onSwitch("chronicle")}
      />
      <ToggleButton
        label="Compendium"
        active={activeView === "compendium"}
        onClick={() => onSwitch("compendium")}
      />
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-full px-5 py-1.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-primary/12 text-foreground shadow-sm border border-primary/25"
          : "text-muted-foreground hover:text-foreground border border-transparent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
