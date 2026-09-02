"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { colourSwatch, isPaleSwatch } from "@slk/domain/colour";
import { titleCase } from "@slk/domain/naming";

import {
  defaultAttributes,
  isHomeIndustry,
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
import {
  confirmImage,
  presignImage,
  removeImage,
  storageStatus,
} from "./image-actions";

/**
 * One editor for a record, not four dialogs.
 *
 * The tab strip is the conditional logic made visible: it shrinks and grows
 * with what the record actually is, rather than greying half the fields out.
 * Blouse only exists on a saree; Garment only on a garment.
 */

type TabKey =
  | "basic"
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
  // Colour is asked on Craft & Design now. An error has to point at the tab
  // the field is actually on, or Next refuses and nothing on screen says why.
  colour: "craft",
  fibreType: "basic",
  craftTechnique: "craft",
  cost: "prices",
  making: "prices",
  wholesale: "prices",
  retail: "prices",
  mrp: "prices",
  // Opening stock is asked on Basic while creating, so an error about it has
  // to point there rather than at a tab a new record does not have.
  quantity: "basic",
};

const PRICE_KINDS = [
  {
    key: "cost",
    label: "Cost / Manufacturing Cost",
    note: "What the piece cost you",
  },
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
  const [secondaryColourId, setSecondaryColourId] = useState<string | null>(
    record?.secondaryColourId ?? null,
  );
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
  /**
   * Which photographs this product should have.
   *
   * Held here rather than written on each tick, because on a new record
   * there is no colourway to attach them to until Finish.
   */
  const [imageSlots, setImageSlots] = useState<string[]>(
    () => record?.images.map((i) => i.slotId ?? "").filter(Boolean) ?? [],
  );
  /**
   * The adjectives, several of them.
   *
   * Held apart from `attributes` because that map is one id per key and this
   * is the one question with more than one answer. It is written to its own
   * table, not to a column on the design.
   */
  const [descriptors, setDescriptors] = useState<string[]>(
    () => record?.descriptors ?? [],
  );
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
  const isHome = isHomeIndustry(industry);

  const productType = isHome
    ? labelOf("home_product_type", attributes.homeProductType)
    : labelOf("product_type", attributes.productType);

  const isSaree = !isHome && productType === "Saree";

  /**
   * Which sub types a product type has is data, not code.
   *
   * A Product Sub Type value names the Product Type it belongs under, the way
   * a Motif names its Motif Category, and the field offers only the ones that
   * name the type chosen above. A saree's are its layouts — All Over, Half
   * and Half, Langa Voni; a garment's would be its cuts. A product type with
   * none parented to it is not asked the question at all, which is why it
   * used to be hidden on a saree.
   */
  const subTypes = (options["garment_type"] ?? []).filter(
    (o) => o.parentId === attributes.productType,
  );
  const hasSubTypes = !isHome && subTypes.length > 0;

  /**
   * The Garment tab is for garments, and a saree is not one.
   *
   * Having a sub type used to be the same thing as being a garment, because
   * only garment kinds were parented. Now a saree has sub types too, and
   * choosing All Over must not start asking for a collar and a sleeve length.
   */
  const isGarment = hasSubTypes && !isSaree && Boolean(attributes.garmentType);

  /**
   * What a price is a price of.
   *
   * "Retail Price ₹1,000" says nothing on its own for a length of cloth. The
   * unit belongs next to the number, and it is not a separate question —
   * Product Type already answers it.
   */
  const uom = labelOf("uom", attributes.uom);
  const perUnit = uom === null ? "" : ` per ${uom}`;
  const craft = labelOf("craft_technique", attributes.craftTechnique);

  /**
   * Whether a blouse comes with it, which is the Product Sub Type.
   *
   * With Blouse / Without Blouse is what that field means for a saree now,
   * and the six blouse questions have no answer at all without it — so they
   * appear as a group rather than sitting greyed out waiting.
   */
  const withBlouse = labelOf("garment_type", attributes.garmentType) === "With Blouse";

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string }[] = [
      { key: "basic", label: "Basic" },
      { key: "craft", label: "Craft & Design" },
    ];
    // Always offered, because Descriptor lives here and describes any
    // product. What is saree-only is the saree half of the tab, not the tab.
    list.push({ key: "blouse", label: "Additional Product Details" });
    if (isGarment) list.push({ key: "garment", label: "Garment" });
    list.push({ key: "prices", label: "Prices" });
    // Which photographs the product needs can be decided while creating it —
    // the rows are written once the colourway exists.
    list.push({ key: "images", label: "Images" });
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

  /**
   * What is still missing on one step.
   *
   * Next used to mean nothing: you could leave Product Type blank, walk the
   * whole form, and be told at Finish — then be sent back to the first step
   * to fix something you had passed four screens earlier. A step you are
   * being moved on from is a step the form has just implied is complete, so
   * it has to check before it agrees.
   *
   * The same rules the server enforces, asked one step at a time. The server
   * still re-checks all of them; this is about saying so early, not about
   * being the authority.
   */
  const missingOn = (which: TabKey): Record<string, string> => {
    const missing: Record<string, string> = {};

    if (which === "basic") {
      if (!attributes.industry) missing["industry"] = "Industry is needed";

      // Which product type is required moves with the industry, the same way
      // the field itself does.
      if (isHome) {
        if (!attributes.homeProductType) {
          missing["homeProductType"] = "Choose a product type";
        }
      } else if (!attributes.productType) {
        missing["productType"] = "Choose a product type";
      }

      if (!attributes.fibreType) missing["fibreType"] = "Choose a fibre";
    }

    if (which === "craft") {
      // Checked where it is asked. It was still being demanded on Basic after
      // the field moved, so Next did nothing and pointed at a field that was
      // not there — the worst kind of refusal.
      if (!colourId) missing["colour"] = "Choose a colour";
      if (!attributes.craftTechnique) {
        missing["craftTechnique"] = "Choose a craft technique";
      }
    }

    if (which === "prices" && prices.retail.trim() === "") {
      missing["retail"] = "A selling price is needed";
    }

    return missing;
  };

  /**
   * Moves to the next step, unless this one is not finished.
   *
   * Tabs themselves stay clickable. Next is the guided path and asserting
   * completeness is its whole job; jumping to a tab is a deliberate act by
   * someone who knows where they are going, and trapping them in step one
   * would be worse than letting them look ahead.
   */
  const goNext = () => {
    const missing = missingOn(activeTab);

    if (Object.keys(missing).length > 0) {
      setErrors((prev) => ({ ...prev, ...missing }));
      return;
    }

    const next = tabs[step + 1];
    if (next) setTab(next.key);
  };

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

        // A material that named the old fibre no longer applies. One that
        // named no fibre — Georgette, Tissue — still does, so it stays.
        const materials = options["textile_material"] ?? [];
        const chosen = materials.find((o) => o.id === next.textileMaterial);
        if (chosen?.parentId != null && chosen.parentId !== value) {
          next.textileMaterial = null;
        }

        /*
          Then the default, if this fibre offers it.

          Mul Mul is marked default on Textile Material and belongs to Cotton,
          so choosing Cotton lands on it and choosing Silk lands on nothing —
          the default is only applied when the fibre actually offers it.
          Which value that is stays data: mark a different one default on
          Master Lists and this follows, with no change here.
        */
        if (next.textileMaterial == null) {
          const fallback = materials.find(
            (o) => o.isDefault && o.parentId === value,
          );
          next.textileMaterial = fallback?.id ?? null;
        }
      }
      if (key === "craftTechnique" && labelOf("craft_technique", value) !== "Kalamkari") {
        next.craftSubType = null;
      }
      if (key === "motifCategory") next.motif = null;

      /*
        The motif chosen on Craft & Design is the one on the body of the
        saree, nine times in ten — it is what the piece is described by. So
        Saree Body Motif starts there rather than at nothing, and the two
        fields stop being the same answer typed twice.

        Only where it is still empty. Somebody who has said the body carries
        a different motif from the design motif meant it.
      */
      if (key === "motif" && value !== null) next.sareeBodyMotif ??= value;

      // A sub type belongs to one product type. Changing the product type
      // leaves the old one meaningless, and the field it lived in may not
      // even be on screen any more.
      if (key === "productType") next.garmentType = null;

      // Unit of measure follows the product type rather than being asked for.
      // Fabric is sold by the Metre and everything else by the Piece, and the
      // vocabulary already says so — the UOM is the product type's parent
      // value. Deriving it is what stops a record priced per metre from
      // claiming to be sold per piece.
      if (key === "productType" || key === "homeProductType") {
        const list = key === "productType" ? "product_type" : "home_product_type";
        const chosen = options[list]?.find((o) => o.id === value);
        next.uom = chosen?.soldById ?? null;
      }

      // Changing industry changes which columns apply. Clearing the other
      // side here rather than on save means the record never briefly holds
      // both a Saree and a Bedsheets product type — and the server refuses
      // that combination anyway, so leaving it would only produce an error
      // about a field the form is no longer showing.
      if (key === "industry") {
        if (isHomeIndustry(labelOf("industry", value))) {
          next.productType = null;
          next.garmentType = null;
        } else {
          next.homeProductType = null;
          next.homeWeavingCategory = null;

          // Coming back to Clothing lands on Saree again, the same value a
          // new record starts on. Nearly everything SLK makes is one, and
          // which value that is stays data: it is whichever Product Type is
          // marked default on Master Lists.
          const fallback = options["product_type"]?.find((o) => o.isDefault);
          next.productType ??= fallback?.id ?? null;
          next.uom = options["product_type"]?.find(
            (o) => o.id === next.productType,
          )?.soldById ?? null;
        }
      }
      /*
        Blouse Availability is no longer asked; Product Sub Type answers it.
        With Blouse and Without Blouse say the same thing, and a form that
        asks twice invites the two to disagree.

        Still recorded, because the grid has a column for it and a storefront
        will want to know — derived here from the sub type rather than left
        holding whatever it happened to say before.
      */
      if (key === "garmentType") {
        const sub = labelOf("garment_type", value);
        const yesNo = sub === "With Blouse" ? "Yes" : sub === "Without Blouse" ? "No" : null;

        next.blouseAvailable =
          yesNo === null
            ? null
            : (options["blouse_available"]?.find((o) => o.label === yesNo)?.id ?? null);

        const named = (list: string, label: string) =>
          options[list]?.find((o) => o.label === label)?.id ?? null;

        if (yesNo === "Yes") {
          // A blouse piece arrives uncut unless somebody says otherwise, so
          // that is where the question starts rather than at nothing.
          next.blouseStatus ??= named("blouse_status", "UnStitched");
        } else {
          // Not Applicable rather than empty: a blouse question on a saree
          // that comes without one has an answer, and it is not "unknown".
          next.blouseStatus = named("blouse_status", "Not Applicable");
          next.blouseMaterial = named("blouse_material", "Not Applicable");
          next.blouseStyle = null;
          next.blouseBorder = null;
          next.blouseMotif = null;
        }
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
      descriptors,
      colourId,
      secondaryColourId,
      prices,
      quantity,
      openingStock,
      imageSlots,
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
                  Numbered on both. The two views were a wizard and an editor
                  wearing different chrome, and the difference was not telling
                  anyone anything they needed — the tabs hold the same fields
                  in the same order whether the record exists yet or not.
                */}
                <span className="mr-1.5 font-mono text-[11px] text-faint tabular-nums">
                  {i + 1}
                </span>
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
                    {/*
                      Saree, Dupatta, Fabric are Clothing product types, and
                      each one now names Clothing as its parent. Under any
                      other industry the list is empty and the question is
                      not asked — which is what a third industry made
                      necessary, since "not Home" had been standing in for
                      "Clothing".
                    */}
                    <Combo label="Product Type" list="product_type" required
                      options={options} value={attributes.productType ?? null}
                      parentFilter={attributes.industry ?? null}
                      error={errors["productType"]} onPick={(v) => set("productType", v)} />
                    {/* Required for a garment, where the cut is the thing;
                        optional for a saree, where the layout is a description
                        and not every piece has a name for it. */}
                    {hasSubTypes && (
                      <Combo label="Product Sub Type" list="garment_type" required={!isSaree}
                        options={options} value={attributes.garmentType ?? null}
                        parentFilter={attributes.productType ?? null}
                        onPick={(v) => set("garmentType", v)} />
                    )}
                  </>
                )}
                {/*
                  Shown, not asked. The product type states how the thing is
                  measured — Fabric by the Metre, everything else by the
                  Piece — and a record whose unit disagreed with its type
                  would be a record whose price meant nothing. It is here
                  because a price per Metre reads quite differently from a
                  price per Piece, and until now nothing on this form said
                  which.
                */}
                <Combo label="Unit of Measure" list="uom" disabled
                  options={options} value={attributes.uom ?? null}
                  hint="Follows the product type"
                  placeholder="Set by the product type"
                  onPick={() => undefined} />
                <Combo label="Production Method" list="production_method"
                  options={options} value={attributes.productionMethod ?? null}
                  onPick={(v) => set("productionMethod", v)} />
                <Combo label="Audience" list="audience_type"
                  options={options} value={attributes.audienceType ?? null}
                  onPick={(v) => set("audienceType", v)} />

                {/*
                  What the cloth is, asked here rather than on a Material tab
                  of its own. Three fields did not justify a step in a wizard,
                  and Fibre is answered in the same breath as Product Type by
                  whoever is holding the piece.

                  Textile Material is one field where there were three — Silk
                  Sub Family, Cotton Sub Family and Fabric Type all asked what
                  the cloth is, split by the fibre it happened to be. It is
                  narrowed by the fibre above: Silk names its twenty-three
                  weaves, Cotton names three, and every other fibre falls
                  through to the ten that name no fibre at all.
                */}
                <Combo label="Fiber Type" list="fibre_type" required
                  options={options} value={attributes.fibreType ?? null}
                  error={errors["fibreType"]} onPick={(v) => set("fibreType", v)} />
                <Combo label="Weave Structure" list="weave_structure"
                  options={options} value={attributes.weaveStructure ?? null}
                  onPick={(v) => set("weaveStructure", v)} />
                <Combo label="Textile Material" list="textile_material"
                  options={options} value={attributes.textileMaterial ?? null}
                  parentFilter={attributes.fibreType ?? null} fallbackToUnparented
                  onPick={(v) => set("textileMaterial", v)} />
                {/*
                  Nothing renders above until a fibre is chosen: the field is
                  narrowed by Fiber Type, and with no fibre there is nothing
                  it could honestly offer. Say so, rather than leaving a gap.
                */}
                {attributes.fibreType == null && (
                  <p className="self-center text-[12px] leading-relaxed text-muted">
                    Textile Material is offered once a fibre is chosen.
                  </p>
                )}
              </Grid>

              {/*
                Where the stock is, asked while the record is being created.

                It was a step of its own at the end of the wizard, which put
                the most concrete question — how many, and where are they —
                furthest from the person holding the pieces. On an existing
                record this is the ledger's business and lives on the Stock
                tab; here it is one movement, written when Finish is pressed.
              */}
              {isNew && (
                <div className="mt-6">
                  <OpeningStock
                    locations={locations}
                    lines={openingStock}
                    setLines={setOpeningStock}
                    unit={uom}
                  />
                </div>
              )}

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

          {activeTab === "craft" && (
            <Grid>
              {/*
                Colour leads, because on a hand-painted saree it is the first
                thing anyone says about the piece and the thing that makes one
                colourway different from the next under the same design.

                Two of them. The primary is the colour the record is filed
                under — with the design, it is what identifies this row. The
                secondary is the contrast: a pallu in another shade, a border
                that does not match. It is a description, not part of the
                identity, so two records cannot differ by it alone.
              */}
              <ColourCombo label="Primary Colour" required
                options={options} value={colourId} error={errors["colour"]}
                onPick={(v) => {
                  setColourId(v);
                  setErrors((p) => { const { colour: _d, ...r } = p; return r; });
                }} />
              <ColourCombo label="Secondary Colour"
                options={options} value={secondaryColourId}
                placeholder="None"
                onPick={setSecondaryColourId} />

              <Combo label="Craft Technique" list="craft_technique" required
                options={options} value={attributes.craftTechnique ?? null}
                error={errors["craftTechnique"]} onPick={(v) => set("craftTechnique", v)} />
              {craft === "Kalamkari" && (
                <Combo label="Craft Sub Type" list="craft_sub_type"
                  options={options} value={attributes.craftSubType ?? null}
                  onPick={(v) => set("craftSubType", v)} />
              )}
              {/*
                Region Style is not asked any more. It was renamed Textile
                Material on the live screen and then folded into it, so the
                twenty-three weaves are offered there, gated by Silk. The
                column stays on the design holding what it always held.
              */}
              <Combo label="Motif Category" list="motif_category"
                options={options} value={attributes.motifCategory ?? null}
                onPick={(v) => set("motifCategory", v)} />
              <Combo label="Motif" list="motif"
                options={options} value={attributes.motif ?? null}
                parentFilter={attributes.motifCategory ?? null}
                disabled={!attributes.motifCategory}
                placeholder={attributes.motifCategory ? "Choose…" : "Pick a category first"}
                onPick={(v) => set("motif", v)} />
            </Grid>
          )}

          {/*
            Additional Product Details.

            The tab was Blouse and held three blouse questions. Border Height
            and Saree Layout have joined them, which is the shape the tab was
            growing into anyway: everything here describes a part of the
            finished saree rather than the cloth it is made from or the craft
            that decorated it.
          */}
          {activeTab === "blouse" && (
            <>
              {isSaree && (
                <>
                  {/*
                    Two sections, because a saree and its blouse are two
                    things. Everything in the first describes the cloth you
                    unfold — the field, the pallu, the border that runs down
                    it. Everything in the second describes the piece that
                    comes folded in with it, and it is there at all only if
                    the sub type says one does.

                    Nothing here invents vocabulary: a motif on the blouse is
                    a motif, and a blouse border has the styles a saree
                    border has. The question each asks is placement.
                  */}
                  {/*
                    Border gets a section of its own.

                    Six fields in a two-column grid wrapped the border group
                    across three rows — Style top right, Height bottom left,
                    Motif bottom right — so the three questions about one part
                    of the cloth were the hardest three to read together. Each
                    section now holds one part, and the eye stops travelling.
                  */}
                  <Section title="Saree & Pallu">
                    <Combo label="Saree Style" list="saree_style"
                      options={options} value={attributes.sareeStyle ?? null}
                      onPick={(v) => set("sareeStyle", v)} />
                    <Combo label="Saree Body Motif" list="motif"
                      options={options} value={attributes.sareeBodyMotif ?? null}
                      onPick={(v) => set("sareeBodyMotif", v)} />
                    <Combo label="Pallu Motif" list="motif"
                      options={options} value={attributes.palluMotif ?? null}
                      onPick={(v) => set("palluMotif", v)} />
                  </Section>

                  <Section title="Border">
                    <Combo label="Border Style" list="border_style"
                      options={options} value={attributes.borderStyle ?? null}
                      onPick={(v) => set("borderStyle", v)} />
                    <Combo label="Border Height" list="border_height"
                      options={options} value={attributes.borderHeight ?? null}
                      onPick={(v) => set("borderHeight", v)} />
                    <Combo label="Border Motif" list="motif"
                      options={options} value={attributes.borderMotif ?? null}
                      onPick={(v) => set("borderMotif", v)} />
                  </Section>

                  {withBlouse && (
                    <Section title="Blouse">
                      <Combo label="Blouse Status" list="blouse_status"
                        options={options} value={attributes.blouseStatus ?? null}
                        onPick={(v) => set("blouseStatus", v)} />
                      <Combo label="Blouse Style" list="blouse_style"
                        options={options} value={attributes.blouseStyle ?? null}
                        onPick={(v) => set("blouseStyle", v)} />
                      <Combo label="Blouse Material" list="blouse_material"
                        options={options} value={attributes.blouseMaterial ?? null}
                        onPick={(v) => set("blouseMaterial", v)} />
                      <Combo label="Blouse Border" list="border_style"
                        options={options} value={attributes.blouseBorder ?? null}
                        onPick={(v) => set("blouseBorder", v)} />
                      <Combo label="Blouse Motif" list="motif"
                        options={options} value={attributes.blouseMotif ?? null}
                        onPick={(v) => set("blouseMotif", v)} />
                    </Section>
                  )}
                </>
              )}

              {/*
                Outside both, because the adjectives describe the whole piece
                rather than any part of it, they are what the product name is
                built from, and a dupatta has them too.
              */}
              <Section title="Description">
                <MultiCombo label="Descriptor" list="descriptor"
                  options={options} values={descriptors}
                  onChange={setDescriptors} />
              </Section>
            </>
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

                    {/*
                      The currency sits in the field rather than in the label.
                      Every amount here is rupees and always will be, but a
                      number in a box says nothing on its own — and these
                      values end up on a tag, an invoice and a storefront.
                    */}
                    <span
                      className={`flex items-center rounded-md border bg-surface ${
                        errors[p.key] ? "border-brick" : "border-rule-2"
                      }`}
                    >
                      <span className="flex-none border-r border-rule px-2.5 py-2 text-[11.5px] font-medium text-muted">
                        INR
                      </span>
                      <input
                        type="number"
                        min="0"
                        // Paise matter on a wholesale price even where they
                        // do not on a tag. Without a step the browser calls
                        // 1249.50 invalid and refuses to submit it.
                        step="0.01"
                        inputMode="decimal"
                        value={prices[p.key]}
                        onChange={(e) => {
                          setPrices((prev) => ({ ...prev, [p.key]: e.target.value }));
                          setErrors((prev) => {
                            const { [p.key]: _d, ...rest } = prev;
                            return rest;
                          });
                        }}
                        placeholder="—"
                        className="w-full bg-transparent px-3 py-2 text-right text-[14px] tabular-nums text-ink focus:outline-none"
                      />
                    </span>
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
            <ImageSlots
              /*
                Which photographs a product needs depends on what it is: a
                saree is judged on Body, Pallu, Border and Blouse, and a
                bedsheet is not. A slot that names a product type is offered
                only under it; one that names none is offered on everything,
                which is what the four existing slots do.
              */
              slots={(options["image_slot"] ?? []).filter(
                (o) =>
                  o.parentId === null ||
                  o.parentId === (attributes.productType ?? attributes.homeProductType),
              )}
              chosen={imageSlots}
              setChosen={setImageSlots}
              taken={record?.images ?? []}
              colourwayId={record?.id ?? null}
              onChanged={onSaved}
            />
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

          {result === null && (
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

          {!onLastStep && (
            <button
              type="button"
              onClick={goNext}
              className="rounded-md border border-rule-2 px-3 py-2 text-[13.5px] text-ink-2 hover:bg-surface-2"
            >
              Next
            </button>
          )}

          {/*
            The primary action is always offered, on both.

            On a new record it used to be Next until the last step, so
            finishing early meant clicking through tabs you had nothing to say
            about. On an existing one there was no Next at all. Now the same
            three buttons sit there and only the word changes — Finish makes a
            record, Save changes one, and neither is hidden behind a step.
          */}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-brick px-4 py-2 text-[13.5px] font-medium text-on-brick hover:bg-brick-2 disabled:opacity-50"
          >
            {pending ? "Saving…" : isNew ? "Finish" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * A titled group of fields.
 *
 * The rule under the heading rather than a box around the fields: a tab of
 * boxes reads as several forms, and this is one form with parts. The first
 * section skips the top margin so the tab does not open with a gap.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-3 border-b border-rule pb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">
        {title}
      </h3>
      <Grid>{children}</Grid>
    </section>
  );
}

/**
 * The field grid.
 *
 * Three across where there is room. Two left half the dialog empty and made
 * six fields scroll — the tabs are wide and the fields are not, so the third
 * column costs nothing and saves a tab from needing a scrollbar. Two on a
 * narrow window, one on a phone.
 */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
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

/**
 * The one question with more than one answer.
 *
 * Chips rather than a `<select multiple>`, which needs ctrl-click to add a
 * second value and shows three rows of a twelve-item list. These are all
 * visible, all one tap, and read back as the phrase they will become in the
 * product name.
 */
function MultiCombo({
  label,
  list,
  options,
  values,
  onChange,
}: {
  label: string;
  list: string;
  options: Options;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const all = options[list] ?? [];
  if (all.length === 0) return null;

  const chosen = new Set(values);

  return (
    <div className="block sm:col-span-2 lg:col-span-3">
      <span className="mb-1 block text-[12.5px] text-ink-2">
        {label}
        {values.length > 0 && (
          <span className="font-normal text-muted">
            {" "}
            — {all.filter((o) => chosen.has(o.id)).map((o) => o.label).join(" ")}
          </span>
        )}
      </span>

      <div className="flex flex-wrap gap-1.5">
        {all.map((option) => {
          const on = chosen.has(option.id);

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                // Kept in the list's own order rather than tick order, so the
                // composed name reads the same however it was filled in.
                onChange(
                  all
                    .filter((o) => (o.id === option.id ? !on : chosen.has(o.id)))
                    .map((o) => o.id),
                )
              }
              className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${
                on
                  ? "border-brick bg-brick-soft font-medium text-brick"
                  : "border-rule-2 text-muted hover:bg-surface-2"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Colour, shown as colour.
 *
 * A native `<select>` cannot draw anything, so picking from a hundred and
 * forty-seven names meant reading words and remembering what Dark Sea Green
 * looks like. This is a button that wears the chosen colour and a list where
 * every row carries its own swatch, with a search box because at that length
 * scrolling is not finding.
 */
function ColourCombo({
  label,
  options,
  value,
  onPick,
  required,
  error,
  placeholder,
}: {
  label: string;
  options: Options;
  value: string | null;
  onPick: (value: string | null) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  const all = options["colour"] ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function away(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (all.length === 0 && value === null) return null;

  const chosen = all.find((o) => o.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const shown = q === "" ? all : all.filter((o) => o.label.toLowerCase().includes(q));

  return (
    <div className="block" ref={box}>
      <span className="mb-1 block text-[12.5px] text-ink-2">
        {label}
        {required && <Required />}
      </span>

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setQuery("");
          }}
          aria-expanded={open}
          className={`flex w-full items-center gap-2 rounded-md border bg-surface px-3 py-2 text-left text-[14px] text-ink ${
            error ? "border-brick" : "border-rule-2"
          }`}
        >
          <Dot hex={chosen?.hex ?? null} label={chosen?.label ?? null} />
          <span className={chosen === null ? "text-faint" : ""}>
            {chosen?.label ?? placeholder ?? "Choose…"}
          </span>
          <span aria-hidden className="ml-auto text-[11px] text-faint">
            ▾
          </span>
        </button>

        {open && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-rule bg-surface shadow-lg">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${all.length} colours`}
              className="w-full border-b border-rule bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none"
            />

            <div className="max-h-64 overflow-y-auto">
              {value !== null && (
                <button
                  type="button"
                  onClick={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-muted hover:bg-surface-2"
                >
                  Clear
                </button>
              )}

              {shown.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onPick(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2 ${
                    option.id === value ? "bg-brick-soft font-medium text-brick" : "text-ink"
                  }`}
                >
                  <Dot hex={option.hex} label={option.label} />
                  {option.label}
                </button>
              ))}

              {shown.length === 0 && (
                <p className="px-3 py-3 text-[12.5px] text-muted">
                  No colour matches “{query}”.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <span className="mt-1 block text-[11.5px] text-brick">{error}</span>
    </div>
  );
}

/** The swatch itself. Ringed, or a pale colour is an invisible circle. */
function Dot({ hex, label }: { hex: string | null; label: string | null }) {
  const colour = colourSwatch(label, hex);

  return (
    <span
      aria-hidden
      className="size-4 flex-none rounded-full"
      style={{
        background: colour,
        boxShadow: isPaleSwatch(colour)
          ? "inset 0 0 0 1px var(--rule-2)"
          : "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    />
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
  hint,
  parentFilter,
  fallbackToUnparented,
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
  /** A line under the field, for a rule the control cannot show. */
  hint?: string;
  parentFilter?: string | null;
  /**
   * When the parent has no values of its own, offer the unparented ones.
   *
   * Textile Material needs it. Silk names twenty-three weaves and Cotton
   * names three, so those two answer for themselves; every other fibre —
   * Viscose, Linen, Jute — names none, and falls through to the ten that name
   * no fibre. Off by default: a motif with no category is a mistake, not a
   * catch-all.
   */
  fallbackToUnparented?: boolean;
}) {
  let values: Option[] = options[list] ?? [];

  // Motifs are filtered to the chosen category, which is what the parent
  // column on the lookup value is for.
  if (parentFilter !== undefined) {
    if (parentFilter === null) {
      // Nothing chosen above, so nothing to offer. Not "the values that
      // belong to nobody" — an unparented value is a value that applies to
      // every parent, not one that applies before a parent is picked.
      values = [];
    } else {
      const own = values.filter((o) => o.parentId === parentFilter);

      values =
        fallbackToUnparented === true && own.length === 0
          ? values.filter((o) => o.parentId === null)
          : own;
    }
  }

  /*
    A question with no possible answer is not asked.

    Three ways that happens, and they all deserve the same treatment: the
    classification is switched off in Master Lists and sends no values; the
    answer above has not been given yet, so Textile Material has no fibre to
    narrow to; or it has been given and offers nothing, so Product Type is
    empty under an industry that is not Clothing.

    A record that already answered keeps its field either way, so an answer
    never vanishes from the form that holds it.
  */
  if (values.length === 0 && value === null) return null;

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
      {(error ?? (values.length === 0 && !disabled)) ? (
        <span className="mt-1 block text-[11.5px] text-brick">
          {error ?? "No values in this list yet"}
        </span>
      ) : hint !== undefined ? (
        <span className="mt-1 block text-[11.5px] leading-relaxed text-muted">
          {hint}
        </span>
      ) : null}
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
  /*
    Nothing to show yet, and no pretending otherwise.

    The tab is offered on a new record so the two views match, but the ledger
    it shows is written when Finish is pressed. Opening stock is asked once,
    on Basic, rather than in two places that could disagree.
  */
  if (record === null) {
    return (
      <Note>
        Stock movements start once the record exists. The opening quantity and
        where it sits are asked on Basic, and Finish writes them as the first
        movement — after which this tab is the ledger.
      </Note>
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
      {/*
        Six counts across three, so the ledger reads as two rows rather than
        a column six tall that pushes everything below it off the screen.
      */}
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
        Consignments Received
      </h3>
      <p className="mb-2 text-[12px] leading-relaxed text-muted">
        Each delivery has its own product code, and the pieces in it their own
        item codes. The counts above say what is here now; this says what came
        in and against which invoice.
      </p>
      <Consignments consignments={record.consignments} unit={unit} />

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
  unit,
}: {
  locations: PickableLocation[];
  lines: OpeningLine[];
  setLines: (lines: OpeningLine[]) => void;
  /**
   * What is being counted — Piece, Metre.
   *
   * Never asked for: the product type states it and the record follows. A
   * bare 12 beside a length of fabric is the one number on this form that
   * could mean two quite different things.
   */
  unit: string | null;
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
        No locations are set up to hold stock. Add one on Locations →
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
          {unit !== null && (
            <span className="text-muted">
              {" "}
              {unit.toLowerCase()}
              {total === 1 ? "" : "s"}
            </span>
          )}
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

  if (internal.length === 0) {
    return (
      <Note>
        No locations are set up to hold stock. Add one on Locations →
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

/**
 * What arrived, and when.
 *
 * The tiles above say how much is here now; this says what came in, against
 * which invoice, and what it was called. Those are different questions —
 * "how many Deer sarees do we have" is answered by the count, and "what did
 * the March delivery consist of" is answered here.
 *
 * Item codes are folded away because ten of them is a wall of numbers that
 * says nothing until somebody is looking for one particular saree — and when
 * they are, it is the only thing on the screen that matters.
 */
function Consignments({
  consignments,
  unit,
}: {
  consignments: RecordDetail["consignments"];
  unit: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (consignments.length === 0) {
    return (
      <p className="text-[13.5px] text-muted">
        Nothing recorded as received yet. Stock entered before consignments
        existed has no product code — it is still counted, it just cannot say
        which delivery it came in.
      </p>
    );
  }

  const total = consignments.reduce((sum, c) => sum + c.qty, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      <div className="flex items-baseline gap-3 border-b border-rule bg-surface-2 px-4 py-1.5 text-[11.5px] font-medium text-muted">
        <span className="w-24">Product Code</span>
        <span className="w-14 text-right">Qty</span>
        <span className="w-28">Into</span>
        <span className="w-24">Received</span>
        <span>Reference</span>
      </div>

      {consignments.map((c) => (
        <div key={c.id} className="border-b border-rule last:border-b-0">
          <button
            type="button"
            onClick={() => setOpen(open === c.id ? null : c.id)}
            // Only worth opening when there is something inside. Unserialised
            // cloth arrives as a quantity, not as pieces.
            disabled={c.items.length === 0}
            className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left text-[13px] ${
              c.items.length > 0 ? "hover:bg-surface-2" : "cursor-default"
            }`}
          >
            <span className="w-24 font-mono text-[13px] font-medium text-ink">
              {c.code}
            </span>
            <span className="w-14 text-right tabular-nums text-ink-2">
              {c.qty}
            </span>
            <span className="w-28 truncate text-ink-2">{c.location ?? "—"}</span>
            <span className="w-24 text-muted">{c.receivedAt}</span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {c.reference ?? c.note ?? "—"}
            </span>

            {c.items.length > 0 && (
              <span className="flex-none text-[12px] text-faint">
                {open === c.id ? "Hide" : `${c.items.length} items`}
              </span>
            )}
          </button>

          {open === c.id && (
            <div className="border-t border-rule bg-surface-2 px-4 py-2.5">
              <p className="mb-1.5 text-[11.5px] text-muted">
                Item codes — one per {unit.replace(/s$/, "")}, each on its own
                label.
              </p>
              <div className="flex flex-wrap gap-1">
                {c.items.map((item) => (
                  <span
                    key={item}
                    className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-ink-2"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-baseline gap-3 border-t border-rule-2 bg-surface-2 px-4 py-2 text-[13px] font-medium">
        <span className="w-24 text-ink-2">
          {consignments.length} consignment{consignments.length === 1 ? "" : "s"}
        </span>
        <span className="w-14 text-right tabular-nums text-ink">{total}</span>
        {/*
          Received all time, not on hand. Some of it has since been sold, and
          saying "total" without saying total of what is how a number gets
          misread.
        */}
        <span className="text-[12px] font-normal text-muted">
          received all time
        </span>
      </div>
    </div>
  );
}

/**
 * Which photographs this product needs.
 *
 * Choosing the slots and taking the pictures are different acts, usually days
 * apart and often different people — so this records the intention, and the
 * photograph arrives against it later. A saree is judged on its Body, Pallu,
 * Border and Blouse; SLK can add a fifth on Master Lists and it appears here
 * with nothing to change.
 *
 * The file goes straight from the browser to R2 with a signed URL — it never
 * passes through this server, which would otherwise pay for every megabyte
 * twice and need Next's 1MB body limit raised to accept a photograph at all.
 */
function ImageSlots({
  slots,
  chosen,
  setChosen,
  taken,
  colourwayId,
  onChanged,
}: {
  slots: Option[];
  chosen: string[];
  setChosen: (next: string[]) => void;
  /** Slots that already have a row, and whether a photograph has arrived. */
  taken: { slotId: string | null; url: string | null }[];
  /**
   * Null while the record is being created.
   *
   * There is nothing to attach a photograph to until Finish writes the
   * colourway, so this tab records the intention and the pictures follow.
   */
  colourwayId: string | null;
  onChanged: (message: string) => void;
}) {
  const [storage, setStorage] = useState<{
    ready: boolean;
    missing: string[];
  } | null>(null);

  /** The photograph being looked at properly, or null. */
  const [enlarged, setEnlarged] = useState<string | null>(null);

  // Asked once, when the tab is opened. Whether the bucket is configured is a
  // fact about the server, and the alternative — threading it down from the
  // page through the table and the editor — is four props for one sentence.
  useEffect(() => {
    let alive = true;
    void storageStatus().then((s) => {
      if (alive) setStorage(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const url = new Map(
    taken
      .filter((t) => t.slotId !== null && t.url !== null)
      .map((t) => [t.slotId as string, t.url as string]),
  );

  if (slots.length === 0) {
    return (
      <Note>
        No image slots are set up. Add them on Master Lists → Image Slot, and
        they will be offered here.
      </Note>
    );
  }

  return (
    <>
      <h3 className="mb-1 text-[15px] font-semibold text-ink">
        Photographs This Product Needs
      </h3>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        Tick what should be shot. The list comes from Master Lists, so adding a
        new kind of photograph there offers it on every record.
      </p>

      <div className="divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
        {slots.map((slot) => (
          <SlotTile
            key={slot.id}
            slot={slot}
            on={chosen.includes(slot.id)}
            photograph={url.get(slot.id) ?? null}
            colourwayId={colourwayId}
            canUpload={storage?.ready === true}
            onToggle={() =>
              setChosen(
                chosen.includes(slot.id)
                  ? chosen.filter((id) => id !== slot.id)
                  : [...chosen, slot.id],
              )
            }
            onChanged={onChanged}
            onEnlarge={setEnlarged}
          />
        ))}
      </div>

      {enlarged !== null && (
        <Lightbox url={enlarged} onClose={() => setEnlarged(null)} />
      )}

      {colourwayId === null && (
        <Note>
          Photographs can be added once the record exists — Finish writes it,
          and this tab is then where the pictures go. Ticking here says which
          ones are wanted.
        </Note>
      )}

      {storage !== null && !storage.ready && (
        <Note>
          Uploading is switched off: {storage.missing.join(", ")}{" "}
          {storage.missing.length === 1 ? "is" : "are"} not set. Add the
          Cloudflare R2 credentials to the environment and the buttons above
          start working — nothing else needs changing. Ticking a slot still
          records which photographs are wanted.
        </Note>
      )}
    </>
  );
}

/**
 * One slot: what it is, whether it is wanted, and the photograph if it came.
 *
 * A tile rather than a checkbox row, because once a picture can arrive the
 * picture is the thing worth showing — a filled slot should look filled from
 * across the room, and an empty one should look like somewhere to put a file.
 */
function SlotTile({
  slot,
  on,
  photograph,
  colourwayId,
  canUpload,
  onToggle,
  onChanged,
  onEnlarge,
}: {
  slot: Option;
  on: boolean;
  photograph: string | null;
  colourwayId: string | null;
  canUpload: boolean;
  onToggle: () => void;
  onChanged: (message: string) => void;
  /** Show it at its own size. The row is a reference, not the photograph. */
  onEnlarge: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const has = photograph !== null;
  const wanted = on || has;
  const live = colourwayId !== null && canUpload;

  /**
   * Sign, PUT, then tell the server it landed.
   *
   * Three steps because the middle one does not involve this server at all.
   * If the PUT fails the database is never told, so a slot never claims a
   * photograph that is not in the bucket.
   */
  const send = async (file: File) => {
    if (colourwayId === null) return;

    setFailed(null);
    setBusy("Preparing…");

    const ticket = await presignImage(
      colourwayId,
      slot.id,
      file.type,
      file.size,
    );

    if (!ticket.ok || ticket.url === undefined || ticket.key === undefined) {
      setBusy(null);
      setFailed(ticket.message);
      return;
    }

    setBusy("Uploading…");

    try {
      const put = await fetch(ticket.url, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });

      if (!put.ok) {
        setBusy(null);
        setFailed(`The upload was refused (${put.status}).`);
        return;
      }
    } catch {
      setBusy(null);
      setFailed("The upload did not finish. Check the connection and try again.");
      return;
    }

    // Read off the file rather than trusting the server to open it later:
    // the dimensions are wanted for laying the storefront out, and the
    // browser already has the bytes decoded.
    const size = await measure(file);

    setBusy("Saving…");
    const result = await confirmImage(
      colourwayId,
      slot.id,
      ticket.key,
      size?.width ?? null,
      size?.height ?? null,
    );

    setBusy(null);
    if (result.ok) onChanged(result.message);
    else setFailed(result.message);
  };

  return (
    <div
      onDragOver={(e) => {
        if (!live) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!live) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file !== undefined) void send(file);
      }}
      className={dragging ? "bg-brick-soft" : ""}
    >
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) void send(file);
          // Cleared so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      {/*
        A tick, a state, a thumbnail and its actions — on one line.

        These were tall cards, and four of them filled the tab and pushed
        Finish off the screen. A photograph is worth looking at properly and
        worth almost no space until then, so the thumbnail opens the real
        thing rather than standing in for it.
      */}
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          // A slot with a photograph cannot be un-ticked — that would delete
          // the picture by implication, which is not what a tick should mean.
          disabled={has}
          onClick={onToggle}
          title={has ? "Remove the photograph first" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed"
        >
          <span
            aria-hidden
            className={`flex size-4 flex-none items-center justify-center rounded border text-[10px] ${
              wanted ? "border-brick bg-brick text-on-brick" : "border-rule-2"
            }`}
          >
            {wanted ? "✓" : ""}
          </span>
          <span
            className={`truncate text-[13px] ${
              wanted ? "font-medium text-ink" : "text-muted"
            }`}
          >
            {slot.label}
          </span>
        </button>

        <span className="flex-none text-[11.5px] text-muted">
          {busy ?? (has ? "Photographed" : wanted ? "To be shot" : "Not needed")}
        </span>

        {has ? (
          <button
            type="button"
            onClick={() => onEnlarge(photograph)}
            title={`See ${slot.label} full size`}
            className="h-11 w-9 flex-none overflow-hidden rounded border border-rule-2 hover:border-brick"
          >
            {/*
              A plain img, not next/image: the bucket host is configured at
              runtime and the optimiser would need it at build time.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photograph} alt={slot.label} className="size-full object-cover" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (live ? input.current?.click() : onToggle())}
            title={live ? `Add the ${slot.label} photograph` : undefined}
            className="grid h-11 w-9 flex-none place-items-center rounded border border-dashed border-rule-2 text-[15px] text-faint hover:border-brick hover:text-brick"
          >
            ＋
          </button>
        )}

        <span className="flex w-14 flex-none justify-end gap-0.5">
          {has && live && (
            <>
              <IconAction
                label={`Replace the ${slot.label} photograph`}
                disabled={busy !== null}
                onClick={() => input.current?.click()}
              >
                ⟳
              </IconAction>
              <IconAction
                label={`Remove the ${slot.label} photograph`}
                disabled={busy !== null}
                danger
                onClick={() => {
                  setBusy("Removing…");
                  void removeImage(colourwayId, slot.id).then((r) => {
                    setBusy(null);
                    if (r.ok) onChanged(r.message);
                    else setFailed(r.message);
                  });
                }}
              >
                ×
              </IconAction>
            </>
          )}
        </span>
      </div>

      {failed !== null && (
        <p className="border-t border-rule px-2 py-1.5 text-[11px] leading-relaxed text-brick">
          {failed}
        </p>
      )}
    </div>
  );
}

/**
 * One photograph, as large as it will go.
 *
 * At its own size up to the window, not stretched to fill it: a saree
 * photographed at 800px looks worse blown up to 1600 than it does at 800,
 * and the reason to open this is to judge the cloth.
 */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Photograph"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-5 text-[26px] leading-none text-white/80 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex-none rounded px-1.5 py-0.5 text-[13px] leading-none transition-colors disabled:opacity-30 ${
        danger === true
          ? "text-muted hover:bg-brick-soft hover:text-brick"
          : "text-muted hover:bg-surface-3 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The pixel dimensions, or null if the browser cannot read them.
 *
 * Never fatal: a photograph that uploaded is a photograph, and refusing to
 * record it because its size could not be measured would throw away the part
 * that matters for the part that does not.
 */
async function measure(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}
