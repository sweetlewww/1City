/** "20 Withrow Street, former Toronto" and "20 Withrow St" compare equal. */
export function normalizeAddress(s: string) {
  return s
    .toLowerCase()
    .replace(/,.*$/, "")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
