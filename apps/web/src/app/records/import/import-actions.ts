"use server";

import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { guard } from "@/lib/session";
import { loadOptions } from "@/lib/editor";
import { loadPickableLocations } from "@/lib/locations";
import type { AttributeKey } from "@/lib/attributes";
import type { MovementDraft } from "@/lib/movements";

import type { RecordDraft } from "../actions";
import { IMPORT_COLUMNS, IMPORT_LISTS, TEMPLATE_ROWS } from "./columns";

const PRODUCTS_SHEET = "Products";
const LISTS_SHEET = "Lists";
const FIRST_DATA_ROW = 2;

/** 1 -> A, 26 -> Z, 27 -> AA. Every list/column here fits well inside that. */
function columnLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/**
 * Builds the workbook fresh from whatever Master Lists holds right now, so a
 * template downloaded today offers exactly today's active vocabulary — never
 * a copy that quietly drifts from it.
 */
export async function buildImportTemplate():
  Promise<{ ok: true; base64: string; filename: string } | { ok: false; message: string }> {
  const denied = await guard("floor");
  if (denied !== null) return { ok: false, message: denied.message };

  const [options, locations] = await Promise.all([
    loadOptions(),
    loadPickableLocations(),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "slk-core";
  workbook.created = new Date();

  writeInstructionsSheet(workbook);
  const listColumn = writeListsSheet(workbook, options, locations);
  writeProductsSheet(workbook, listColumn);

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    ok: true,
    base64: Buffer.from(buffer).toString("base64"),
    filename: `consignment-import-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

function writeInstructionsSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 100 }];

  const required = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.header);

  const lines = [
    "How to use this template",
    "",
    "1. Fill in one row per product on the Products sheet. Do not change the header row or column order.",
    "2. Every column that says (choose from the list) only accepts values from its dropdown — click a cell and use the arrow to see the options.",
    "3. Leave a column blank if it doesn't apply to that product (e.g. Blouse fields on a Fabric row).",
    "4. Use \"Product Type (Clothing)\" for Clothing rows and \"Product Type (Home & Lifestyle)\" for Home & Lifestyle rows — leave the other one blank.",
    `5. Required for a brand-new product: ${required.join(", ")}.`,
    "6. To add a new product: leave Existing Product Code blank and fill in the rest of the row. This mints one new design, one colourway and one opening consignment.",
    "7. To add stock to a product that already exists: fill in Existing Product Code with its design code (e.g. SAR-SRI-SIL-0001) and Colour, plus Opening Stock Location and Quantity, and optionally Reference and Notes. Every other column is ignored for that row — the product's own details don't change, only its stock does.",
    "8. Descriptors is free text: comma-separated, matching labels from the Descriptor list (e.g. \"Soft, Pure\").",
    "9. Save the file and upload it on the Import Consignments screen. Every row is imported on its own — one bad row does not stop the rest, and you'll see exactly which rows failed and why.",
  ];

  lines.forEach((line, i) => {
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
    cell.alignment = { wrapText: true, vertical: "top" };
  });
}

/**
 * One column per list, active values only, in the same order Master Lists
 * would offer them — the hidden sheet the Products sheet's dropdowns point
 * at. Returns where each list ended up, so the caller can wire validations to
 * the right column letter without the two ever disagreeing about it.
 */
function writeListsSheet(
  workbook: ExcelJS.Workbook,
  options: Awaited<ReturnType<typeof loadOptions>>,
  locations: Awaited<ReturnType<typeof loadPickableLocations>>,
): Map<string, { letter: string; count: number }> {
  const sheet = workbook.addWorksheet(LISTS_SHEET, { state: "veryHidden" });
  const listColumn = new Map<string, { letter: string; count: number }>();

  IMPORT_LISTS.forEach((list, index) => {
    const col = index + 1;
    const letter = columnLetter(col);
    const labels =
      list === "location"
        ? locations.filter((l) => l.isInternal).map((l) => l.name)
        : (options[list] ?? []).map((o) => o.label);

    sheet.getCell(1, col).value = list;
    labels.forEach((label, row) => {
      sheet.getCell(row + 2, col).value = label;
    });

    listColumn.set(list, { letter, count: labels.length });
  });

  return listColumn;
}

function writeProductsSheet(
  workbook: ExcelJS.Workbook,
  listColumn: Map<string, { letter: string; count: number }>,
): void {
  const sheet = workbook.addWorksheet(PRODUCTS_SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = IMPORT_COLUMNS.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    width: Math.max(18, c.header.length + 2),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, col) => {
    const c = IMPORT_COLUMNS[col - 1]!;
    if (c.required) cell.font = { bold: true, color: { argb: "FF8A1F0C" } };
  });

  IMPORT_COLUMNS.forEach((column, index) => {
    if (column.kind !== "dropdown") return;

    const target = listColumn.get(column.list);
    if (target === undefined || target.count === 0) return;

    const letter = columnLetter(index + 1);
    const formula = `${LISTS_SHEET}!$${target.letter}$2:$${target.letter}$${target.count + 1}`;

    for (let row = FIRST_DATA_ROW; row <= TEMPLATE_ROWS + 1; row++) {
      sheet.getCell(`${letter}${row}`).dataValidation = {
        type: "list",
        allowBlank: !column.required,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: "Not on the list",
        error: `Choose one of the values in the dropdown for "${column.header}".`,
      };
    }
  });
}

/* ------------------------------------------------------------------ parse */

export type ParsedRow = { rowNumber: number; errors: string[] } & (
  | { mode: "new"; draft: RecordDraft }
  | { mode: "existingStock"; colourwayId: string; movement: MovementDraft }
);

export async function parseImportFile(
  formData: FormData,
): Promise<{ ok: true; rows: ParsedRow[] } | { ok: false; message: string }> {
  const denied = await guard("floor");
  if (denied !== null) return { ok: false, message: denied.message };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "No file was received." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    // Two copies of @types/node's Buffer end up in scope here — exceljs's own
    // and this app's — structurally identical at runtime but not to tsc. The
    // eslint-disable is for the one line that has to paper over it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    return { ok: false, message: "That doesn't look like a valid .xlsx file." };
  }

  const sheet = workbook.getWorksheet(PRODUCTS_SHEET);
  if (sheet === undefined) {
    return {
      ok: false,
      message: `No "${PRODUCTS_SHEET}" sheet found — download and fill in the template rather than building a new file.`,
    };
  }

  const [options, locations] = await Promise.all([
    loadOptions(),
    loadPickableLocations(),
  ]);

  const labelMaps = new Map<string, Map<string, string>>();
  for (const list of IMPORT_LISTS) {
    const source =
      list === "location"
        ? locations.filter((l) => l.isInternal).map((l) => ({ id: l.id, label: l.name }))
        : (options[list] ?? []);
    labelMaps.set(list, new Map(source.map((o) => [o.label.trim().toLowerCase(), o.id])));
  }
  const descriptorMap = new Map(
    (options["descriptor"] ?? []).map((o) => [o.label.trim().toLowerCase(), o.id]),
  );

  const raw: { rowNumber: number; cells: ExcelJS.CellValue[] }[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const cells = IMPORT_COLUMNS.map((_, i) => row.getCell(i + 1).value);
    const isBlank = cells.every((v) => v === null || v === undefined || String(v).trim() === "");
    if (isBlank) return;

    raw.push({ rowNumber, cells });
  });

  // One lookup per distinct code rather than one per row — a template with
  // the same existing product on fifty rows should cost fifty rows' worth of
  // stock, not fifty round trips to look up the same design.
  const colourwayCache = new Map<string, { id: string; colourId: string | null }[]>();

  const rows: ParsedRow[] = [];
  for (const { rowNumber, cells } of raw) {
    rows.push(await parseRow(rowNumber, cells, labelMaps, descriptorMap, colourwayCache));
  }

  return { ok: true, rows };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value).trim();
}

/**
 * The colourways an existing design's code could mean, keyed by colour id
 * (null for a design with exactly one colour, which needs no Colour cell to
 * disambiguate). Cached per code across the whole file — see the note above.
 */
async function colourwaysForCode(
  code: string,
  cache: Map<string, { id: string; colourId: string | null }[]>,
): Promise<{ id: string; colourId: string | null }[]> {
  const key = code.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const found = await db.execute<{ id: string; colourId: string | null }>(sql`
    select cw.id, cw.colour_id as "colourId"
    from colourway cw
    join design d on d.id = cw.design_id
    where lower(d.code) = ${key} and cw.is_active
  `);

  cache.set(key, found);
  return found;
}

async function parseRow(
  rowNumber: number,
  cells: ExcelJS.CellValue[],
  labelMaps: Map<string, Map<string, string>>,
  descriptorMap: Map<string, string>,
  colourwayCache: Map<string, { id: string; colourId: string | null }[]>,
): Promise<ParsedRow> {
  const errors: string[] = [];
  const attributes: Partial<Record<AttributeKey, string | null>> = {};
  let existingProductCode = "";
  let colourId: string | null = null;
  let secondaryColourId: string | null = null;
  let locationId = "";
  const prices = { cost: "", making: "", wholesale: "", retail: "", mrp: "" };
  let openingQty = "";
  let descriptors: string[] = [];
  let name = "";
  let notes = "";
  let reference = "";

  IMPORT_COLUMNS.forEach((column, index) => {
    const text = cellText(cells[index]);
    if (text === "") return;

    if (column.kind === "dropdown") {
      const resolved = labelMaps.get(column.list)?.get(text.toLowerCase());
      if (resolved === undefined) {
        errors.push(`${column.header}: "${text}" is not on that list.`);
        return;
      }

      switch (column.target) {
        case "colour":
          colourId = resolved;
          break;
        case "secondaryColour":
          secondaryColourId = resolved;
          break;
        case "location":
          locationId = resolved;
          break;
        default:
          attributes[column.target] = resolved;
      }
      return;
    }

    if (column.kind === "number") {
      if (column.target === "openingQty") {
        openingQty = text;
      } else {
        prices[column.target] = text;
      }
      return;
    }

    // text column
    if (column.target === "existingProductCode") {
      existingProductCode = text;
    } else if (column.target === "reference") {
      reference = text;
    } else if (column.target === "descriptors") {
      const wanted = text.split(",").map((s) => s.trim()).filter(Boolean);
      const ids: string[] = [];
      for (const w of wanted) {
        const id = descriptorMap.get(w.toLowerCase());
        if (id === undefined) {
          errors.push(`Descriptors: "${w}" is not on the Descriptor list.`);
        } else {
          ids.push(id);
        }
      }
      descriptors = ids;
    } else if (column.target === "name") {
      name = text;
    } else if (column.target === "notes") {
      notes = text;
    }
  });

  if (existingProductCode.trim() === "") {
    const draft: RecordDraft = {
      attributes,
      descriptors,
      colourId,
      secondaryColourId,
      prices,
      quantity: "",
      openingStock: [{ locationId, qty: openingQty }],
      imageSlots: [],
      notes,
      name,
      nameIsCustom: name.trim() !== "",
    };

    return { rowNumber, mode: "new", draft, errors };
  }

  // Existing-product mode: only the code, colour, location, quantity,
  // reference and notes cells mean anything — the taxonomy/price columns are
  // for a new product and are silently ignored here, not errored on, so a
  // row copied from a "new product" row above it can be turned into a
  // restock just by filling in the code.
  const candidates = await colourwaysForCode(existingProductCode, colourwayCache);

  if (candidates.length === 0) {
    errors.push(`Existing Product Code: no product with code "${existingProductCode}" was found.`);
  }

  let colourwayId = "";
  if (candidates.length === 1) {
    colourwayId = candidates[0]!.id;
  } else if (candidates.length > 1) {
    if (colourId === null) {
      errors.push(
        `Existing Product Code: "${existingProductCode}" has more than one colour — fill in Colour to say which.`,
      );
    } else {
      const match = candidates.find((c) => c.colourId === colourId);
      if (match === undefined) {
        errors.push(`Existing Product Code: "${existingProductCode}" has no colourway in that Colour.`);
      } else {
        colourwayId = match.id;
      }
    }
  }

  const movement: MovementDraft = {
    kind: "received",
    locationId,
    qty: openingQty,
    reference,
    note: notes,
  };

  return { rowNumber, mode: "existingStock", colourwayId, movement, errors };
}
