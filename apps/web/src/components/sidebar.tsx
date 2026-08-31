"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The screens the prototype settled on, in its order. Stock and Product
 * Records are placeholders until the catalogue tables exist; Vocabulary is
 * live, because the lookup master is the part that is actually built.
 */
const NAV = [
  { href: "/records", label: "Product Records", ready: false },
  { href: "/stock", label: "Stock", ready: false },
  { href: "/vocabulary", label: "Categories & Attributes", ready: true },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="flex w-60 flex-none flex-col border-r border-rule bg-surface-2"
    >
      <div className="border-b border-rule px-5 py-5">
        <div className="text-[15px] font-semibold tracking-tight text-ink">
          Sree Lakshmi
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
          Kalamkari
        </div>
      </div>

      <ul className="flex flex-col gap-0.5 p-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-disabled={!item.ready}
                className={[
                  "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[13.5px] transition-colors",
                  active
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : item.ready
                      ? "text-ink-2 hover:bg-surface-3"
                      : "text-faint",
                ].join(" ")}
              >
                {item.label}
                {!item.ready && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                    soon
                  </span>
                )}
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
