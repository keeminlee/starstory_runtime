"use client";

import { useMemo } from "react";
import { SkyViewport } from "@/components/openalpha/sky/SkyViewport";
import { testStars } from "@/lib/starstory/domain/sky/starData";
import styles from "./openalpha.module.css";

export function SkyLayer() {
  const stars = useMemo(() => testStars.filter((star) => star.type === "campaign"), []);

  return (
    <div className={styles.skyLayer}>
      <SkyViewport stars={stars} links={[]} />
    </div>
  );
}
