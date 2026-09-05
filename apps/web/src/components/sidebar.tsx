"use client";

import { useCallback, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/logout/actions";

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
    // What a channel's order already booked, waiting for someone to
    // actually take the piece off the shelf — floor work, same as any
    // other movement, not owner territory like Channels is.
    href: "/picking",
    label: "Picking List",
    icon: "M4 4h12v13l-3-2-3 2-3-2-3 2z M7 8h6 M7 11h6",
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
  {
    // Who can sign in, and from which handsets. Owners only — everyone else is
    // shown a sidebar without it, and the screen refuses them again anyway.
    href: "/staff",
    label: "Staff",
    icon: "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M2.5 16c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2 M13 5.2a2.2 2.2 0 0 1 0 4.3 M14 11.6c1.9.4 3.2 1.8 3.2 3.9",
    owner: true,
  },
  {
    // Every storefront, every consignment on it, and the buttons that put
    // them there — owner territory, same reasoning as Staff. Not floor work.
    href: "/channels",
    label: "Channels",
    icon: "M4 6l1-3h10l1 3 M4 6h12v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6z M8 9v2a2 2 0 0 0 4 0V9",
    owner: true,
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

/**
 * Below this the sidebar is a rail whatever the stored preference says.
 *
 * 240px of navigation out of a 390px phone leaves 150px of content — the
 * table squeezed to a sliver, the heading clipped mid-word, the toolbar in a
 * single stacked column. Collapsing it by hand fixed all of that, which is
 * the tell: the width was never a preference at this size, it was a default
 * nobody could have wanted.
 */
const NARROW = "(max-width: 640px)";

const narrowStore = {
  subscribe(listener: () => void) {
    const query = window.matchMedia(NARROW);
    query.addEventListener("change", listener);

    // And the plain resize, because a media-query change event is not
    // guaranteed to arrive when the viewport is being emulated rather than
    // dragged — which left the rail stuck across the breakpoint. `get` is a
    // matchMedia read either way, so an extra listener costs a comparison.
    window.addEventListener("resize", listener);

    return () => {
      query.removeEventListener("change", listener);
      window.removeEventListener("resize", listener);
    };
  },

  get(): boolean {
    return window.matchMedia(NARROW).matches;
  },
};

export interface SidebarActor {
  name: string;
  code: string;
  role: string;
}

export function Sidebar({ actor }: { actor: SidebarActor }) {
  const pathname = usePathname();
  const [signingOut, startSignOut] = useTransition();

  const chosen = useSyncExternalStore(
    railStore.subscribe,
    railStore.get,
    // The server renders it expanded; a collapsed preference applies as soon
    // as the client takes over.
    () => false,
  );

  // The server has no viewport either, and guessing narrow would flash a rail
  // at every desktop reader. Guessing wide flashes labels on a phone for one
  // frame, which is the cheaper mistake.
  const narrow = useSyncExternalStore(
    narrowStore.subscribe,
    narrowStore.get,
    () => false,
  );

  const railed = chosen || narrow;

  const toggle = useCallback(() => {
    railStore.set(!railStore.get());
  }, []);

  const visible = NAV.filter(
    (item) =>
      !HIDDEN.has(item.href) &&
      // Hidden rather than shown-and-refused: a link that always says no is
      // a worse way of saying "not for you" than not being there.
      (!("owner" in item && item.owner) || actor.role === "owner"),
  );

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
        {railed ? (
          // On a phone the toggle is gone, so without this the header is an
          // empty ruled strip. The initials keep the rail identifiable and
          // give the border something to sit under.
          narrow && (
            <span
              title="Sree Lakshmi Kalamkari"
              className="text-[13px] font-semibold tracking-tight text-ink"
            >
              SLK
            </span>
          )
        ) : (
          <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold tracking-tight text-ink">
            Sree Lakshmi Kalamkari
          </span>
        )}

        {/*
          Hidden on a phone rather than disabled. There is nothing it could
          do there — expanding would leave 150px of content — and a control
          that is present but refuses is worse than one that knows when it
          does not apply.
        */}
        <button
          type="button"
          onClick={toggle}
          hidden={narrow}
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
                // The label is the accessible name whether or not it is
                // drawn. A railed link used to carry only a `title`, which a
                // screen reader may skip and a touch screen never shows.
                aria-label={item.label}
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

      {/*
        Who is signed in, at the bottom where a footer already was.

        Worth the room: the phone and the portal now share one set of codes,
        and a screen that does not say which of them you are is a screen where
        somebody prices a saree as somebody else.
      */}
      <div className="mt-auto border-t border-rule">
        {railed ? (
          <div className="flex flex-col items-center gap-1 p-2">
            <span
              title={`${actor.name} · ${actor.code}`}
              className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2"
            >
              {initials(actor.name)}
            </span>
            <SignOut pending={signingOut} onSignOut={startSignOut} railed />
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink">
                {actor.name}
              </p>
              <p className="truncate font-mono text-[10.5px] text-faint">
                {actor.code} · {actor.role}
              </p>
            </div>
            <SignOut pending={signingOut} onSignOut={startSignOut} />
          </div>
        )}
      </div>
    </nav>
  );
}

/** Two letters, so a rail can still say who it belongs to. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";

  return (first + last).toUpperCase();
}

function SignOut({
  pending,
  onSignOut,
  railed = false,
}: {
  pending: boolean;
  onSignOut: (run: () => void) => void;
  railed?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      // Wrapped in the transition the caller owns, so the button can say it is
      // working. Signing out revokes a row as well as dropping the cookie, so
      // it is a round trip rather than an instant.
      onClick={() => onSignOut(() => void signOut())}
      aria-label="Sign out"
      title="Sign out"
      className={`rounded-md text-[12px] text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50 ${
        railed ? "p-1.5" : "px-2 py-1 text-left"
      }`}
    >
      {railed ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 17H4.5A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3H8 M13 13.5 16.5 10 13 6.5 M16.5 10H7.5" />
        </svg>
      ) : pending ? (
        "Signing out…"
      ) : (
        "Sign out"
      )}
    </button>
  );
}
