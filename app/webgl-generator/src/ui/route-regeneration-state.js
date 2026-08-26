export function normalizeRouteRegenerationResponse(response) {
  if (typeof response?.ok === "boolean") return response;
  if (response?.error) return {ok: false, error: normalizeRouteRegenerationError(response.error)};
  return {ok: true, data: response || {executed: false}};
}

export function normalizeRouteRegenerationError(error) {
  const cause = error?.cause;
  const details = error?.details && typeof error.details === "object" ? {...error.details} : {};
  if (cause?.code && !details.internalCode) details.internalCode = cause.code;
  if (cause?.details && !details.cause) details.cause = cause.details;
  return {
    code: String(error?.code || cause?.code || "operation_failed"),
    message: String(error?.message || cause?.message || "道路重算失败"),
    ...(Object.keys(details).length ? {details} : {})
  };
}

export function routeTopologySummary(map) {
  const routes = (map?.settlements?.routes || []).filter(route => route && !route.removed);
  const segments = Number(map?.settlements?.metadata?.routeSegments);
  return {
    routes: routes.length,
    segments: Number.isFinite(segments) ? segments : routes.reduce((sum, route) => sum + Math.max(0, (route.points || []).length - 1), 0)
  };
}
