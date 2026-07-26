export async function waitForApiReady(page, timeoutMs) {
  await page.waitForFunction(() => {
    const api = window.webglGeneratorApi;
    const rendererReady = Boolean(window.__webglGeneratorApp?.renderer?.getStats?.()?.webgl2);
    if (!api || !rendererReady) return false;
    const runtime = api.info.runtimeStats();
    return runtime?.ok === true
      && runtime.data?.operation?.busy === false
      && runtime.data?.loading?.visible === false;
  }, null, {timeout: timeoutMs});
}

const PERFORMANCE_HEALTH_TYPES = new Set(["main-thread-long-task", "render-frame-gap"]);

export function partitionApiBrowserDiagnostics(healthErrors = {}, consoleErrors = []) {
  const observedHealthEvents = Array.isArray(healthErrors.events) ? healthErrors.events : [];
  const performanceHealthEvents = observedHealthEvents.filter(event => PERFORMANCE_HEALTH_TYPES.has(event?.type));
  const applicationHealthEvents = observedHealthEvents.filter(event => !PERFORMANCE_HEALTH_TYPES.has(event?.type));
  const performanceConsoleErrors = consoleErrors.filter(isPerformanceHealthConsole);
  const applicationConsoleErrors = consoleErrors.filter(message => !isPerformanceHealthConsole(message));
  return {
    healthErrors: {
      ...healthErrors,
      observedTotal: Number(healthErrors.total) || observedHealthEvents.length,
      observedCounts: healthErrors.counts || {},
      total: applicationHealthEvents.length,
      events: applicationHealthEvents,
      performanceTelemetry: {
        total: performanceHealthEvents.length,
        events: performanceHealthEvents
      }
    },
    consoleErrors: applicationConsoleErrors,
    performanceConsoleErrors
  };
}

function isPerformanceHealthConsole(message) {
  const text = String(message || "");
  return [...PERFORMANCE_HEALTH_TYPES].some(type => text.includes(`[FMG health] ${type}`));
}
