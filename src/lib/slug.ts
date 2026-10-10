/**
 * Turns an item name into the readable part of its link:
 *   "Eerie Pumpkin Head" -> "Eerie-Pumpkin-Head"
 * Anything that isn't a letter or a number (spaces, apostrophes, symbols) becomes a single hyphen.
 */
export function itemSlug(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the old-style links that use the item's long id. */
export function isUuid(value: string) {
  return UUID_RE.test(value);
}
