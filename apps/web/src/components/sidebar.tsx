"use client";

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Hidden, not deleted — the prototype's pattern. Every screen below still
 * builds and is still reachable by URL; the sidebar is cut to what is being
 * worked on. Remove a line to bring a screen back.
 */
const HIDDEN = new Set<string>([]);

const NAV = [
  {
    href: "/records",
    label: "Product Management",
    icon: "M3 4h14v12H3z M3 8h14 M8 8v8",
  },
  {
    href: "/stock",
    label: "Stock Records",
    icon: "M3 6l7-3 7 3v8l-7 3-7-3z M3 6l7 3 7-3 M10 9v8",
  },
  {
    href: "/operational-standard",
    label: "Master Lists",
    icon: "M4 4h5v5H4z M11 4h5v5h-5z M4 11h5v5H4z M11 11h5v5h-5z",
  },
  {
    // Where stock sits. Not vocabulary — a location is a real place with real
    // stock in it — so it stands on its own rather than under the lists.
    href: "/locations",
    label: "Locations",
    icon: "M10 17s5.5-4.6 5.5-9a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9 5.5 9z M10 8.5v.01",
  },
] as const;

const RAIL_KEY = "slk.sidebar.rail";

/** Wide enough for an icon and its padding; wide enough for the longest label. */
const RAIL_WIDTH = 56;
const FULL_WIDTH = 240;

/**
 * Whether the sidebar is collapsed, read from localStorage.
 *
 * `useSyncExternalStore` rather than reading in an effect: the server has no
 * localStorage, so the value has to differ between the HTML and the first
 * client render, and this is the API that handles exactly that — a separate
 * server snapshot, and no setState during an effect to trigger a second pass.
 */
const railStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    railStore.listeners.add(listener);
    // Another tab collapsing its sidebar should not silently disagree.
    window.addEventListener("storage", listener);

    return () => {
      railStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },

  get(): boolean {
    try {
      return window.localStorage.getItem(RAIL_KEY) === "1";
    } catch {
      // Private windows and blocked site data — expanded is a fine default.
      return false;
    }
  },

  set(value: boolean) {
    try {
      window.localStorage.setItem(RAIL_KEY, value ? "1" : "0");
    } catch {
      // Not remembering the choice is better than failing to make it.
    }
    for (const listener of railStore.listeners) listener();
  },
};

export function Sidebar() {
  const pathname = usePathname();

  const railed = useSyncExternalStore(
    railStore.subscribe,
    railStore.get,
    // The server renders it expanded; a collapsed preference applies as soon
    // as the client takes over.
    () => false,
  );

  const toggle = useCallback(() => {
    railStore.set(!railStore.get());
  }, []);

  const visible = NAV.filter((item) => !HIDDEN.has(item.href));

  return (
    <nav
      aria-label="Main"
      // An inline width rather than a class: the value is toggled at runtime,
      // and Tailwind only emits utilities it can see as complete strings in
      // the source, so `w-14` was never generated and the toggle did nothing.
      //
      // No width transition either. Animating it left the element sitting at
      // its old width — a sidebar that collapses is worth more than one that
      // slides and then does not.
      style={{ width: railed ? RAIL_WIDTH : FULL_WIDTH }}
      className="flex flex-none flex-col overflow-hidden border-r border-rule bg-surface-2"
    >
      <div
        className={`flex items-center gap-2 border-b border-rule py-4 ${
          railed ? "justify-center px-2" : "px-4"
        }`}
      >
        {!railed && (
          <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold tracking-tight text-ink">
            Sree Lakshmi Kalamkari
          </span>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-expanded={!railed}
          aria-label={railed ? "Expand sidebar" : "Collapse sidebar"}
          title={railed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex-none rounded-md p-1.5 text-muted hover:bg-surface-3 hover:text-ink"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
            <path d="M8 3.5v13" />
            <path d={railed ? "M11.5 8.5l2 1.5-2 1.5" : "M5.8 8.5l-2 1.5 2 1.5"} />
          </svg>
        </button>
      </div>

      <ul className={`flex flex-col gap-0.5 ${railed ? "p-2" : "p-3"}`}>
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={railed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-md text-[13.5px] transition-colors ${
                  railed ? "justify-center px-2 py-2.5" : "px-3 py-2"
                } ${
                  active
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : "text-ink-2 hover:bg-surface-3"
                }`}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-none"
                  aria-hidden
                >
                  <path d={item.icon} />
                </svg>
                {!railed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      {!railed && (
        <div className="mt-auto border-t border-rule px-5 py-4 font-mono text-[10.5px] leading-relaxed text-faint">
          slk-core
        </div>
      )}
    </nav>
  );
}
