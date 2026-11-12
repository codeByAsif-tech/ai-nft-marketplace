/**
 * Reads one cookie from the request without a cookie-parser dependency.
 * Returns null when the cookie is missing or malformed.
 */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}
