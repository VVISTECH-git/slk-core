"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Type-only, so the module that imports `db` is erased at build time rather
// than following this client component into the browser bundle.
import type { ReservationRow } from "@/lib/reservations";

import { Button, Header, ToastBar, useToast } from "@/components/ui";

import { packReservation } from "./actions";

/**
 * Orders waiting to be packed.
 *
 * Every row here is a reservation Shopify's own webhook already booked —
 * nothing on this screen writes anything until "Pack" is pressed. Packing
 * is the moment the piece actually leaves: it writes the movement and
 * closes the reservation together, so the two can never drift apart the
 * way a manual re-entry could.
 */
export function Picking({ rows }: { rows: ReservationRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [chosen, setChosen] = useState<Record<string, string>>({});

  function pack(reservationId: string) {
    const locationId = chosen[reservationId];
    if (locationId === undefined) return;

    start(async () => {
      const result = await packReservation(reservationId, locationId);
      showToast(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Picking List"
        lede={
          rows.length === 0
            ? "Nothing waiting — every order that has come in is packed."
            : `${rows.length} order${rows.length === 1 ? "" : "s"} waiting to be packed, oldest first.`
        }
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-[13px] text-muted">
              Nothing here right now.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-rule-2 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[13px] font-semibold text-ink">
                      {r.productCode}
                    </span>
                    <span className="text-[13px] text-ink-2">{r.designName}</span>
                    {r.colour && <span className="text-[12.5px] text-muted">{r.colour}</span>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {r.channelName}
                    {r.externalOrderName ? ` · ${r.externalOrderName}` : ""} · qty {r.qty} ·{" "}
                    {r.createdAt}
                  </p>
                </div>

                <div className="flex flex-none items-center gap-2">
                  {r.holding.length === 0 ? (
                    <span className="text-[12.5px] text-brick">Nothing held anywhere</span>
                  ) : (
                    <>
                      <select
                        value={chosen[r.id] ?? ""}
                        onChange={(e) =>
                          setChosen((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="rounded-md border border-rule-2 bg-surface px-2 py-1.5 text-[13px] text-ink"
                      >
                        <option value="" disabled>
                          Pack from…
                        </option>
                        {r.holding.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.qty})
                          </option>
                        ))}
                      </select>
                      <Button
                        tone="primary"
                        disabled={pending || chosen[r.id] === undefined}
                        onClick={() => pack(r.id)}
                      >
                        Pack
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}
