import type { ObserverStarPresentation } from "@/lib/starstory/domain/sky/observerPresentation";
import styles from "@/components/openalpha/sky/sky.module.css";

type ObserverTooltipProps = {
  presentation: ObserverStarPresentation;
};

export function ObserverTooltip({ presentation }: ObserverTooltipProps) {
  const showGuildIcon = Boolean(presentation.guildIconUrl);

  return (
    <div
      className={styles.observerTooltip}
      role="presentation"
      data-owned={presentation.isViewerOwned ? "true" : "false"}
      data-actionable={presentation.isActionable ? "true" : "false"}
      data-kind={presentation.displayKind}
    >
      <div className={styles.observerTooltipGlyph} data-has-icon={showGuildIcon ? "true" : "false"}>
        {showGuildIcon ? (
          <img
            className={styles.observerTooltipGuildIcon}
            src={presentation.guildIconUrl}
            alt=""
            aria-hidden="true"
          />
        ) : presentation.glyph}
      </div>
      <div className={styles.observerTooltipBody}>
        {presentation.obscuredTitle ? (
          <div className={styles.observerTooltipTitle}>{presentation.obscuredTitle}</div>
        ) : null}
        {presentation.hintText ? (
          <div className={styles.observerTooltipHint}>{presentation.hintText}</div>
        ) : null}
        {presentation.actionText ? (
          <div className={styles.observerTooltipAction}>{presentation.actionText}</div>
        ) : null}
      </div>
    </div>
  );
}
