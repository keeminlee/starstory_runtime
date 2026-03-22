"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_VERBOSE_MODE_PREFERENCES,
  readVerboseModePreferences,
  writeVerboseModePreferences,
} from "@/lib/client/verbose-mode";

type VerboseModeContextValue = {
  verboseModeEnabled: boolean;
  hasHydrated: boolean;
  setVerboseModeEnabled: (value: boolean) => void;
  toggleVerboseMode: () => void;
};

const VerboseModeContext = createContext<VerboseModeContextValue | null>(null);

type VerboseModeProviderProps = {
  children: ReactNode;
};

export function VerboseModeProvider({ children }: VerboseModeProviderProps) {
  const [verboseModeEnabled, setVerboseModeEnabledState] = useState(
    DEFAULT_VERBOSE_MODE_PREFERENCES.verboseModeEnabled
  );
  const [hasHydrated, setHasHydrated] = useState(false);

  useLayoutEffect(() => {
    const saved = readVerboseModePreferences(window.localStorage);
    setVerboseModeEnabledState(saved.verboseModeEnabled);
    setHasHydrated(true);
  }, []);

  const setVerboseModeEnabled = (value: boolean) => {
    setVerboseModeEnabledState(value);
    if (typeof window !== "undefined") {
      writeVerboseModePreferences(window.localStorage, { verboseModeEnabled: value });
    }
  };

  const toggleVerboseMode = () => {
    setVerboseModeEnabled(!verboseModeEnabled);
  };

  const value = useMemo<VerboseModeContextValue>(
    () => ({
      verboseModeEnabled,
      hasHydrated,
      setVerboseModeEnabled,
      toggleVerboseMode,
    }),
    [hasHydrated, verboseModeEnabled]
  );

  return <VerboseModeContext.Provider value={value}>{children}</VerboseModeContext.Provider>;
}

export function useVerboseMode(): VerboseModeContextValue {
  const context = useContext(VerboseModeContext);
  if (!context) {
    throw new Error("useVerboseMode must be used inside VerboseModeProvider.");
  }
  return context;
}