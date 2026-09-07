"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Header } from "@/components/ui";

import { createRecord, recordMovement, type ActionResult } from "../actions";
import { buildImportTemplate, parseImportFile, type ParsedRow } from "./import-actions";

/**
 * Bulk-loads products from a spreadsheet instead of the six-tab editor, one
 * row at a time.
 *
 * A row is either brand new — `createRecord`, the exact function New Record
 * calls — or a restock of something that already exists — `recordMovement`
 * with kind "received", the exact function Record A Movement calls. Never a
 * write of its own: a row can only ever do what one of those two screens
 * could already do by hand.
 *
 * Sent from the browser one row at a time rather than as a single server
 * action, for the same reason "Republish all" on Channels is: a serverless
 * function looping over hundreds of writes times out with nothing to show
 * for it, while this way the page counts them landing and names the one that
 * did not.
 */
function importRow(row: ParsedRow): Promise<ActionResult> {
  return row.mode === "new" ? createRecord(row.draft) : recordMovement(row.colourwayId, row.movement);
}
export function ImportClient() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);

  const [results, setResults] = useState<Map<number, ActionResult>>(new Map());
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);

  const importable = rows?.filter((r) => r.errors.length === 0) ?? [];
  const skipped = rows?.filter((r) => r.errors.length > 0) ?? [];

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await buildImportTemplate();
      if (!result.ok) {
        setDownloadError(result.message);
        return;
      }

      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file === undefined) return;

    setFileName(file.name);
    setParsing(true);
    setParseError(null);
    setRows(null);
    setResults(new Map());
    setBulk(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await parseImportFile(formData);

      if (!result.ok) {
        setParseError(result.message);
        return;
      }
      if (result.rows.length === 0) {
        setParseError("No rows found below the header — nothing to import.");
        return;
      }

      setRows(result.rows);
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handleImport() {
    if (importable.length === 0) return;

    setBulk({ done: 0, total: importable.length, failed: 0 });
    startTransition(async () => {
      const next = new Map<number, ActionResult>();
      for (const row of importable) {
        const outcome = await importRow(row);
        next.set(row.rowNumber, outcome);
        setResults(new Map(next));
        setBulk({
          done: next.size,
          total: importable.length,
          failed: [...next.values()].filter((r) => !r.ok).length,
        });
      }
    });
  }

  const done = bulk !== null && bulk.done === bulk.total;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        crumbs={[{ label: "Product Management", href: "/records" }, { label: "Import Consignments" }]}
        title="Import Consignments"
        lede="Load products in bulk from a spreadsheet, instead of one at a time in the editor or the app. Leave Existing Product Code blank for a brand-new product, or fill it in to add a consignment of stock to one that's already in the catalogue."
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <section className="rounded-lg border border-rule-2 p-5">
            <h2 className="text-[14px] font-semibold text-ink">1. Download the template</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Every dropdown in it is built from Master Lists as it stands right now — a value retired
              since the last template was downloaded will not be offered.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="mt-3 rounded-lg bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {downloading ? "Preparing…" : "Download template (.xlsx)"}
            </button>
            {downloadError !== null && (
              <p className="mt-2 text-[12.5px] text-brick">{downloadError}</p>
            )}
          </section>

          <section className="rounded-lg border border-rule-2 p-5">
            <h2 className="text-[14px] font-semibold text-ink">2. Upload the filled-in file</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Nothing is saved yet at this step — the file is only read, so a mistake here costs nothing.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              onChange={handleFile}
              disabled={parsing}
              className="mt-3 text-[13px] text-ink"
            />
            {fileName !== null && (
              <p className="mt-2 text-[12.5px] text-muted">
                {parsing ? `Reading ${fileName}…` : fileName}
              </p>
            )}
            {parseError !== null && <p className="mt-2 text-[12.5px] text-brick">{parseError}</p>}

            {rows !== null && (
              <div className="mt-4 space-y-3">
                <p className="text-[13px] text-ink">
                  {importable.length} row{importable.length === 1 ? "" : "s"} ready to import.
                  {skipped.length > 0 &&
                    ` ${skipped.length} row${skipped.length === 1 ? "" : "s"} will be skipped — see below.`}
                </p>

                {skipped.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-surface-2 p-3 text-[12.5px] text-ink-2">
                    {skipped.map((row) => (
                      <li key={row.rowNumber}>
                        <span className="font-medium">Row {row.rowNumber}:</span> {row.errors.join(" ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {rows !== null && importable.length > 0 && (
            <section className="rounded-lg border border-rule-2 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[14px] font-semibold text-ink">3. Import</h2>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={pending || bulk !== null}
                  className="ml-auto rounded-lg bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import {importable.length} row{importable.length === 1 ? "" : "s"}
                </button>
              </div>

              {bulk !== null && (
                <p className={`mt-3 text-[13px] ${bulk.failed > 0 ? "text-brick" : "text-ink-2"}`}>
                  {!done
                    ? `Importing ${bulk.done + 1} of ${bulk.total}…`
                    : bulk.failed === 0
                      ? `Imported all ${bulk.total}.`
                      : `${bulk.total - bulk.failed} imported, ${bulk.failed} failed — see below.`}
                </p>
              )}

              {results.size > 0 && (
                <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto rounded-md bg-surface-2 p-3 text-[12.5px]">
                  {importable
                    .filter((row) => results.has(row.rowNumber))
                    .map((row) => {
                      const outcome = results.get(row.rowNumber)!;
                      return (
                        <li key={row.rowNumber} className={outcome.ok ? "text-ink-2" : "text-brick"}>
                          <span className="font-medium">Row {row.rowNumber}:</span> {outcome.message}
                        </li>
                      );
                    })}
                </ul>
              )}

              {done && (
                <button
                  type="button"
                  onClick={() => router.push("/records")}
                  className="mt-4 rounded-lg border border-rule-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2"
                >
                  Back to Product Management
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
