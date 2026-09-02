/**
 * Rupees, written the way they are read.
 *
 * Amounts are stored in paise as integers — a rupee is a hundred paise and
 * rounding a price is always a bug — so every screen needs the same rule for
 * turning one back into words. There were three copies of that rule and two
 * of them rounded to whole rupees, so a saree entered at 4,250.75 showed as
 * ₹4,250.75 on Product Management and ₹4,251 on Stock Records: the same
 * piece, two prices, on two screens a shop assistant reads side by side.
 *
 * The paise appear only when there are any. Most prices are round and a
 * column of ".00" is noise that makes the ones that are not round harder to
 * see, which is the opposite of what the decimals are for.
 */
export function rupees(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
