"use client";

import { useMemo, useState, useTransition } from "react";

import { titleCase } from "@slk/domain";

import {
  defaultAttributes,
  HOME_INDUSTRY,
  type AttributeKey,
  type Option,
  type Options,
  type RecordDetail,
} from "@/lib/attributes";
import {
  MOVEMENT_KINDS,
  MOVEMENT_KIND_LIST,
  type MovementKind,
} from "@/lib/movements";

import {
  archiveRecord,
  createRecord,
  recordMovement,
  saveRecord,
  type ActionResult,
  type RecordDraft,
} from "./actions";

/**
 * One editor for a record, not four dialogs.
 *
 * The tab strip is the conditional logic made visible: it shrinks and grows
 * with what the record actually is, rather than greying half the fields out.
 * Blouse only exists on a saree; Garment only on a garment.
 */

type TabKey =
  | "basic"
  | "material"
  | "craft"
  | "blouse"
  | "garment"
  | "prices"
  | "images"
  | "stock";

/** Which tab a field lives on, so an error can point at one. */
const FIELD_TAB: Record<string, TabKey> = {
  industry: "basic",
  productType: "basic",
  homeProductType: "basic",
  homeWeavingCategory: "basic",
  garmentType: "basic",
  colour: "basic",
  fibreType: "material",
  craftTechnique: "craft",
  cost: "prices",
  making: "prices",
  wholesale: "prices",
  retail: "prices",
  mrp: "prices",
  quantity: "stock",
};

const PRICE_KINDS = [
  { key: "cost", label: "Cost Price", note: "What the piece cost you" },
  { key: "making", label: "Making Price", note: "Labour and finishing on top of cost" },
  { key: "wholesale", label: "Wholesale Price", note: "Trade or bulk buyers" },
  { key: "retail", label: "Retail Price", note: "The counter price — used for stock value" },
  { key: "mrp", label: "MRP", note: "Printed on the tag" },
] as const;

function money(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function rupees(minor: number | null): string {
  return minor === null ? "" : String(minor / 100);
}

export interface PickableLocation {
  id: string;
  name: string;
  code: string;
  isInternal: boolean;
}

export function RecordEditor({
  record,
  options,
  locations,
  initialTab,
  onClose,
  onSaved,
}: {
  record: RecordDetail | null;
  options: Options;
  locations: PickableLocation[];
  initialTab: TabKey;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isNew = record === null;

  // A new record starts from whatever each list has marked as its default —
  // Industry is Clothing because nearly everything SLK makes is. Changing
  // that is a click on the Values screen, not a code change.
  const [attributes, setAttributes] = useState<
    Partial<Record<AttributeKey, string | null>>
  >(() => record?.attributes ?? defaultAttributes(options));
  const [colourId, setColourId] = useState<string | null>(record?.colourId ?? null);
  const [prices, setPrices] = useState({
    cost: rupees(record?.costMinor ?? null),
    making: rupees(record?.makingMinor ?? null),
    wholesale: rupees(record?.wholesaleMinor ?? null),
    retail: rupees(record?.retailMinor ?? null),
    mrp: rupees(record?.mrpMinor ?? null),
  });
  const [quantity, setQuantity] = useState(
    isNew ? "1" : String(record.stock.onHand),
  );

  // One line to start, pointing at wherever stock normally lands, so the
  // common case — everything in one place — is already the shape of the form.
  const [openingStock, setOpeningStock] = useState<OpeningLine[]>(() => [
    { locationId: locations.find((l) => l.isInternal)?.id ?? "", qty: "" },
  ]);
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [name, setName] = useState(record?.name ?? "");
  const [nameIsCustom, setNameIsCustom] = useState(record?.nameIsCustom ?? false);

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const labelOf = (list: string, id: string | null | undefined) =>
    id ? (options[list]?.find((o) => o.id === id)?.label ?? null) : null;

  /**
   * Industry decides what the rest of the form is.
   *
   * It used to be a required field that changed nothing: you could file a
   * bedsheet under Home & Lifestyle and still be offered Saree and Dupatta as
   * its product type, and Blouse could appear on it. The two sheets in the
   * workbook and the two columns in the database both say these are different
   * things; only the form disagreed.
   */
  const industry = labelOf("industry", attributes.industry);
  const isHome = industry === HOME_INDUSTRY;

  const productType = isHome
    ? labelOf("home_product_type", attributes.homeProductType)
    : labelOf("product_type", attributes.productType);

  const isSaree = !isHome && productType === "Saree";
  const isGarment = !isHome && Boolean(attributes.garmentType);

  /**
   * What a price is a price of.
   *
   * "Retail Price ₹1,000" says nothing on its own for a length of cloth. The
   * unit belongs next to the number, and it is not a separate question —
   * Product Type already answers it.
   */
  const uom = labelOf("uom", attributes.uom);
  const perUnit = uom === null ? "" : ` per ${uom}`;
  const fibre = labelOf("fibre_type", attributes.fibreType);
  const craft = labelOf("craft_technique", attributes.craftTechnique);

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string }[] = [
      { key: "basic", label: "Basic" },
      { key: "material", label: "Material" },
      { key: "craft", label: "Craft & Design" },
    ];
    if (isSaree) list.push({ key: "blouse", label: "Blouse" });
    if (isGarment) list.push({ key: "garment", label: "Garment" });
    list.push({ key: "prices", label: "Prices" });
    // Photographs hang off a colourway, and a new record has none yet.
    if (!isNew) list.push({ key: "images", label: "Images" });
    list.push({ key: "stock", label: "Stock" });
    return list;
  }, [isSaree, isGarment, isNew]);

  const errorTabs = useMemo(() => {
    const set = new Set<TabKey>();
    for (const key of Object.keys(errors)) set.add(FIELD_TAB[key] ?? "basic");
    return set;
  }, [errors]);

  // A tab can vanish under you — pick a saree, fill in Blouse, change to
  // Dupatta — so fall back rather than render nothing.
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "basic";

  // Recomputed rather than held in state, because the steps themselves change
  // as the record does: choosing Saree inserts Blouse between Craft & Design
  // and Prices, and a stored index would then point at the wrong one.
  const step = Math.max(0, tabs.findIndex((t) => t.key === activeTab));
  const onFirstStep = step === 0;
  const onLastStep = step === tabs.length - 1;

  const set = (key: AttributeKey, value: string | null) => {
    setAttributes((prev) => {
      const next = { ...prev, [key]: value };

      // Dependencies, applied where the value changes rather than checked on
      // save: a sub-family that no longer applies has to be cleared, or it is
      // saved against the wrong fibre.
      if (key === "fibreType") {
        const label = labelOf("fibre_type", value);
        if (label !== "Silk") next.silkSubFamily = null;
        if (label !== "Cotton") next.cottonSubFamily = null;
      }
      if (key === "craftTechnique" && labelOf("craft_technique", value) !== "Kalamkari") {
        next.craftSubType = null;
      }
      if (key === "motifCategory") next.motif = null;

      // Unit of measure follows the product type rather than being asked for.
      // Fabric is sold by the Metre and everything else by the Piece, and the
      // vocabulary already says so — the UOM is the product type's parent
      // value. Deriving it is what stops a record priced per metre from
      // claiming to be sold per piece.
      if (key === "productType" || key === "homeProductType") {
        const list = key === "productType" ? "product_type" : "home_product_type";
        const chosen = options[list]?.find((o) => o.id === value);
        next.uom = chosen?.parentId ?? null;
      }

      // Changing industry changes which columns apply. Clearing the other
      // side here rather than on save means the record never briefly holds
      // both a Saree and a Bedsheets product type — and the server refuses
      // that combination anyway, so leaving it would only produce an error
      // about a field the form is no longer showing.
      if (key === "industry") {
        if (labelOf("industry", value) === HOME_INDUSTRY) {
          next.productType = null;
          next.garmentType = null;
        } else {
          next.homeProductType = null;
          next.homeWeavingCategory = null;
        }
      }
      if (key === "blouseAvailable" && labelOf("blouse_available", value) === "No") {
        const na = (list: string) =>
          options[list]?.find((o) => o.label === "Not Applicable")?.id ?? null;
        next.blouseStatus = na("blouse_status");
        next.blouseMaterial = na("blouse_material");
      }

      return next;
    });

    setErrors((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
  };

  /**
   * Whether the record has been submitted once.
   *
   * Until then the footer walks forward, because a new record is a sequence.
   * After a rejection it must not: the failure sends you back to the tab with
   * the problem, and if the button there still said Next you would have to
   * page through the rest of the form again to reach a button that submits.
   * Once someone has seen every step, they can commit from any of them.
   */
  const [attempted, setAttempted] = useState(false);

  const submit = () => {
    setAttempted(true);

    const draft: RecordDraft = {
      colourwayId: record?.id,
      attributes,
      colourId,
      prices,
      quantity,
      openingStock,
      notes,
      name,
      nameIsCustom,
    };

    startTransition(async () => {
      const outcome = isNew ? await createRecord(draft) : await saveRecord(draft);
      setResult(outcome);
      setErrors(outcome.errors ?? {});

      if (outcome.errors && Object.keys(outcome.errors).length > 0) {
        const first = Object.keys(outcome.errors)[0];
        if (first) setTab(FIELD_TAB[first] ?? "basic");
      }

      if (outcome.ok) onSaved(outcome.message);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close editor"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "New Product Record" : `Edit ${record.code}`}
        // A fixed height, not one that follows the content. Basic has nine
        // fields and Material has five, so sizing to content made the dialog
        // jump — and moved the Cancel and Save buttons under the pointer
        // between one tab and the next.
        style={{ height: "min(88vh, 680px)" }}
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-rule bg-surface shadow-2xl"
      >
        <header className="border-b border-rule px-6 pt-5">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">
              {isNew ? "New Product Record" : record.name}
            </h2>
            {!isNew && (
              <span className="font-mono text-[12px] text-faint">{record.code}</span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={activeTab === t.key ? "page" : undefined}
                className={`relative rounded-t-md px-3 py-2 text-[13px] ${
                  activeTab === t.key
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-muted hover:text-ink-2"
                }`}
              >
                {/*
                  Numbered only while creating, where the strip really is a
                  sequence. On an existing record the same numbers would imply
                  an order that does not exist.
                */}
                {isNew && (
                  <span className="mr-1.5 font-mono text-[11px] text-faint tabular-nums">
                    {i + 1}
                  </span>
                )}
                {t.label}
                {errorTabs.has(t.key) && (
                  <span
                    aria-label="has errors"
                    className="ml-1.5 inline-block size-1.5 rounded-full bg-brick align-middle"
                  />
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-surface-2 px-6 py-5">
          {activeTab === "basic" && (
            <>
              <Grid>
                <Combo label="Industry" list="industry" required
                  options={options} value={attributes.industry ?? null}
                  error={errors["industry"]} onPick={(v) => set("industry", v)} />
                {/*
                  Two different lists behind one question. A bedsheet is not a
                  kind of saree, and offering Saree, Dupatta and Fabric to
                  someone filing a bedsheet is offering them nothing they can
                  use.
                */}
                {isHome ? (
                  <>
                    <Combo label="Product Type" list="home_product_type" required
                      options={options} value={attributes.homeProductType ?? null}
                      error={errors["homeProductType"]}
                      onPick={(v) => set("homeProductType", v)} />
                    <Combo label="Weaving Category" list="home_weaving_category"
                      options={options} value={attributes.homeWeavingCategory ?? null}
                      onPick={(v) => set("homeWeavingCategory", v)} />
                  </>
                ) : (
                  <>
                    <Combo label="Product Type" list="product_type" required
                      options={options} value={attributes.productType ?? null}
                      error={errors["productType"]} onPick={(v) => set("productType", v)} />
                    <Combo label="Product Sub Type" list="garment_type" placeholder="Not a garment"
                      options={options} value={attributes.garmentType ?? null}
                      onPick={(v) => set("garmentType", v)} />
                  </>
                )}
                <Combo label="Production Method" list="production_method"
                  options={options} value={attributes.productionMethod ?? null}
                  onPick={(v) => set("productionMethod", v)} />
                <Combo label="Audience" list="audience_type"
                  options={options} value={attributes.audienceType ?? null}
                  onPick={(v) => set("audienceType", v)} />
                <Combo label="Descriptor" list="descriptor"
                  options={options} value={attributes.descriptor ?? null}
                  onPick={(v) => set("descriptor", v)} />
                <Combo label="Colour" list="colour" required
                  options={options} value={colourId} error={errors["colour"]}
                  onPick={(v) => {
                    setColourId(v);
                    setErrors((p) => { const { colour: _d, ...r } = p; return r; });
                  }} />
              </Grid>

              {!isNew && record.siblings.length > 1 && (
                <Note>
                  These attributes belong to the <strong>design</strong>, which has{" "}
                  {record.siblings.length} colours —{" "}
                  {record.siblings
                    .map((s) => s.colour ?? "unset")
                    .join(", ")}
                  . A change here applies to all of them. Colour, prices and stock are
                  for this one only.
                </Note>
              )}

              <label className="mt-4 block">
                <span className="mb-1 block text-[12.5px] text-ink-2">Product Name</span>
                <input
                  value={nameIsCustom ? name : (record?.name ?? "")}
                  placeholder="Builds itself from your choices"
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameIsCustom(true);
                  }}
                  className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
                />
                <span className="mt-1 block text-[11.5px] text-faint">
                  {nameIsCustom ? (
                    <>
                      Edited by hand — it will stop following attribute changes.{" "}
                      <button
                        type="button"
                        onClick={() => { setNameIsCustom(false); setName(""); }}
                        className="underline hover:text-brick"
                      >
                        Let it compose again
                      </button>
                    </>
                  ) : (
                    "Composed from the taxonomy. Type to override."
                  )}
                </span>
              </label>

              <p className="mt-4 text-[12.5px] leading-relaxed text-faint">
                {isNew
                  ? "The design code is built from product type, region and fibre when you save."
                  : `Design code ${record.code} does not change when attributes do — it is printed on QR labels.`}
              </p>
            </>
          )}

          {activeTab === "material" && (
            <Grid>
              <Combo label="Fiber Type" list="fibre_type" required
                options={options} value={attributes.fibreType ?? null}
                error={errors["fibreType"]} onPick={(v) => set("fibreType", v)} />
              <Combo label="Weave Structure" list="weave_structure"
                options={options} value={attributes.weaveStructure ?? null}
                onPick={(v) => set("weaveStructure", v)} />
              {/*
                One slot, not two.

                A fibre has at most one sub-family, so showing Silk Sub Family
                beside Cotton Sub Family with whichever does not apply greyed
                out puts a permanently dead control on the form — and on a
                cotton saree the greyed one is the *silk* field, which reads
                as something broken rather than something irrelevant.

                Two columns in the database, because they are different
                vocabularies and a record must keep saying which. One field on
                the screen, because only one can ever be answered. This is
                what Craft Sub Type already does for Kalamkari below.
              */}
              {fibre === "Silk" && (
                <Combo label="Silk Sub Family" list="silk_sub_family"
                  options={options} value={attributes.silkSubFamily ?? null}
                  onPick={(v) => set("silkSubFamily", v)} />
              )}
              {fibre === "Cotton" && (
                <Combo label="Cotton Sub Family" list="cotton_sub_family"
                  options={options} value={attributes.cottonSubFamily ?? null}
                  onPick={(v) => set("cottonSubFamily", v)} />
              )}
              <Combo label="Fabric Type" list="fabric_type"
                options={options} value={attributes.fabricType ?? null}
                onPick={(v) => set("fabricType", v)} />
            </Grid>
          )}

          {activeTab === "craft" && (
            <Grid>
              <Combo label="Craft Technique" list="craft_technique" required
                options={options} value={attributes.craftTechnique ?? null}
                error={errors["craftTechnique"]} onPick={(v) => set("craftTechnique", v)} />
              {craft === "Kalamkari" && (
                <Combo label="Craft Sub Type" list="craft_sub_type"
                  options={options} value={attributes.craftSubType ?? null}
                  onPick={(v) => set("craftSubType", v)} />
              )}
              <Combo label="Region Style" list="regional_style"
                options={options} value={attributes.regionalStyle ?? null}
                onPick={(v) => set("regionalStyle", v)} />
              <Combo label="Motif Category" list="motif_category"
                options={options} value={attributes.motifCategory ?? null}
                onPick={(v) => set("motifCategory", v)} />
              <Combo label="Motif" list="motif"
                options={options} value={attributes.motif ?? null}
                parentFilter={attributes.motifCategory ?? null}
                disabled={!attributes.motifCategory}
                placeholder={attributes.motifCategory ? "Choose…" : "Pick a category first"}
                onPick={(v) => set("motif", v)} />
              {/*
                Border Style is retired — it overlapped Border Height and only
                one was wanted. The field is gone rather than showing an empty
                dropdown; `border_style_id` stays on the design so the records
                that carry a value still read.
              */}
              <Combo label="Border Height" list="border_height"
                options={options} value={attributes.borderHeight ?? null}
                onPick={(v) => set("borderHeight", v)} />
              {isSaree && (
                <>
                  <Combo label="Saree Layout" list="saree_layout"
                    options={options} value={attributes.sareeLayout ?? null}
                    onPick={(v) => set("sareeLayout", v)} />
                  <Combo label="Pallu Design" list="pallu_design"
                    options={options} value={attributes.palluDesign ?? null}
                    onPick={(v) => set("palluDesign", v)} />
                </>
              )}
            </Grid>
          )}

          {activeTab === "blouse" && (
            <Grid>
              <Combo label="Blouse Availability" list="blouse_available"
                options={options} value={attributes.blouseAvailable ?? null}
                onPick={(v) => set("blouseAvailable", v)} />
              <Combo label="Blouse Status" list="blouse_status"
                options={options} value={attributes.blouseStatus ?? null}
                disabled={labelOf("blouse_available", attributes.blouseAvailable) === "No"}
                onPick={(v) => set("blouseStatus", v)} />
              <Combo label="Blouse Material" list="blouse_material"
                options={options} value={attributes.blouseMaterial ?? null}
                disabled={labelOf("blouse_available", attributes.blouseAvailable) === "No"}
                onPick={(v) => set("blouseMaterial", v)} />
            </Grid>
          )}

          {activeTab === "garment" && (
            <Note>
              The Garments sheet defines eleven more columns — Size, Colors, Sleeve
              Length and the rest — but every one of them arrived empty in the
              workbook. Give them values on Master Lists and they appear
              here as dropdowns, with no change to this screen.
            </Note>
          )}

          {activeTab === "prices" && (
            <>
              <Grid>
                {PRICE_KINDS.map((p) => (
                  <label key={p.key} className="block">
                    <span className="mb-1 block text-[12.5px] text-ink-2">
                      {p.label}
                      {/*
                        "per Metre" rather than a generic "per qty": the unit
                        is known, and naming it is the whole point. Fabric
                        priced at ₹1,000 means something quite different from
                        a saree at ₹1,000.
                      */}
                      {perUnit !== "" && (
                        <span className="font-normal text-muted">{perUnit}</span>
                      )}
                      {p.key === "retail" && <Required />}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={prices[p.key]}
                      onChange={(e) => {
                        setPrices((prev) => ({ ...prev, [p.key]: e.target.value }));
                        setErrors((prev) => {
                          const { [p.key]: _d, ...rest } = prev;
                          return rest;
                        });
                      }}
                      placeholder="—"
                      className={`w-full rounded-md border bg-surface px-3 py-2 text-right text-[14px] tabular-nums text-ink ${
                        errors[p.key] ? "border-brick" : "border-rule-2"
                      }`}
                    />
                    <span className="mt-1 block text-[11.5px] text-faint">
                      {errors[p.key] ?? p.note}
                    </span>
                  </label>
                ))}
              </Grid>
              <Margin cost={prices.cost} retail={prices.retail} />
            </>
          )}

          {activeTab === "images" && (
            <Note>
              Photographs go in slots decided by product type — a saree has Body,
              Pallu, Border and Blouse. Nothing can be uploaded until there is
              somewhere to put it: the plan plans Cloudflare R2, which has no egress
              fee and matters for an image-heavy catalogue served to storefronts.
            </Note>
          )}

          {activeTab === "stock" && (
            <StockTab
              record={record}
              quantity={quantity}
              setQuantity={setQuantity}
              error={errors["quantity"]}
              locations={locations}
              openingStock={openingStock}
              setOpeningStock={setOpeningStock}
              onMoved={onSaved}
            />
          )}

          {activeTab === "basic" && (
            <label className="mt-4 block">
              <span className="mb-1 block text-[12.5px] text-ink-2">Notes</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering"
                className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
              />
            </label>
          )}
        </div>

        {/*
          Creating walks forward; editing does not.

          A new record is a sequence — you cannot judge the prices before you
          have said what the thing is — so it gets Back and Next, and the
          commit only appears on the last step. An existing record is the
          opposite: you opened it to change one field, and being made to page
          through six tabs to reach Save would be absurd. Same dialog, two
          footers.

          The tab strip stays clickable in both. A wizard that traps you is
          only right when the steps genuinely cannot be done out of order, and
          these can.
        */}
        <footer className="flex flex-wrap items-center gap-3 border-t border-rule px-6 py-3">
          {result && (
            <span className={`text-[13px] ${result.ok ? "text-ok" : "text-brick"}`}>
              {result.message}
            </span>
          )}

          {isNew && result === null && (
            <span className="text-[12.5px] text-muted">
              Step {step + 1} of {tabs.length} — {tabs[step]?.label}
            </span>
          )}

          <span className="ml-auto" />

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-[13.5px] text-muted hover:text-ink"
          >
            Cancel
          </button>

          {isNew && (
            <button
              type="button"
              onClick={() => {
                const previous = tabs[step - 1];
                if (previous) setTab(previous.key);
              }}
              disabled={onFirstStep}
              className="rounded-md border border-rule-2 px-3 py-2 text-[13.5px] text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
          )}

          {isNew && !onLastStep && attempted && (
            <button
              type="button"
              onClick={() => {
                const next = tabs[step + 1];
                if (next) setTab(next.key);
              }}
              className="rounded-md border border-rule-2 px-3 py-2 text-[13.5px] text-ink-2 hover:bg-surface-2"
            >
              Next
            </button>
          )}

          {isNew && !onLastStep && !attempted ? (
            <button
              type="button"
              onClick={() => {
                const next = tabs[step + 1];
                if (next) setTab(next.key);
              }}
              className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
            >
              {pending ? "Saving…" : isNew ? "Finish" : "Save"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Required() {
  return <span className="ml-1 text-brick">*</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-md border-l-2 border-brick bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
      {children}
    </p>
  );
}

function Combo({
  label,
  list,
  options,
  value,
  onPick,
  required,
  disabled,
  placeholder,
  error,
  parentFilter,
}: {
  label: string;
  list: string;
  options: Options;
  value: string | null;
  onPick: (value: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  parentFilter?: string | null;
}) {
  let values: Option[] = options[list] ?? [];

  // Motifs are filtered to the chosen category, which is what the parent
  // column on the lookup value is for.
  if (parentFilter !== undefined && parentFilter !== null) {
    values = values.filter((o) => o.parentId === parentFilter);
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-ink-2">
        {label}
        {required && <Required />}
      </span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value === "" ? null : e.target.value)}
        className={`w-full rounded-md border bg-surface px-3 py-2 text-[14px] text-ink disabled:bg-surface-3 disabled:text-faint ${
          error ? "border-brick" : "border-rule-2"
        }`}
      >
        <option value="">{placeholder ?? "Choose…"}</option>
        {values.map((o) => (
          <option key={o.id} value={o.id}>
            {/*
              Shown exactly as stored. Title-casing here is what turned
              "Up to 3 Inch" into "Up To 3 Inch" and "3D Print" into "3d
              Print" — the label is already correct, because Master Lists
              applies the casing rule when it is written.
            */}
            {o.label}
          </option>
        ))}
      </select>
      {(error ?? (values.length === 0 && !disabled)) && (
        <span className="mt-1 block text-[11.5px] text-brick">
          {error ?? "No values in this list yet"}
        </span>
      )}
    </label>
  );
}

function Margin({ cost, retail }: { cost: string; retail: string }) {
  const c = Number(cost);
  const r = Number(retail);

  if (cost.trim() === "" || retail.trim() === "" || !Number.isFinite(c) || !Number.isFinite(r)) {
    return null;
  }

  const margin = r - c;

  return (
    <p className="mt-4 text-[13.5px] text-ink-2">
      Margin on retail:{" "}
      <strong className={margin < 0 ? "text-brick" : "text-ink"}>
        {money(margin * 100)}
      </strong>
      {c > 0 && ` · ${Math.round((margin / c) * 100)}% over cost`}
      {margin < 0 && " — selling below cost"}
    </p>
  );
}

export interface OpeningLine {
  locationId: string;
  qty: string;
}

function StockTab({
  record,
  quantity,
  setQuantity,
  error,
  locations,
  openingStock,
  setOpeningStock,
  onMoved,
}: {
  record: RecordDetail | null;
  quantity: string;
  setQuantity: (value: string) => void;
  error?: string;
  locations: PickableLocation[];
  openingStock: OpeningLine[];
  setOpeningStock: (lines: OpeningLine[]) => void;
  onMoved: (message: string) => void;
}) {
  if (record === null) {
    return (
      <OpeningStock
        locations={locations}
        lines={openingStock}
        setLines={setOpeningStock}
      />
    );
  }

  const { stock } = record;
  const unit = record.isSerialised ? "pieces" : "units";

  const tiles = [
    { k: "Available", v: stock.onHand, d: "on the shelf now", tone: stock.onHand > 0 ? "text-ok" : "text-off" },
    { k: "Received", v: stock.received, d: "all time" },
    { k: "Sold", v: stock.sold, d: "all time" },
    { k: "Damaged", v: stock.damaged, d: "written off", tone: stock.damaged ? "text-brick" : undefined },
    { k: "Returned", v: stock.returned, d: "came back" },
    { k: "Adjusted", v: stock.adjusted, d: "count corrections" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-lg border border-rule bg-surface px-4 py-3">
            <div className="text-[12px] font-medium text-muted">{t.k}</div>
            <div className={`text-[22px] font-semibold tabular-nums ${t.tone ?? "text-ink"}`}>
              {t.v}
            </div>
            <div className="text-[11.5px] text-muted">{t.d}</div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 mb-2 text-[15px] font-semibold text-ink">
        Stock Availability Details
      </h3>
      {stock.byLocation.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-rule bg-surface">
          {/* A column of bare numbers with no heading makes the reader guess. */}
          <div className="flex justify-between border-b border-rule bg-surface-2 px-4 py-1.5 text-[11.5px] font-medium text-muted">
            <span>Location</span>
            <span>Available</span>
          </div>
          {stock.byLocation.map((l, i) => (
            <div
              key={l.location}
              className={`flex justify-between px-4 py-2.5 text-[13.5px] ${i > 0 ? "border-t border-rule" : ""}`}
            >
              <span className="text-ink-2">{l.location}</span>
              <span className="tabular-nums text-ink">
                {l.qty} {l.qty === 1 ? unit.replace(/s$/, "") : unit}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-rule-2 bg-surface-2 px-4 py-2 text-[13px] font-medium">
            <span className="text-ink-2">Total</span>
            <span className="tabular-nums text-ink">
              {stock.onHand} {stock.onHand === 1 ? unit.replace(/s$/, "") : unit}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[13.5px] text-muted">Nothing on hand.</p>
      )}

      <h3 className="mt-6 mb-2 text-[15px] font-semibold text-ink">
        Record A Movement
      </h3>
      <p className="mb-2 text-[12px] leading-relaxed text-muted">
        Stock arriving, leaving, or moving between locations. Each one is
        appended to the ledger, so the count above is always the sum of things
        that happened.
      </p>
      <RecordMovement record={record} locations={locations} onSaved={onMoved} />

      <h3 className="mt-6 mb-2 text-[15px] font-semibold text-ink">Correct The Count</h3>
      <p className="mb-2 text-[12px] leading-relaxed text-muted">
        For when the shelf and the system disagree and nobody knows why. This
        is a reconciliation, not a receipt — if you know what happened, record
        it above instead.
      </p>
      <Grid>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Quantity On Hand</span>
          <input
            type="number"
            min="0"
            value={quantity}
            disabled={record.isSerialised}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-right text-[14px] tabular-nums text-ink disabled:bg-surface-3 disabled:text-faint"
          />
          <span className="mt-1 block text-[11.5px] text-faint">
            {error ??
              (record.isSerialised
                ? "Serialised — the count is how many pieces are tagged, so it changes piece by piece."
                : "A change here writes a stock adjustment; it never overwrites the number.")}
          </span>
        </label>
      </Grid>

      <h3 className="mt-6 mb-2 text-[15px] font-semibold text-ink">Recent Movements</h3>
      {record.movements.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-rule bg-surface">
          {/*
            Five columns of unlabelled values. The date and the quantity were
            guessable; "Received 3" against a reason and a pair of location
            names was not.
          */}
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-rule bg-surface-2 px-4 py-1.5 text-[11.5px] font-medium text-muted">
            <span className="w-24">When</span>
            <span className="w-20">What</span>
            <span className="w-10 text-right">Qty</span>
            <span>Reason</span>
            <span className="ml-auto">From → To</span>
          </div>
          {record.movements.map((m, i) => (
            <div
              key={m.id}
              className={`flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-[13px] ${i > 0 ? "border-t border-rule" : ""}`}
            >
              <span className="w-24 font-mono text-[11.5px] text-faint">{m.occurredAt}</span>
              <span className="w-20 text-ink">{titleCase(m.kind)}</span>
              <span className="w-10 text-right tabular-nums text-ink-2">{m.qty}</span>
              <span className="text-muted">{m.reason ?? "—"}</span>
              <span className="ml-auto font-mono text-[11px] text-faint">
                {m.from ?? "—"} → {m.to ?? "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13.5px] text-muted">No movements recorded.</p>
      )}
    </>
  );
}

/** Confirms taking a record out of the catalogue, and says what that means. */
export function ArchiveDialog({
  record,
  onClose,
  onDone,
}: {
  record: { id: string; name: string; code: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border border-rule bg-surface p-6 shadow-2xl"
      >
        <h2 className="mb-2 text-[18px] font-semibold text-ink">
          Archive This Record?
        </h2>
        <p className="mb-3 text-[14px] leading-relaxed text-ink-2">
          {record.name}{" "}
          <span className="font-mono text-[12px] text-faint">{record.code}</span> stops
          appearing in the catalogue.
        </p>
        <p className="mb-5 text-[13px] leading-relaxed text-muted">
          It is archived rather than deleted. The movements recording what was
          received, sold and written off refer to this record, and removing it would
          leave the stock history unable to answer what happened.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-[13.5px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const outcome = await archiveRecord(record.id);
                onDone(outcome.message);
              });
            }}
            className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
          >
            {pending ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Opening stock, entered the way it is counted: a place, and how many are
 * there.
 *
 * A single Opening Quantity box could not say where the stock was, so it did
 * not record anything at all — the field sat above a note explaining that it
 * would not be saved, which is a form asking for something it then throws
 * away.
 *
 * Each line becomes one movement into that location. The total is shown
 * rather than typed, because it is a consequence of the lines and not an
 * independent number that could disagree with them.
 */
function OpeningStock({
  locations,
  lines,
  setLines,
}: {
  locations: PickableLocation[];
  lines: OpeningLine[];
  setLines: (lines: OpeningLine[]) => void;
}) {
  const internal = locations.filter((l) => l.isInternal);

  const total = lines.reduce((sum, line) => {
    const n = Number(line.qty);
    return sum + (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  }, 0);

  // A location already spoken for further up the list, so the same place
  // cannot be entered twice and then disagree with itself.
  const taken = (index: number) =>
    new Set(lines.filter((_, i) => i !== index).map((l) => l.locationId));

  const update = (index: number, patch: Partial<OpeningLine>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const spare = internal.find((l) => !lines.some((line) => line.locationId === l.id));

  if (internal.length === 0) {
    return (
      <Note>
        No locations are set up to hold stock. Add one on Master Lists →
        Locations, and it will be offered here.
      </Note>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-ink">Opening Stock</h3>
        <span className="text-[12.5px] text-muted">
          Total{" "}
          <span className="font-mono text-[13.5px] tabular-nums text-ink">{total}</span>
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {lines.map((line, index) => {
          const used = taken(index);

          return (
            <div
              key={index}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                index > 0 ? "border-t border-rule" : ""
              }`}
            >
              <select
                aria-label={`Location for line ${index + 1}`}
                value={line.locationId}
                onChange={(e) => update(index, { locationId: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-[13.5px] text-ink"
              >
                <option value="">Choose a location…</option>
                {internal.map((l) => (
                  <option key={l.id} value={l.id} disabled={used.has(l.id)}>
                    {l.name}
                    {used.has(l.id) ? " — already listed" : ""}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                aria-label={`Quantity for line ${index + 1}`}
                value={line.qty}
                onChange={(e) => update(index, { qty: e.target.value })}
                className="w-24 flex-none rounded-md border border-rule-2 bg-surface px-2.5 py-1.5 text-right text-[13.5px] tabular-nums text-ink"
              />

              <button
                type="button"
                aria-label={`Remove line ${index + 1}`}
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                // Never down to nothing: an empty list with only an Add button
                // is a dead end that does not look like one.
                disabled={lines.length === 1}
                className="flex-none rounded px-1.5 py-1 text-[15px] leading-none text-muted hover:bg-surface-2 hover:text-brick disabled:cursor-not-allowed disabled:opacity-30"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() =>
          setLines([...lines, { locationId: spare?.id ?? "", qty: "" }])
        }
        disabled={spare === undefined}
        title={
          spare === undefined
            ? "Every location is already listed"
            : undefined
        }
        className="mt-2 rounded-md border border-rule-2 px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add another location
      </button>

      <Note>
        Each line is recorded as stock arriving from Production into that
        location, so the count can still be explained a year from now. Leave it
        all blank if the stock is not counted yet — it can arrive later through
        Record movement.
      </Note>
    </>
  );
}

/**
 * Recording what happened to the stock, against a location.
 *
 * Until this existed, stock could only arrive when the record was created,
 * and the only later change was "Correct The Count" — one number, no location
 * on it, written to the ledger as an adjustment between the warehouse and the
 * scrap bin. That answers "the shelf says nine and the system says ten". It
 * does not answer "twelve arrived at Retail Unit 1 this morning", which is
 * the ordinary case.
 *
 * The kind comes first because it decides everything else: what the other end
 * of the movement is, whether the location you pick receives or sends, and
 * whether a second location is needed at all.
 */
function RecordMovement({
  record,
  locations,
  onSaved,
}: {
  record: RecordDetail;
  locations: PickableLocation[];
  onSaved: (message: string) => void;
}) {
  const [kind, setKind] = useState<MovementKind>("received");
  const [locationId, setLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const spec = MOVEMENT_KINDS[kind];
  const internal = locations.filter((l) => l.isInternal);

  // Where stock can be sent from is where stock actually is. Offering an
  // empty shop as a source is offering a choice that can only be refused.
  const holding = record.stock.byLocation
    .filter((l) => l.qty > 0)
    .map((l) => l.location);

  const sources =
    spec.dir === "out"
      ? internal.filter((l) => holding.includes(l.name))
      : internal;

  if (record.isSerialised) {
    return (
      <Note>
        This design is tagged piece by piece, so its count is the number of
        pieces. Stock moves by scanning them rather than by typing a quantity.
      </Note>
    );
  }

  if (internal.length === 0) {
    return (
      <Note>
        No locations are set up to hold stock. Add one on Master Lists →
        Locations.
      </Note>
    );
  }

  const submit = () => {
    setError(null);

    start(async () => {
      const result = await recordMovement(record.id, {
        kind,
        locationId,
        toLocationId,
        qty,
        reference,
        note,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setQty("");
      setReference("");
      setNote("");
      onSaved(result.message);
    });
  };

  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MOVEMENT_KIND_LIST.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => {
              setKind(k.key);
              setLocationId("");
              setToLocationId("");
              setError(null);
            }}
            className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
              kind === k.key
                ? "border-brick bg-brick-soft font-medium text-brick"
                : "border-rule-2 text-muted hover:bg-surface-2"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-muted">{spec.prompt}</p>

      <Grid>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">
            {kind === "transferred"
              ? "From"
              : spec.dir === "in"
                ? "Into"
                : "Out of"}
            <Required />
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
          >
            <option value="">Choose…</option>
            {sources.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {spec.dir === "out" && sources.length === 0 && (
            <span className="mt-1 block text-[11.5px] text-warn">
              Nothing is on hand anywhere, so there is nothing to move.
            </span>
          )}
        </label>

        {kind === "transferred" ? (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">
              To
              <Required />
            </span>
            <select
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
            >
              <option value="">Choose…</option>
              {internal
                .filter((l) => l.id !== locationId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">
              {spec.dir === "in" ? "From" : "To"}
            </span>
            {/*
              Stated, not chosen. The other end is what the kind means —
              received is from production, sold is to a customer — and making
              it a dropdown would invite the combinations that make a ledger
              unreadable.
            */}
            <p className="rounded-md border border-dashed border-rule-2 px-3 py-2 text-[14px] text-muted">
              {spec.other === "PRODUCTION"
                ? "Production"
                : spec.other === "CUSTOMER"
                  ? "Customer"
                  : "Scrap"}
            </p>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">
            Quantity
            <Required />
          </span>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-right text-[14px] tabular-nums text-ink"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Reference</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Invoice or challan number"
            className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
          />
        </label>
      </Grid>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] text-ink-2">Note</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything worth remembering about this movement"
          className="w-full rounded-md border border-rule-2 bg-surface px-3 py-2 text-[14px] text-ink"
        />
      </label>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || locationId === "" || qty.trim() === ""}
          className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Recording…" : `Record ${spec.label.toLowerCase()}`}
        </button>

        {error !== null && (
          <span className="text-[13px] text-brick">{error}</span>
        )}
      </div>
    </div>
  );
}
