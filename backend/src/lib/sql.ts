/**
 * Escape LIKE/ILIKE wildcards so user search input matches literally.
 * Without this, `%` and `_` in a search term act as wildcards (e.g. "50%"
 * matches far more than intended, "_" matches any single char).
 * Relies on the default ILIKE escape character `\`.
 */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}
