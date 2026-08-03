import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {
  emptyCloudProviderConfig,
  hasCloudProviderBuildInput,
  normalizeCloudProviderConfig,
  readCloudProviderBuildConfig,
  serializeCloudProviderConfig
} from "./cloud-provider-config.mjs";

const unified = readCloudProviderBuildConfig({
  FMG_CLOUD_PROVIDER_CONFIG: JSON.stringify({
    version: 1,
    providers: {
      dropbox: {appKey: "fixture-unified-dropbox", redirectUri: "https://fixture.test/callback"},
      googleDrive: {clientId: "fixture-unified-google.apps.googleusercontent.com"}
    }
  }),
  FMG_DROPBOX_APP_KEY: "must-not-win"
});
assert.equal(unified.providers.dropbox.appKey, "fixture-unified-dropbox");

const individual = readCloudProviderBuildConfig({
  FMG_DROPBOX_APP_KEY: "fixture-new-dropbox",
  VITE_FMG_DROPBOX_APP_KEY: "fixture-legacy-dropbox",
  VITE_FMG_DROPBOX_REDIRECT_URI: "https://fixture.test/legacy-callback",
  FMG_GOOGLE_CLIENT_ID: "fixture-new-google.apps.googleusercontent.com"
});
assert.deepEqual(individual.providers, {
  dropbox: {appKey: "fixture-new-dropbox", redirectUri: "https://fixture.test/legacy-callback"},
  googleDrive: {clientId: "fixture-new-google.apps.googleusercontent.com"}
});
assert.deepEqual(readCloudProviderBuildConfig({}), emptyCloudProviderConfig());
assert.equal(hasCloudProviderBuildInput({}), false);
assert.equal(hasCloudProviderBuildInput({FMG_CLOUD_PROVIDER_CONFIG: JSON.stringify(emptyCloudProviderConfig())}), true);
assert.throws(() => readCloudProviderBuildConfig({FMG_CLOUD_PROVIDER_CONFIG: "{"}), /不是有效 JSON/);
assert.throws(() => normalizeCloudProviderConfig([]), /必须是对象/);
assert.throws(() => normalizeCloudProviderConfig({providers: {dropbox: {clientSecret: "never-serialize"}}}), /禁止字段：clientSecret/);
assert.throws(
  () => normalizeCloudProviderConfig({providers: {googleDrive: {clientId: "GOCSPX-fixture-not-a-client-id"}}}),
  /Google client secret/
);

const normalized = normalizeCloudProviderConfig({
  providers: {
    dropbox: {appKey: " fixture ", redirectUri: " https://fixture.test/callback ", ignored: "drop-me"},
    googleDrive: {clientId: " fixture-google.apps.googleusercontent.com ", ignored: "drop-me"}
  },
  ignored: "drop-me"
});
const serialized = serializeCloudProviderConfig(normalized);
assert.match(serialized, /^globalThis\.__FMG_CLOUD_PROVIDER_CONFIG__ = \{/);
assert.doesNotMatch(serialized, /ignored|drop-me/);

const [publicConfig, callbackPage, index, viteConfig, envExample, panel, vercel] = await Promise.all([
  read("app/webgl-generator/public/cloud-provider-config.js"),
  read("app/webgl-generator/public/oauth/dropbox/callback/index.html"),
  read("app/webgl-generator/index.html"),
  read("vite.config.mjs"),
  read(".env.example"),
  read("app/webgl-generator/src/ui/vue/components/CloudStoragePanel.vue"),
  read("vercel.json")
]);
assert.match(publicConfig, /__FMG_CLOUD_PROVIDER_CONFIG__/);
const publicContext = {};
runInNewContext(publicConfig, publicContext);
const officialConfig = normalizeCloudProviderConfig(publicContext.__FMG_CLOUD_PROVIDER_CONFIG__);
assert(officialConfig.providers.dropbox.appKey, "官方 Dropbox app key 不能为空");
assert.equal(officialConfig.providers.dropbox.redirectUri, "https://fmg.mosuzi.top/oauth/dropbox/callback", "官方 Dropbox redirect URI 错误");
assert.match(officialConfig.providers.googleDrive.clientId, /\.apps\.googleusercontent\.com$/, "官方 Google 配置必须是 Client ID");
const localContext = {location: {hostname: "localhost", port: "5410"}};
runInNewContext(publicConfig, localContext);
const localConfig = normalizeCloudProviderConfig(localContext.__FMG_CLOUD_PROVIDER_CONFIG__);
assert.equal(localConfig.providers.dropbox.redirectUri, "http://localhost:5410/oauth/dropbox/callback", "本地开发回调地址错误");
assert.notEqual(localConfig.providers.dropbox.redirectUri, officialConfig.providers.dropbox.redirectUri, "本地与官方回调地址必须分离");
for (const location of [
  {hostname: "localhost", port: "5411"},
  {hostname: "127.0.0.1", port: "5410"}
]) {
  const nonLocalContext = {location};
  runInNewContext(publicConfig, nonLocalContext);
  const nonLocalConfig = normalizeCloudProviderConfig(nonLocalContext.__FMG_CLOUD_PROVIDER_CONFIG__);
  assert.equal(nonLocalConfig.providers.dropbox.redirectUri, officialConfig.providers.dropbox.redirectUri, "非 localhost:5410 不得使用本地回调地址");
}
assert(index.indexOf("__FMG_CLOUD_PROVIDER_CONFIG__") < index.indexOf("./src/main.js"), "Cloud Provider Config 注入点必须先于主模块");
assert.match(viteConfig, /inject-cloud-provider-config/);
assert.match(viteConfig, /serve-dropbox-oauth-callback/);
assert(viteConfig.includes('<script src="./cloud-provider-config.js"></script>'), "Vite 必须注入运行时配置脚本");
assert.match(viteConfig, /emitCloudProviderConfig\(deployEnv\)/);
assert.match(viteConfig, /if \(!hasCloudProviderBuildInput\(env\)\) return/);
assert.match(viteConfig, /envDir:\s*projectRoot/);
for (const name of [
  "FMG_CLOUD_PROVIDER_CONFIG",
  "FMG_DROPBOX_APP_KEY",
  "FMG_DROPBOX_REDIRECT_URI",
  "FMG_GOOGLE_CLIENT_ID",
  "VITE_FMG_DROPBOX_APP_KEY",
  "VITE_FMG_DROPBOX_REDIRECT_URI",
  "VITE_FMG_GOOGLE_CLIENT_ID"
]) assert.match(envExample, new RegExp(`^${name}=$`, "m"), `${name} 示例必须为空`);
assert.match(panel, /providers\.dropbox\.appKey/);
assert.match(panel, /providers\.googleDrive\.clientId/);
assert.match(callbackPage, /fmg-cloud-oauth-callback/);
assert.match(callbackPage, /window\.opener\.postMessage/);
assert.match(callbackPage, /window\.setTimeout\(\(\) => window\.close\(\)/);
assert.doesNotMatch(callbackPage, /access_token|oauth2\/token|cloud-provider-config|src\/main\.js/);
const vercelConfig = JSON.parse(vercel);
assert.deepEqual(vercelConfig.rewrites[0], {source: "/oauth/dropbox/callback", destination: "/oauth/dropbox/callback/index.html"});
assert.equal(vercelConfig.headers[0].source, "/cloud-provider-config.js");
assert.match(vercelConfig.headers[0].headers[0].value, /no-store/);

console.log(JSON.stringify({
  ok: true,
  sources: ["runtime-file", "unified-json", "individual-env", "legacy-vite"],
  serializedFields: 3,
  realValuesPrinted: false
}, null, 2));

function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
