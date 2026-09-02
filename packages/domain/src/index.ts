/**
 * @slk/domain — types, schemas and rules shared by every client of the
 * Inventory API.
 *
 * Nothing in here may import from `@slk/db`. The domain describes what the
 * business means; the database describes how it is stored. Keeping the arrow
 * pointing one way is what lets the sync worker and the ops app agree on a
 * rule without agreeing on a table.
 */

export {
  compareLabels,
  findDuplicates,
  normaliseLabel,
  LOOKUP_STATUSES,
  type DuplicateHint,
  type LookupStatus,
  type VocabularyEntry,
} from "./vocabulary";

export {
  abbr3,
  colourToken,
  designCode,
  designName,
  pieceCode,
  titleCase,
  type DesignCodeParts,
  type DesignNameParts,
} from "./naming";

export { colourSwatch, isPaleSwatch } from "./colour";

export { stockAt, type LocationPosition } from "./stock";

export { hashSecret, verifySecret } from "./secret";
