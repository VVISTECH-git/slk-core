"use client";

import { usePreferences } from "@/components/preferences-provider";
import { Header, inputClass } from "@/components/ui";
import { DEFAULT_PAGE_OPTIONS, PAGE_SIZES, THEMES, type Theme } from "@/lib/preferences";

const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match this device",
};

/**
 * How this app behaves for the person signed in, not for everyone. Changes
 * here take effect immediately — there's no Save button, the same reasoning
 * `ScanControls` gives for its own Enter button: fewer steps between
 * deciding something and it being true.
 */
export function Preferences() {
  const { preferences, setPreferences } = usePreferences();

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Preferences"
        lede="How the app behaves for you — these follow you to any device you sign in on."
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-ink">Records per page</h3>
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
              How many rows a list shows before it needs a next page — Bale Intake, Thaans,
              Vendors, and every other list in the app.
            </p>
            <select
              className={inputClass}
              value={preferences.pageSize}
              onChange={(e) => setPreferences({ pageSize: Number(e.target.value) as typeof preferences.pageSize })}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-ink">Theme</h3>
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
              Light, dark, or match whatever this device is already set to.
            </p>
            <select
              className={inputClass}
              value={preferences.theme}
              onChange={(e) => setPreferences({ theme: e.target.value as Theme })}
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {THEME_LABEL[t]}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-ink">Land on, after signing in</h3>
            <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
              Which screen opens first — pick whichever one you actually start your day on.
            </p>
            <select
              className={inputClass}
              value={preferences.defaultPage}
              onChange={(e) => setPreferences({ defaultPage: e.target.value })}
            >
              {DEFAULT_PAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </section>
        </div>
      </div>
    </div>
  );
}
