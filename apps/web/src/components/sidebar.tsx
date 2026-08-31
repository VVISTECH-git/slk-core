"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Hidden, not deleted — the prototype's pattern. Every screen below still
 * builds and is still reachable by URL; the sidebar is cut to what is being
 * worked on, so the app shows one finished thing rather than several
 * half-finished ones. Remove a line to bring a screen back.
 */
const HIDDEN = new Set(["/stock", "/vocabulary"]);

const NAV = [
  { href: "/records", label: "Product Records" },
  { href: "/stock", label: "Stock" },
  { href: "/vocabulary", label: "Categories & Attributes" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const visible = NAV.filter((item) => !HIDDEN.has(item.href));

  return (
    <nav
      aria-label="Main"
      className="flex w-60 flex-none flex-col border-r border-rule bg-surface-2"
    >
      <div className="border-b border-rule px-5 py-5">
        <div className="text-[15px] leading-tight font-semibold tracking-tight text-ink">
          Sree Lakshmi Kalamkari
        </div>
      </div>

      <ul className="flex flex-col gap-0.5 p-3">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center rounded-md px-3 py-2 text-[13.5px] transition-colors",
                  active
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : "text-ink-2 hover:bg-surface-3",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-rule px-5 py-4 font-mono text-[10.5px] leading-relaxed text-faint">
        slk-core
        <br />
        local · postgres 17
      </div>
    </nav>
  );
}
