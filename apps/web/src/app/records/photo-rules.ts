/**
 * What a usable product photograph looks like, and how to tell.
 *
 * The photographs are the reference for everything downstream — the
 * storefront, and the model that dresses a person in the saree. A part that
 * is sideways, half table, too dark or blurred cannot be fixed after the
 * fact, and the model reproduces whatever it is given, mistakes included.
 * So the rules are enforced at the only moment they can be: before the file
 * leaves the phone.
 *
 * Every check runs on a small greyscale copy of the frame. Nothing here
 * needs the pixels at full size, and a phone has to run it many times a
 * second while the camera is up.
 */

export type Orientation = "portrait" | "landscape";

export interface PhotoRule {
  /** Which way the phone is held — the long side runs the way the part does. */
  orientation: Orientation;
  /** The shortest long side the photograph may have, in pixels. */
  minLongSide: number;
  /** One line, for the person holding the phone. */
  guide: string;
}

const PORTRAIT_GUIDE = "Hold the phone upright. Only the cloth in the frame, edge to edge.";

/**
 * Keyed by the words in a slot's label. Master Lists names the slots; this
 * reads the name rather than an id so a renamed slot keeps its rule.
 */
const RULES: [needle: string, rule: PhotoRule][] = [
  ["border", {
    orientation: "landscape",
    minLongSide: 1500,
    guide: "Turn the phone sideways. The border runs left to right, its full width in the frame.",
  }],
  ["body", { orientation: "portrait", minLongSide: 1500, guide: PORTRAIT_GUIDE }],
  ["pallu", { orientation: "portrait", minLongSide: 1500, guide: PORTRAIT_GUIDE }],
  ["blouse", { orientation: "portrait", minLongSide: 1500, guide: PORTRAIT_GUIDE }],
];

const DEFAULT_RULE: PhotoRule = { orientation: "portrait", minLongSide: 1200, guide: PORTRAIT_GUIDE };

export function ruleFor(slotLabel: string): PhotoRule {
  const label = slotLabel.toLowerCase();
  return RULES.find(([needle]) => label.includes(needle))?.[1] ?? DEFAULT_RULE;
}

/** Square counts as portrait: a body shot can be square; a border strip never is. */
export function orientationOf(width: number, height: number): Orientation {
  return height >= width ? "portrait" : "landscape";
}

/** A greyscale frame, small enough to scan many times a second. */
export interface Grey {
  width: number;
  height: number;
  /** One byte per pixel, row-major. */
  data: Uint8ClampedArray;
}

export const ANALYSIS_WIDTH = 192;

export function toGrey(image: ImageData): Grey {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
  }
  return { width, height, data: out };
}

interface Stats {
  mean: number;
  std: number;
}

function stats(g: Grey, x0: number, y0: number, x1: number, y1: number): Stats {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = g.data[y * g.width + x]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

/** Fraction of pixels at the very top or bottom of the range — blown out or crushed. */
function clipped(g: Grey): { bright: number; dark: number } {
  let bright = 0;
  let dark = 0;
  for (const v of g.data) {
    if (v >= 250) bright++;
    else if (v <= 8) dark++;
  }
  return { bright: bright / g.data.length, dark: dark / g.data.length };
}

/**
 * Variance of a Laplacian: how much each pixel differs from its neighbours.
 * A sharp photograph of cloth is full of edges; a blurred one is smooth.
 */
function sharpness(g: Grey): number {
  const { width, height, data } = g;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - width]! - data[i + width]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Whether the cloth reaches every edge.
 *
 * Cloth has texture; a table, a floor or a wall next to it does not, or has
 * a different one. Each edge band is compared with the centre: a band that
 * is nearly flat while the centre is not is something other than the saree.
 * Judged relative to the centre so that a plain silk with little texture is
 * not failed for being what it is.
 */
function edgesFilled(g: Grey): boolean {
  const band = Math.max(4, Math.round(Math.min(g.width, g.height) * 0.1));
  const cx0 = Math.round(g.width * 0.3);
  const cx1 = Math.round(g.width * 0.7);
  const cy0 = Math.round(g.height * 0.3);
  const cy1 = Math.round(g.height * 0.7);
  const centre = stats(g, cx0, cx1, cy0, cy1);
  // Camera noise alone gives a real photograph a spread of two or three
  // levels; only a rendered flat colour sits below that.
  const floor = Math.max(1.5, centre.std * 0.3);

  const bands = [
    stats(g, 0, 0, g.width, band),
    stats(g, 0, g.height - band, g.width, g.height),
    stats(g, 0, 0, band, g.height),
    stats(g, g.width - band, 0, g.width, g.height),
  ];
  return bands.every((b) => b.std >= floor && Math.abs(b.mean - centre.mean) < 90);
}

/** Mean absolute difference between two frames of the same size. */
export function motion(a: Grey, b: Grey): number {
  if (a.data.length !== b.data.length) return 255;
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i]! - b.data[i]!);
  return sum / a.data.length;
}

export interface Verdict {
  ok: boolean;
  /** Why not, for the screen. Empty when ok. */
  message: string;
  /** Advisory only: a warning does not stop the photograph. */
  warning: boolean;
}

const OK: Verdict = { ok: true, message: "", warning: false };
const fail = (message: string): Verdict => ({ ok: false, message, warning: false });

/**
 * The live checks, in the order a person can act on them. The first failure
 * is the one shown — one instruction at a time, like a face frame that says
 * "remove glasses" before it says "blink".
 */
export function checkFrame(
  g: Grey,
  frameWidth: number,
  frameHeight: number,
  rule: PhotoRule,
  previous: Grey | null,
): Verdict {
  if (orientationOf(frameWidth, frameHeight) !== rule.orientation) {
    return fail(rule.orientation === "landscape" ? "Turn the phone sideways" : "Hold the phone upright");
  }
  const whole = stats(g, 0, 0, g.width, g.height);
  const clip = clipped(g);
  if (whole.mean < 60 || clip.dark > 0.25) return fail("Too dark — find more light");
  if (whole.mean > 215 || clip.bright > 0.06) return fail("Too bright — move out of direct sun");
  if (!edgesFilled(g)) return fail("Fill the frame with the cloth");
  if (previous !== null && motion(g, previous) > 6) return fail("Hold still");
  if (sharpness(g) < 25) return fail("Out of focus — hold steady, tap to focus");
  return OK;
}

/** The checks for a file someone already has, where only some can be fixed. */
export function checkStill(
  g: Grey,
  width: number,
  height: number,
  rule: PhotoRule,
): Verdict {
  if (orientationOf(width, height) !== rule.orientation) {
    return fail(
      rule.orientation === "landscape"
        ? "A border is photographed sideways — wider than tall. Turn it."
        : "This part is photographed upright — taller than wide. Turn it.",
    );
  }
  if (Math.max(width, height) < rule.minLongSide) {
    return fail(`Too small: ${width} × ${height}. At least ${rule.minLongSide} pixels on the long side.`);
  }
  const whole = stats(g, 0, 0, g.width, g.height);
  if (whole.mean < 60) return { ok: true, message: "Looks dark. A brighter retake will reproduce better.", warning: true };
  if (whole.mean > 215) return { ok: true, message: "Looks washed out. A retake out of direct light will reproduce better.", warning: true };
  if (!edgesFilled(g)) {
    return { ok: true, message: "Something other than the cloth reaches the edge. Crop or retake so only the cloth is in the frame.", warning: true };
  }
  return OK;
}
