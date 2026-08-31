/**
 * A swatch for every colour in the vocabulary.
 *
 * The workbook's Correction Log describes the colour list as
 * "web-palette-derived", so for most values the CSS named colour *is* the
 * intended one — it simply was never written down. Only the trade names that
 * have no CSS equivalent need a hand-picked value.
 *
 * Resolved here rather than stored on every row, so a colour added later
 * through Categories & Attributes gets a swatch without anyone remembering to
 * pick a hex. A value's own `meta.hex` still wins when it has one.
 */

/** Trade names with no CSS equivalent, and the ones CSS gets wrong for cloth. */
const TRADE: Record<string, string> = {
  "bottle green": "#0b4f2c",
  cream: "#f0e4c8",
  golden: "#d4af37",
  "multicolour": "#b23a26",
  mustard: "#c9a227",
  "off white": "#f4f0e6",
  peach: "#ffcba4",
  rust: "#b7410e",
};

/** The CSS named colours the workbook drew on. */
const CSS_NAMED: Record<string, string> = {
  beige: "#f5f5dc",
  black: "#000000",
  blue: "#0000ff",
  brown: "#a52a2a",
  chartreuse: "#7fff00",
  "dark blue": "#00008b",
  "dark gray": "#a9a9a9",
  "dark green": "#006400",
  "dark magenta": "#8b008b",
  "dark olive green": "#556b2f",
  "dark orange": "#ff8c00",
  "dark sea green": "#8fbc8f",
  "dark slate blue": "#483d8b",
  "deep pink": "#ff1493",
  "ghost white": "#f8f8ff",
  gray: "#808080",
  green: "#008000",
  "hot pink": "#ff69b4",
  indigo: "#4b0082",
  lavender: "#e6e6fa",
  "light pink": "#ffb6c1",
  "light sky blue": "#87cefa",
  magenta: "#ff00ff",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  orange: "#ffa500",
  pink: "#ffc0cb",
  purple: "#800080",
  red: "#ff0000",
  silver: "#c0c0c0",
  "sky blue": "#87ceeb",
  teal: "#008080",
  turquoise: "#40e0d0",
  white: "#ffffff",
  yellow: "#ffff00",
};

/** A neutral for anything the two tables above do not know. */
const UNKNOWN = "#b8b0a6";

/**
 * The swatch for a colour label. `override` is a value's own stored hex, which
 * takes precedence so the vocabulary can correct this without a code change.
 *
 * Always returns something: a table where only some rows have a dot reads as
 * half-built, and one where the dot is sometimes wrong is still more useful
 * for scanning than one where it is sometimes absent.
 */
export function colourSwatch(
  label: string | null | undefined,
  override?: string | null,
): string {
  if (override) return override;
  if (!label) return UNKNOWN;

  const key = label.trim().toLowerCase();

  return TRADE[key] ?? CSS_NAMED[key] ?? UNKNOWN;
}

/** Whether the swatch is pale enough to need a border to be visible. */
export function isPaleSwatch(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  // Rec. 601 luma — good enough to decide whether a dot disappears on white.
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
}
