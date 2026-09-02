import { storageStatus } from "@/app/records/image-actions";
import { guarded } from "@/lib/api";

/**
 * Whether photographs can be uploaded at all.
 *
 * Asked before the camera opens, not after. Letting somebody photograph six
 * slots of a saree and only then discovering the bucket was never configured
 * is how a person stops trusting a screen — and on a floor they will not go
 * back and do it again.
 *
 * `missing` names the environment variables rather than shrugging, because
 * whoever sees this is the person who can set them.
 */
export const GET = guarded("floor", () => storageStatus());
