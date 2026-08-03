(() => {
  const localDevelopment = globalThis.location?.hostname === "localhost" && globalThis.location?.port === "5410";
  globalThis.__FMG_CLOUD_PROVIDER_CONFIG__ = {
    version: 1,
    providers: {
      dropbox: {
        appKey: "x91pg3vck9hryqt",
        redirectUri: localDevelopment
          ? "http://localhost:5410/oauth/dropbox/callback"
          : "https://fmg.mosuzi.top/oauth/dropbox/callback"
      },
      googleDrive: {
        clientId: "821266209218-btadofk8mh9v5c4mofskb9ea0lse3tg1.apps.googleusercontent.com"
      }
    }
  };
})();
