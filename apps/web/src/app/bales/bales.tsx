"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  Cell,
  ColumnsControl,
  FilterChips,
  FilterControl,
  HeaderCell,
  activeFilters,
  useColumnDrag,
  type Filters,
} from "@/components/grid";
import { useColumnOrder, useColumnWidths, useVisibleColumns } from "@/lib/column-widths";
import {
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  RowMenu,
  ToastBar,
  inputClass,
  useToast,
} from "@/components/ui";
import type { BaleRow, ClothItemRow, SupplierRow } from "@/lib/bales";

import { BALE_TYPES, UOMS } from "./constants";
import {
  createBale,
  cutBale,
  generateQrCodes,
  markBaleReturned,
  setBaleType,
  updateBale,
  type ActionResult,
  type BaleDraft,
  type BaleEditDraft,
} from "./actions";

const STATUS_LABEL: Record<BaleRow["status"], string> = {
  awaiting_cutting: "Awaiting cutting",
  cut: "Cut",
  returned: "Returned",
};

const STATUS_STYLE: Record<BaleRow["status"], { background: string; color: string }> = {
  awaiting_cutting: { background: "var(--warn-soft)", color: "var(--warn)" },
  cut: { background: "var(--ok-soft)", color: "var(--ok)" },
  returned: { background: "var(--brick-soft)", color: "var(--brick)" },
};

/**
 * Bale Intake's own grid, on the same furniture Product Management's is
 * built from (`@/components/grid`) — resizable, reorderable, hideable
 * columns and a filter panel, rather than a bespoke lesser version. No
 * pager: a bale is added by hand a few times a week, not imported by the
 * thousand, so there's nothing yet for one to page through.
 */
const COLUMNS = [
  { key: "code", label: "Bale ID", width: 90 },
  { key: "supplierName", label: "Supplier", width: 150 },
  { key: "type", label: "Type", width: 100 },
  { key: "itemName", label: "Item", width: 200 },
  { key: "quantity", label: "Quantity", width: 110 },
  { key: "baleCount", label: "Bales", width: 70 },
  { key: "perThaanMetres", label: "Per Thaan Mtr", width: 120 },
  { key: "billEntryDate", label: "Bill Entry Date", width: 130 },
  { key: "status", label: "Status", width: 140 },
  { key: "thaans", label: "Thaans", width: 150 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
const COLUMN_KEYS: readonly string[] = COLUMNS.map((c) => c.key);
const NUMERIC = new Set<ColumnKey>(["quantity", "baleCount", "thaans", "perThaanMetres"]);
const ACTIONS_WIDTH = 56;

/** The columns a filter dropdown actually makes sense for — not a unique code or a date. */
const FILTERABLE = new Set<ColumnKey>(["supplierName", "type", "itemName", "status"]);

function cellText(row: BaleRow, key: ColumnKey): string {
  switch (key) {
    case "code":
      return row.code;
    case "supplierName":
      return row.supplierName;
    case "type":
      return row.type;
    case "itemName":
      return row.itemName;
    case "quantity":
      return String(row.metresReceived);
    case "baleCount":
      return String(row.baleCount);
    case "perThaanMetres":
      return row.perThaanMetres === null ? "" : String(row.perThaanMetres);
    case "billEntryDate":
      return row.billEntryDate;
    case "status":
      return STATUS_LABEL[row.status];
    case "thaans":
      return String(row.thaanCount);
  }
}

function sortValue(row: BaleRow, key: ColumnKey): string | number {
  switch (key) {
    case "quantity":
      return row.metresReceived;
    case "baleCount":
      return row.baleCount;
    case "thaans":
      return row.thaanCount;
    case "perThaanMetres":
      return row.perThaanMetres ?? -1;
    case "billEntryDate":
      return row.billEntryDateOn;
    default:
      return cellText(row, key).toLowerCase();
  }
}

function todayIsoDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

function draftFrom(row: BaleRow): BaleDraft {
  return {
    supplierId: row.supplierId,
    billEntryDate: row.billEntryDateOn,
    transporter: row.transporter ?? "",
    invoiceNumber: row.invoiceNumber ?? "",
    invoiceDate: row.invoiceDate ?? "",
    type: row.type,
    metresReceived: String(row.metresReceived),
    uom: row.uom,
    itemId: row.itemId,
    baleCount: String(row.baleCount),
    notes: row.notes ?? "",
  };
}

/**
 * Kora to Shelf, step one: receiving a bale.
 *
 * Deliberately its own screen, its own table, its own everything — not a
 * tab bolted onto Product Management. A bale has no design and no colour
 * yet; joining it to that screen would mean pretending it does.
 */
export function Bales({
  rows,
  suppliers,
  clothItems,
}: {
  rows: BaleRow[];
  suppliers: SupplierRow[];
  clothItems: ClothItemRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, showToast] = useToast();
  const [adding, setAdding] = useState(false);
  const [cutting, setCutting] = useState<BaleRow | null>(null);
  const [editing, setEditing] = useState<BaleRow | null>(null);
  const [duplicating, setDuplicating] = useState<BaleRow | null>(null);
  const [confirming, setConfirming] = useState<
    { kind: "generateQr" | "markReturned"; bale: BaleRow } | null
  >(null);

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    start(async () => {
      const result = await action();
      showToast(result);
      if (result.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  const awaitingCutting = rows.filter((r) => r.status === "awaiting_cutting").length;
  const canAdd = suppliers.length > 0 && clothItems.length > 0;

  const [filters, setFilters] = useState<Filters<ColumnKey>>({});
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 } | null>(null);

  const { visible, setVisible, reset: resetColumns, chosen: columnsChosen } = useVisibleColumns(
    "bales",
    COLUMN_KEYS,
  );
  const { widths, setWidth, reset: resetWidths, resized } = useColumnWidths("bales");
  const { order, move, reset: resetOrder, ordered } = useColumnOrder("bales", COLUMN_KEYS);

  const columns = order
    .map((key) => COLUMNS.find((c) => c.key === key))
    .filter((c): c is (typeof COLUMNS)[number] => c !== undefined && visible.has(c.key));

  const drag = useColumnDrag<ColumnKey>(
    columns.map((c) => c.key),
    move,
  );

  const widthOf = (c: { key: ColumnKey; width: number }) => widths[c.key] ?? c.width;

  const valuesFor = (key: ColumnKey): string[] =>
    NUMERIC.has(key) ? [] : [...new Set(rows.map((r) => cellText(r, key)))].sort();

  const filtered = useMemo(() => {
    let out = rows.filter((row) => {
      for (const [key, want] of Object.entries(filters)) {
        if (want === undefined || want.length === 0) continue;
        if (!want.includes(cellText(row, key as ColumnKey))) return false;
      }
      return true;
    });

    if (sort !== null) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const x = sortValue(a, key);
        const y = sortValue(b, key);
        if (x < y) return -dir;
        if (x > y) return dir;
        return 0;
      });
    }

    return out;
  }, [rows, filters, sort]);

  const active = activeFilters(filters);

  return (
    <div className="flex h-screen flex-col overflow-hidden px-8 py-8">
      <header className="relative z-30 mb-5 flex flex-none flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Bale Intake</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Kora cloth received from suppliers. {rows.length} bale{rows.length === 1 ? "" : "s"}{" "}
            recorded{awaitingCutting > 0 ? `, ${awaitingCutting} awaiting cutting` : ""}.
          </p>
        </div>

        {canAdd && (
          <Button tone="primary" onClick={() => setAdding(true)}>
            Add bale
          </Button>
        )}

        <FilterControl
          columns={COLUMNS.filter((c) => FILTERABLE.has(c.key))}
          valuesFor={valuesFor}
          filters={filters}
          onChange={(key, values) => setFilters((prev) => ({ ...prev, [key]: values }))}
          onClearAll={() => setFilters({})}
        />

        <ColumnsControl
          columns={COLUMNS}
          order={order}
          visible={visible}
          onChange={setVisible}
          onMove={move}
          chosen={columnsChosen}
          resized={resized}
          ordered={ordered}
          onResetColumns={resetColumns}
          onResetWidths={resetWidths}
          onResetOrder={resetOrder}
        />
      </header>

      <FilterChips
        columns={COLUMNS}
        filters={filters}
        onRemove={(key) =>
          setFilters((prev) => {
            const { [key]: _drop, ...rest } = prev;
            return rest;
          })
        }
        onClearAll={() => setFilters({})}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-rule bg-surface">
        {!canAdd ? (
          <p className="px-4 py-16 text-center text-[13px] text-muted">
            {suppliers.length === 0 && (
              <>
                No suppliers on file yet.{" "}
                <Link href="/suppliers" className="text-brick underline">
                  Add one
                </Link>
                .
              </>
            )}
            {suppliers.length === 0 && clothItems.length === 0 && <br />}
            {clothItems.length === 0 && (
              <>
                No cloth items on file yet.{" "}
                <Link href="/items" className="text-brick underline">
                  Add one
                </Link>
                .
              </>
            )}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-[13px] text-muted">
            No bales recorded yet. Add the first one to get started.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="w-full table-fixed text-[13.5px]"
              style={{ minWidth: columns.reduce((sum, c) => sum + widthOf(c), 0) + ACTIONS_WIDTH }}
            >
              <thead>
                <tr>
                  {columns.map((c) => (
                    <HeaderCell
                      key={c.key}
                      column={c}
                      width={widthOf(c)}
                      numeric={NUMERIC.has(c.key)}
                      sortDir={sort?.key === c.key ? sort.dir : null}
                      onSort={() =>
                        setSort((prev) =>
                          prev?.key === c.key
                            ? { key: c.key, dir: prev.dir === 1 ? -1 : 1 }
                            : { key: c.key, dir: 1 },
                        )
                      }
                      onResize={(w) => setWidth(c.key, w)}
                      drag={drag}
                    />
                  ))}
                  <th
                    style={{ width: ACTIONS_WIDTH }}
                    className={`sticky top-0 z-20 border-b border-rule bg-surface px-3 py-2.5 text-right text-[12px] font-medium text-muted ${
                      drag.active !== null && drag.before === "end"
                        ? "shadow-[inset_2px_0_0_0_var(--brick)]"
                        : ""
                    }`}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-4 py-16 text-center">
                      <p className="text-[13.5px] text-muted">
                        No bales match {active.length > 0 ? "these filters" : "that"}.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setEditing(r)}
                      className="h-11 cursor-pointer border-b border-rule last:border-b-0 hover:bg-surface-2"
                    >
                      {columns.map((c) => {
                        if (c.key === "type") {
                          return (
                            <Cell key={c.key} title={r.type}>
                              <InlineTypeCell
                                value={r.type}
                                busy={pending}
                                onPick={(type) => run(() => setBaleType(r.id, type))}
                              />
                            </Cell>
                          );
                        }

                        if (c.key === "status") {
                          return (
                            <Cell key={c.key} title={STATUS_LABEL[r.status]}>
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                                style={STATUS_STYLE[r.status]}
                              >
                                {STATUS_LABEL[r.status]}
                              </span>
                            </Cell>
                          );
                        }

                        if (c.key === "thaans") {
                          return (
                            <Cell key={c.key} title={cellText(r, c.key)}>
                              {r.thaanCount === 0 ? (
                                "—"
                              ) : (
                                <>
                                  {r.thaanCount}{" "}
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                                    style={
                                      r.qrGeneratedCount >= r.thaanCount
                                        ? { background: "var(--ok-soft)", color: "var(--ok)" }
                                        : { background: "var(--warn-soft)", color: "var(--warn)" }
                                    }
                                  >
                                    {r.qrGeneratedCount >= r.thaanCount ? "QR ready" : "QR pending"}
                                  </span>
                                </>
                              )}
                            </Cell>
                          );
                        }

                        if (c.key === "quantity") {
                          return (
                            <Cell key={c.key} numeric title={`${r.metresReceived} ${r.uom}`}>
                              {r.metresReceived.toLocaleString("en-IN")} {r.uom}
                            </Cell>
                          );
                        }

                        if (c.key === "itemName") {
                          return (
                            <Cell key={c.key} title={[r.itemName, r.notes].filter(Boolean).join(" — ")}>
                              {r.itemName}
                            </Cell>
                          );
                        }

                        if (c.key === "perThaanMetres") {
                          return (
                            <Cell key={c.key} numeric title={r.perThaanMetres === null ? "" : String(r.perThaanMetres)}>
                              {r.perThaanMetres === null ? "—" : r.perThaanMetres.toLocaleString("en-IN")}
                            </Cell>
                          );
                        }

                        return (
                          <Cell
                            key={c.key}
                            numeric={NUMERIC.has(c.key)}
                            title={cellText(r, c.key)}
                            className={c.key === "code" ? "font-mono text-ink" : ""}
                          >
                            {cellText(r, c.key)}
                          </Cell>
                        );
                      })}

                      <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          label={r.code}
                          items={[
                            {
                              label: "Duplicate",
                              disabled: pending,
                              onSelect: () => setDuplicating(r),
                            },
                            {
                              label: "Record cutting",
                              disabled: pending || r.status !== "awaiting_cutting",
                              hint:
                                r.status !== "awaiting_cutting"
                                  ? "Already cut, returned, or otherwise no longer waiting."
                                  : undefined,
                              onSelect: () => setCutting(r),
                            },
                            {
                              label: "Generate QR codes",
                              disabled: pending || r.qrGeneratedCount >= r.thaanCount || r.thaanCount === 0,
                              hint:
                                r.thaanCount === 0
                                  ? "This bale hasn't been cut yet."
                                  : r.qrGeneratedCount >= r.thaanCount
                                    ? "Every Thaan from this bale already has a code."
                                    : undefined,
                              onSelect: () => setConfirming({ kind: "generateQr", bale: r }),
                            },
                            {
                              label: "Print QR codes",
                              disabled: r.qrGeneratedCount === 0,
                              hint:
                                r.qrGeneratedCount === 0
                                  ? "No Thaans here have a QR code yet."
                                  : undefined,
                              onSelect: () => router.push(`/thaans/print/${r.id}`),
                            },
                            {
                              label: "Mark returned",
                              danger: true,
                              disabled: pending || r.status !== "awaiting_cutting",
                              hint:
                                r.status !== "awaiting_cutting"
                                  ? "Only a bale still awaiting cutting can be returned."
                                  : undefined,
                              onSelect: () => setConfirming({ kind: "markReturned", bale: r }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <AddDrawer
          suppliers={suppliers}
          clothItems={clothItems}
          pending={pending}
          onClose={() => setAdding(false)}
          onRun={run}
        />
      )}

      {duplicating !== null && (
        <AddDrawer
          suppliers={suppliers}
          clothItems={clothItems}
          pending={pending}
          initial={draftFrom(duplicating)}
          onClose={() => setDuplicating(null)}
          onRun={run}
        />
      )}

      {editing !== null && (
        <EditDrawer
          bale={editing}
          clothItems={clothItems}
          pending={pending}
          onClose={() => setEditing(null)}
          onRun={run}
        />
      )}

      {cutting !== null && (
        <CutDrawer bale={cutting} pending={pending} onClose={() => setCutting(null)} onRun={run} />
      )}

      {confirming !== null && confirming.kind === "generateQr" && (
        <ConfirmDialog
          title={`Generate QR codes for ${confirming.bale.code}?`}
          description={`Assigns a permanent code to each of its ${confirming.bale.thaanCount} Thaan${confirming.bale.thaanCount === 1 ? "" : "s"}. This can't be undone — a code, once generated, is fixed.`}
          confirmLabel="Generate"
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            run(() => generateQrCodes(confirming.bale.id), () => setConfirming(null))
          }
        />
      )}

      {confirming !== null && confirming.kind === "markReturned" && (
        <ConfirmDialog
          title={`Mark ${confirming.bale.code} returned?`}
          description="Records this bale as sent back to the supplier. It can no longer be cut."
          confirmLabel="Mark returned"
          danger
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            run(() => markBaleReturned(confirming.bale.id), () => setConfirming(null))
          }
        />
      )}

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

/**
 * The fields shared by adding a bale, duplicating one, and editing one —
 * everything but the supplier, which only Add can set.
 */
function BaleFields({
  draft,
  set,
  clothItems,
}: {
  draft: Omit<BaleDraft, "supplierId">;
  set: <K extends keyof Omit<BaleDraft, "supplierId">>(
    key: K,
    value: Omit<BaleDraft, "supplierId">[K],
  ) => void;
  clothItems: ClothItemRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Bill entry date"
          hint="When you're entering this — not the invoice's own date. Back-date it for an old bale."
        >
          <input
            type="date"
            className={inputClass}
            value={draft.billEntryDate}
            onChange={(e) => set("billEntryDate", e.target.value)}
          />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={draft.type} onChange={(e) => set("type", e.target.value)}>
            <option value="">Choose…</option>
            {BALE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Transporter" hint="Optional — who delivered it.">
        <input
          className={inputClass}
          value={draft.transporter}
          onChange={(e) => set("transporter", e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Invoice number" hint="Leave blank if it hasn't arrived yet.">
          <input
            className={inputClass}
            value={draft.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
          />
        </Field>
        <Field label="Invoice date">
          <input
            type="date"
            className={inputClass}
            value={draft.invoiceDate}
            onChange={(e) => set("invoiceDate", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Quantity received">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={draft.metresReceived}
            onChange={(e) => set("metresReceived", e.target.value)}
          />
        </Field>
        <Field label="Unit">
          <select className={inputClass} value={draft.uom} onChange={(e) => set("uom", e.target.value)}>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number of bales">
          <input
            type="number"
            min="1"
            step="1"
            className={inputClass}
            value={draft.baleCount}
            onChange={(e) => set("baleCount", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Item" hint="Not on the list? Add it from Cloth Items first.">
        <select className={inputClass} value={draft.itemId} onChange={(e) => set("itemId", e.target.value)}>
          <option value="">Choose…</option>
          {clothItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" hint="Anything else worth recording about this entry.">
        <textarea
          className={inputClass}
          rows={2}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </div>
  );
}

function AddDrawer({
  suppliers,
  clothItems,
  pending,
  initial,
  onClose,
  onRun,
}: {
  suppliers: SupplierRow[];
  clothItems: ClothItemRow[];
  pending: boolean;
  /** Set when opened as "Duplicate" — the same fields as the row it was copied from. */
  initial?: BaleDraft;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<BaleDraft>(
    initial !== undefined
      ? { ...initial, billEntryDate: todayIsoDate() }
      : {
          supplierId: "",
          billEntryDate: todayIsoDate(),
          transporter: "",
          invoiceNumber: "",
          invoiceDate: "",
          type: "",
          metresReceived: "",
          uom: "Mtrs",
          itemId: "",
          baleCount: "1",
          notes: "",
        },
  );

  const set = <K extends keyof BaleDraft>(key: K, value: BaleDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid =
    draft.supplierId !== "" && draft.itemId !== "" && draft.type !== "" && Number(draft.metresReceived) > 0;

  return (
    <Drawer
      open
      title={initial === undefined ? "New bale" : "Duplicate bale"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => createBale(draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Supplier">
          <select
            className={inputClass}
            value={draft.supplierId}
            onChange={(e) => set("supplierId", e.target.value)}
            autoFocus
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <BaleFields draft={draft} set={set} clothItems={clothItems} />
      </div>
    </Drawer>
  );
}

function EditDrawer({
  bale,
  clothItems,
  pending,
  onClose,
  onRun,
}: {
  bale: BaleRow;
  clothItems: ClothItemRow[];
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [draft, setDraft] = useState<BaleEditDraft>(draftFrom(bale));

  const set = <K extends keyof BaleEditDraft>(key: K, value: BaleEditDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const valid = draft.itemId !== "" && draft.type !== "" && Number(draft.metresReceived) > 0;

  return (
    <Drawer
      open
      title={bale.code}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => updateBale(bale.id, draft), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Supplier" hint="Fixed — the bale's own code already carries this supplier's letter.">
          <input className={inputClass} value={bale.supplierName} disabled />
        </Field>

        <BaleFields draft={draft} set={set} clothItems={clothItems} />
      </div>
    </Drawer>
  );
}

function CutDrawer({
  bale,
  pending,
  onClose,
  onRun,
}: {
  bale: BaleRow;
  pending: boolean;
  onClose: () => void;
  onRun: (action: () => Promise<ActionResult>, onOk?: () => void) => void;
}) {
  const [thaanCount, setThaanCount] = useState("");

  const valid = Number.isInteger(Number(thaanCount)) && Number(thaanCount) > 0;

  return (
    <Drawer
      open
      title={`Cut ${bale.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending || !valid}
            onClick={() => onRun(() => cutBale(bale.id, thaanCount), onClose)}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Number of Thaans"
          hint="How many pieces the whole bale was cut into. Entered once — cutting is done in one sitting."
        >
          <input
            type="number"
            min="1"
            step="1"
            autoFocus
            className={inputClass}
            value={thaanCount}
            onChange={(e) => setThaanCount(e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  );
}

/**
 * Type, changeable where it sits — same reasoning as Product Management's
 * own inline lookup cells: five values is not worth a six-field drawer.
 * A simplified version of that cell rather than a reuse of it: Type is
 * never unset, so there's no "Not set" option to offer.
 */
function InlineTypeCell({
  value,
  busy,
  onPick,
}: {
  value: string;
  busy: boolean;
  onPick: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const r = anchor.current?.getBoundingClientRect();
    if (r) {
      const height = menu.current?.offsetHeight ?? 200;
      const below = window.innerHeight - r.bottom;
      setAt({
        top: below < height + 8 ? Math.max(8, r.top - height - 4) : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 168)),
      });
    }

    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll(e: Event) {
      if (menu.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function away() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", away);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={(e) => {
          // The row underneath opens the whole editor. This cell answers
          // for itself instead.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${value} — click to change`}
        className={`group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded px-1 text-left transition-colors hover:bg-surface-3 ${
          busy ? "opacity-50" : ""
        } ${open ? "bg-surface-3" : ""}`}
      >
        <span className="truncate">{value}</span>
        <span
          aria-hidden
          className={`ml-auto flex-none text-[10px] text-faint transition-opacity ${
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ▾
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: at?.top ?? -9999,
              left: at?.left ?? -9999,
              visibility: at === null ? "hidden" : "visible",
            }}
            className="z-50 w-40 overflow-hidden rounded-lg border border-rule bg-surface py-1 shadow-[var(--shadow)]"
          >
            {BALE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === value}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (t !== value) onPick(t);
                }}
                className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-2 ${
                  t === value ? "bg-brick-soft font-medium text-brick" : "text-ink-2"
                }`}
              >
                {t}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
