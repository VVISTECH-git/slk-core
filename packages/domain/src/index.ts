/**
 * @slk/domain — types, schemas and rules shared by every client of the
 * Inventory API.
 *
 * Nothing in here may import from `@slk/db`. The domain describes what the
 * business means; the database describes how it is stored. Keeping the arrow
 * pointing one way is what lets the sync worker and the ops app agree on a
 * rule without agreeing on a table.
 *
 * Still to come: design and piece identity, the movement kinds that make up
 * the stock ledger, SKU construction, and the channel allocation rules.
 */

export {
  compareLabels,
  findDuplicates,
  normaliseLabel,
  type DuplicateHint,
  type VocabularyEntry,
} from "./vocabulary";
