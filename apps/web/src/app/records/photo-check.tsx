"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ANALYSIS_WIDTH,
  orientationOf,
  checkStill,
  toGrey,
  type PhotoRule,
  type Verdict,
} from "./photo-rules";

/**
 * A file someone already has, looked at before it is accepted.
 *
 * The same rules as the camera, applied once. What can be fixed here is
 * fixed here — a sideways photograph is turned, losslessly — and what cannot
 * is said plainly so the person retakes it rather than uploading it and
 * finding out from the storefront.
 *
 * The turn is a quarter, so no pixel is resampled. The turned file is
 * re-encoded in the original's format at high quality; the untouched file
 * goes through exactly as chosen.
 */
export function PhotoCheck({
  file,
  slotLabel,
  rule,
  onUse,
  onCancel,
}: {
  file: File;
  slotLabel: string;
  rule: PhotoRule;
  onUse: (file: File) => void;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  /**
   * Whether an orientation tag turned the decode. Phones store a portrait
   * JPEG as sideways pixels plus a tag saying "turn me"; browsers obey it,
   * some tools do not. A tagged file is written out upright so nothing
   * downstream has to know.
   */
  const [tagged, setTagged] = useState(false);
  const [turns, setTurns] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Decode once, honouring the orientation tag phones write, so a photo that
  // only *looks* upright because of the tag is handled as its pixels are.
  useEffect(() => {
    let alive = true;
    Promise.all([
      createImageBitmap(file, { imageOrientation: "from-image" }),
      createImageBitmap(file, { imageOrientation: "none" }),
    ])
      .then(([oriented, raw]) => {
        const turned = oriented.width !== raw.width || oriented.height !== raw.height;
        raw.close();
        if (alive) {
          setTagged(turned);
          setBitmap(oriented);
        } else {
          oriented.close();
        }
      })
      .catch(() => {
        if (alive) setFailed("This file could not be read as an image.");
      });
    return () => {
      alive = false;
    };
  }, [file]);

  // Re-judged whenever the bitmap or the turn changes: drawn turned into a
  // small canvas for the checks and a larger one for the eye. Derived, not
  // stored — there is nothing here that is not a function of those two.
  const judged = useMemo<{ verdict: Verdict; preview: string } | null>(() => {
    if (!bitmap) return null;
    const sideways = turns % 2 === 1;
    const width = sideways ? bitmap.height : bitmap.width;
    const height = sideways ? bitmap.width : bitmap.height;

    const small = document.createElement("canvas");
    const scale = ANALYSIS_WIDTH / Math.max(width, height);
    small.width = Math.max(8, Math.round(width * scale));
    small.height = Math.max(8, Math.round(height * scale));
    drawTurned(small, bitmap, turns);
    const ctx = small.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const grey = toGrey(ctx.getImageData(0, 0, small.width, small.height));
    const verdict = checkStill(grey, width, height, rule);

    const view = document.createElement("canvas");
    const viewScale = Math.min(1, 1200 / Math.max(width, height));
    view.width = Math.round(width * viewScale);
    view.height = Math.round(height * viewScale);
    drawTurned(view, bitmap, turns);
    return { verdict, preview: view.toDataURL("image/jpeg", 0.85) };
  }, [bitmap, turns, rule]);
  const verdict = judged?.verdict ?? null;
  const preview = judged?.preview ?? null;

  useEffect(() => () => bitmap?.close(), [bitmap]);

  async function use() {
    if (!bitmap) return;
    if (turns === 0 && !tagged) {
      onUse(file);
      return;
    }
    setBusy(true);
    const sideways = turns % 2 === 1;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? bitmap.height : bitmap.width;
    canvas.height = sideways ? bitmap.width : bitmap.height;
    drawTurned(canvas, bitmap, turns);
    const png = file.type === "image/png";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", 0.95),
    );
    setBusy(false);
    if (!blob) {
      setFailed("The turned photograph could not be written.");
      return;
    }
    const name = file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg");
    onUse(new File([blob], name, { type: blob.type }));
  }

  const width = bitmap ? (turns % 2 ? bitmap.height : bitmap.width) : null;
  const height = bitmap ? (turns % 2 ? bitmap.width : bitmap.height) : null;
  const blocked = verdict !== null && !verdict.ok;
  const canTurn = blocked && verdict.message.includes("Turn it");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Check the ${slotLabel} photograph`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 text-white"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[22px] leading-none text-white/80">
          ←
        </button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{slotLabel}</h2>
          <p className="truncate text-[12px] text-white/70">{rule.guide}</p>
        </div>
        {width !== null && height !== null && (
          <span className="ml-auto text-[12px] tabular-nums text-white/60">
            {width} × {height} · {orientationOf(width, height)}
          </span>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt=""
            className={`max-h-full max-w-full rounded-lg border-4 object-contain ${
              blocked ? "border-brick" : verdict?.warning ? "border-warn" : "border-ok"
            }`}
          />
        ) : (
          <p className="text-[14px] text-white/70">{failed ?? "Reading the photograph…"}</p>
        )}
      </div>

      <footer className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
        {verdict && (
          <p
            className={`max-w-prose text-center text-[14px] ${
              blocked ? "text-white" : verdict.warning ? "text-warn" : "text-ok"
            }`}
          >
            {verdict.ok && !verdict.warning ? "Looks right." : verdict.message}
          </p>
        )}
        {failed && verdict && <p className="text-[13px] text-brick">{failed}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/40 px-5 py-2.5 text-[14px]">
            Choose another
          </button>
          {bitmap && (
            <button
              type="button"
              onClick={() => setTurns((t) => (t + 1) % 4)}
              className={`rounded-lg border px-5 py-2.5 text-[14px] ${
                canTurn ? "border-white bg-white text-black" : "border-white/40"
              }`}
            >
              Turn ↻
            </button>
          )}
          <button
            type="button"
            onClick={() => void use()}
            disabled={!bitmap || blocked || busy}
            className="rounded-lg bg-white px-5 py-2.5 text-[14px] font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Writing…" : verdict?.warning ? "Use it anyway" : "Use this photograph"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function drawTurned(canvas: HTMLCanvasElement, bitmap: ImageBitmap, turns: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sideways = turns % 2 === 1;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((turns * Math.PI) / 2);
  const dw = sideways ? h : w;
  const dh = sideways ? w : h;
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
