/** Absolute origin of the current deployment, derived from the incoming request (no env needed). */
export function baseUrl(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto =
    h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
