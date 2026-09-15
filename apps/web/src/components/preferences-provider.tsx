"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { updatePreferences } from "@/app/preferences/actions";
import type { Preferences } from "@/lib/preferences";

interface PreferencesContextValue {
  preferences: Preferences;
  /** Updates locally right away, then writes through to the server — the screen never waits on a round trip to reflect a choice. */
  setPreferences: (patch: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * One read in the root layout (`app/layout.tsx`), one provider — every
 * screen that wants the page size or the theme reads it from here instead
 * of carrying its own copy, so there's exactly one place a preference can
 * disagree with what's actually stored.
 */
export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences;
  children: ReactNode;
}) {
  const [preferences, setLocal] = useState(initial);

  // The theme is the one preference with a visible effect outside React's
  // own tree — the CSS tokens in globals.css key off `data-theme` on <html>,
  // not off any component's render.
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", preferences.theme);
  }, [preferences.theme]);

  function setPreferences(patch: Partial<Preferences>) {
    setLocal((prev) => ({ ...prev, ...patch }));
    void updatePreferences(patch);
  }

  return (
    <PreferencesContext.Provider value={{ preferences, setPreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (ctx === null) {
    throw new Error("usePreferences must be used inside PreferencesProvider — check app/layout.tsx.");
  }
  return ctx;
}
