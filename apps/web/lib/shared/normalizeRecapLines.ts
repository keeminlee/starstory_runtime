/**
 * Shared recap line normalization.
 *
 * Splits raw recap text into cleaned lines: trims whitespace, strips
 * leading dash/bullet markers, and removes blank lines.
 *
 * Used by both the client-side recap renderer and server-side annotation
 * service so that line indexing is always consistent.
 */
export function normalizeRecapLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-+\s*/, ""))
    .filter(Boolean);
}
