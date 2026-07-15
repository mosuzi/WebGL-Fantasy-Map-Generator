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
