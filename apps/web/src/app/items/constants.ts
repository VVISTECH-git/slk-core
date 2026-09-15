/**
 * What kind of end product this cloth is meant for — "Sarees", "Fabric" sold
 * as-is, "Chunnies", and so on. A cloth item can be suited to more than one
 * (plain cotton fabric might become either Sarees or Chunnies), so this is a
 * set, not a single choice — the same shape as `vendor.stages`.
 */
export const CLOTH_TYPES = ["Sarees", "Fabric", "Chunnies", "Bedsheets", "Pillow Covers"] as const;
