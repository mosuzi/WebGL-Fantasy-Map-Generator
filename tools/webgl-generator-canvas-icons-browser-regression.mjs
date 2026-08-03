#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdirSync, statSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {waitForApiReady} from "./webgl-generator-api-browser-ready.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "source", "Fantasy-Map-Generator");
const screenshotPath = join(rootDir, "docs", "generated", "screenshots", "canvas-icon-atlas.png");
const realMapScreenshotPath = join(rootDir, "docs", "generated", "screenshots", "canvas-icons-real-map.png");
const realMapPngPath = join(rootDir, "docs", "generated", "screenshots", "canvas-icons-real-map-export.png");
const baseUrl = process.argv.find(value => value.startsWith("http")) || "http://127.0.0.1:5411/";
const targetUrl = new URL(baseUrl);
targetUrl.searchParams.set("healthClear", "1");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
const consoleErrors = [];
const pageErrors = [];

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", message => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", error => pageErrors.push(error.message));

  const response = await page.goto(targetUrl.href, {waitUntil: "domcontentloaded"});
  assert.equal(response?.status(), 200, "正式应用入口无法访问");
  await page.waitForSelector("#map-canvas");
  await waitForApiReady(page, 30_000);
  await page.waitForFunction(() => {
    const renderer = window.__webglGeneratorApp?.renderer;
    return renderer?.cityIconItems?.length > 0 && renderer?.markerIconItems?.length > 0 && renderer?.militaryIconItems?.length > 0;
  });

  const realMap = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const summary = window.webglGeneratorApi.info.mapSummary().data;
    return {
      summary,
      modelCounts: {
        cities: renderer.cityIconItems.length,
        markers: renderer.markerIconItems.length,
        military: renderer.militaryIconItems.length
      },
      domCounts: {
        cities: renderer.overlay.querySelectorAll(".city-map-icon").length,
        markers: renderer.overlay.querySelectorAll(".marker-map-icon").length,
        military: renderer.overlay.querySelectorAll(".military-map-icon").length
      },
      markerTypesAligned: renderer.markerIconItems.every(item => item.node.querySelector("svg[data-icon-type]")?.dataset.iconType === item.type),
      militaryUsesRegistrySvg: [...renderer.overlay.querySelectorAll(".military-map-icon-image")].every(image => image.src.startsWith("data:image/svg+xml"))
    };
  });
  assert(realMap.summary.gridCells >= 9_000 && realMap.summary.gridCells <= 11_000, "真实地图不是约 10k grid cells");
  assert.deepEqual(realMap.modelCounts, {
    cities: realMap.summary.cities,
    markers: realMap.summary.markers,
    military: realMap.summary.regiments
  }, "真实地图图标模型分母与地图摘要不一致");
  assert.deepEqual(realMap.domCounts, realMap.modelCounts, "真实地图图标 DOM 与模型分母不一致");
  assert(realMap.markerTypesAligned, "真实地图 Marker DOM 没有按实际 type 消费注册表");
  assert(realMap.militaryUsesRegistrySvg, "真实地图军事 DOM 没有消费注册表 SVG");

  const locatedMarkerId = await page.evaluate(() => {
    const renderer = window.__webglGeneratorApp.renderer;
    const target = renderer.markerIconItems[0];
    if (!target || !renderer.locateObject({kind: "marker", id: target.id}, {minScale: 8})) return null;
    return target.id;
  });
  assert.notEqual(locatedMarkerId, null, "真实 Marker 无法定位");
  await page.waitForFunction(id => window.__webglGeneratorApp.renderer.markerIconItems.find(item => item.id === id)?.visible, locatedMarkerId);
  const markerPick = await page.evaluate(id => {
    const renderer = window.__webglGeneratorApp.renderer;
    const item = renderer.markerIconItems.find(candidate => candidate.id === id);
    const rect = item.node.getBoundingClientRect();
    const picked = renderer.pickClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {expectedId: id, kind: picked?.object?.kind || null, id: picked?.object?.id ?? null, checksum: renderer.map?.metadata?.checksum || null};
  }, locatedMarkerId);
  assert.equal(markerPick.kind, "marker", "真实 Marker 图标拾取没有返回 Marker");
  assert.equal(String(markerPick.id), String(markerPick.expectedId), "真实 Marker 图标拾取返回了错误对象");
  mkdirSync(dirname(realMapScreenshotPath), {recursive: true});
  await page.screenshot({path: realMapScreenshotPath});
  const realMapPng = await page.evaluate(async () => window.webglGeneratorApi.data.exportPNG({
    download: false,
    includeDataUrl: true,
    crop: {mode: "viewport"},
    overlays: {labels: true, cityIcons: true, markers: true, military: true, measurements: false, legend: true, scaleBar: true}
  }));
  assert(realMapPng?.ok, `真实地图 PNG 导出失败：${realMapPng?.error?.message || "unknown"}`);
  assert.match(realMapPng.data.dataUrl, /^data:image\/png;base64,/, "真实地图 PNG 没有返回 data URL");
  writeFileSync(realMapPngPath, Buffer.from(realMapPng.data.dataUrl.split(",")[1], "base64"));
  assert(statSync(realMapPngPath).size > 0, "真实地图 PNG 文件未生成");
  const realMapAfterInteraction = await page.evaluate(() => {
    window.__webglGeneratorApp.renderer.fitToView({quick: true});
    return window.webglGeneratorApi.info.mapSummary().data;
  });
  assert.equal(realMapAfterInteraction.checksum, realMap.summary.checksum, "图标定位与拾取改变了地图 checksum");
  assert.equal(realMapAfterInteraction.mapRevision, realMap.summary.mapRevision, "图标定位与拾取写入了地图 revision");

  const entryViewports = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 760});
    await page.waitForTimeout(180);
    const measurement = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      canvas: Boolean(document.getElementById("map-canvas")),
      errorScreenVisible: Boolean(document.querySelector(".app-error-screen:not([hidden])")),
      healthErrors: (window.__webglGeneratorHealth?.getEvents?.(200) || []).filter(event => event.level === "error").length,
      glError: document.getElementById("map-canvas")?.getContext?.("webgl2")?.getError?.() ?? 0
    }));
    assert(measurement.scrollWidth <= measurement.width, `${width}px 正式入口出现横向溢出`);
    assert(measurement.canvas && !measurement.errorScreenVisible, `${width}px 正式入口异常`);
    assert.equal(measurement.healthErrors, 0, `${width}px 正式入口出现 health error`);
    assert.equal(measurement.glError, 0, `${width}px 正式入口出现 WebGL error`);
    entryViewports.push({requestedWidth: width, ...measurement});
  }

  await page.setViewportSize({width: 1440, height: 900});
  const atlas = await page.evaluate(async () => {
    const registry = await import("/src/renderer/canvas-icon-registry.js");
    const cityVisuals = await import("/src/runtime/city-visuals.js");
    const {
      CANVAS_ICON_COUNTS,
      CITY_BASE_ICON_SVGS,
      CITY_ROLE_BADGE_SVGS,
      cityRoleBadgeSvg,
      MARKER_TYPE_ICONS,
      MILITARY_ICON_KEYS,
      markerIconSvg,
      militaryIconDataUrl,
      resolveMarkerIconVisual
    } = registry;
    const {CITY_ICON_PALETTES} = cityVisuals;

    const cityEntries = Object.entries(CITY_BASE_ICON_SVGS || {});
    const roleEntries = Object.keys(CITY_ROLE_BADGE_SVGS || {}).map(key => [key, cityRoleBadgeSvg?.([key]) || ""]);
    const markerEntries = Object.entries(MARKER_TYPE_ICONS || {});
    const militaryKeys = [...(MILITARY_ICON_KEYS || [])];
    const counts = {
      cityBases: cityEntries.length,
      cityRoles: roleEntries.length,
      markers: markerEntries.length,
      military: militaryKeys.length,
      total: cityEntries.length + roleEntries.length + markerEntries.length + militaryKeys.length
    };

    const style = document.createElement("style");
    style.textContent = `
      html, body { min-width: 0 !important; background: #111916 !important; }
      body.canvas-icon-atlas-mode { margin: 0 !important; overflow-x: hidden !important; overflow-y: auto !important; color: #eadfbd; }
      body.canvas-icon-atlas-mode > :not(#canvas-icon-atlas) { visibility: hidden !important; pointer-events: none !important; }
      body.canvas-icon-atlas-mode > .app-shell { position: fixed !important; inset: 0 !important; }
      #canvas-icon-atlas { position: relative; z-index: 100000; box-sizing: border-box; width: 100%; min-height: 100vh; padding: clamp(18px, 3vw, 42px); background: radial-gradient(circle at 18% -10%, #31473d 0, #18231f 32%, #101714 72%); font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
      .atlas-header { max-width: 1180px; margin: 0 auto 28px; }
      .atlas-header h1 { margin: 0 0 10px; color: #fff2c9; font: 800 clamp(26px, 4vw, 42px)/1.12 Georgia, "Microsoft YaHei", serif; letter-spacing: .04em; }
      .atlas-header p { margin: 0; color: #b9c8bb; font-size: 14px; line-height: 1.7; }
      .atlas-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .atlas-stat { padding: 6px 10px; border: 1px solid #52655a; border-radius: 999px; background: rgba(9, 15, 13, .54); color: #d8cda9; font: 700 12px/1.2 ui-monospace, monospace; }
      .atlas-section { max-width: 1180px; margin: 0 auto 30px; padding: 20px; border: 1px solid rgba(172, 157, 112, .28); border-radius: 16px; background: rgba(12, 19, 16, .72); box-shadow: 0 18px 50px rgba(0, 0, 0, .2); }
      .atlas-section h2 { margin: 0 0 16px; color: #e5d6aa; font-size: 18px; letter-spacing: .08em; }
      .atlas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 118px), 1fr)); gap: 10px; }
      .atlas-grid--markers { grid-template-columns: repeat(auto-fit, minmax(min(100%, 104px), 1fr)); }
      .atlas-card { min-width: 0; min-height: 104px; display: grid; place-items: center; align-content: center; gap: 10px; padding: 12px 8px 9px; box-sizing: border-box; overflow: hidden; border: 1px solid rgba(129, 151, 135, .25); border-radius: 11px; background: linear-gradient(145deg, rgba(41, 56, 48, .86), rgba(19, 28, 24, .88)); }
      .atlas-card code { max-width: 100%; color: #c9d4c8; font: 600 10px/1.3 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; text-align: center; }
      .atlas-city, .atlas-marker { display: grid; place-items: center; width: 56px; height: 52px; }
      .atlas-city svg { width: 54px; height: 42px; overflow: visible; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .42)); }
      .atlas-marker svg { width: 40px; height: 46px; overflow: visible; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .42)); }
      .atlas-military-stage { display: grid; place-items: center; min-width: 72px; min-height: 30px; }
      .atlas-military-stage .military-map-icon { position: relative; left: auto; top: auto; opacity: 1; transform: none; visibility: visible; will-change: auto; }
      @media (max-width: 420px) {
        #canvas-icon-atlas { padding: 14px 10px; }
        .atlas-section { padding: 14px 10px; border-radius: 12px; }
        .atlas-grid, .atlas-grid--markers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `;
    document.head.append(style);
    document.body.classList.add("canvas-icon-atlas-mode");

    const root = document.createElement("main");
    root.id = "canvas-icon-atlas";
    root.innerHTML = `<header class="atlas-header">
      <h1>画布语义图标图鉴</h1>
      <p>同一制图语言下冻结城镇剪影、角色徽记、Marker / 资源点与军事资产；本页由正式注册表动态生成。</p>
      <div class="atlas-stats">
        <span class="atlas-stat">城镇 ${counts.cityBases} + ${counts.cityRoles}</span>
        <span class="atlas-stat">Marker ${counts.markers}</span>
        <span class="atlas-stat">军事 ${counts.military}</span>
        <span class="atlas-stat">总计 ${counts.total}</span>
      </div>
    </header>`;
    document.body.append(root);

    const appendSection = (title, className = "") => {
      const section = document.createElement("section");
      section.className = "atlas-section";
      section.innerHTML = `<h2>${title}</h2><div class="atlas-grid ${className}"></div>`;
      root.append(section);
      return section.querySelector(".atlas-grid");
    };
    const appendCard = (grid, key, content, iconClass) => {
      const card = document.createElement("article");
      card.className = "atlas-card";
      card.dataset.iconKey = key;
      card.innerHTML = `<div class="${iconClass}">${content}</div><code>${key}</code>`;
      grid.append(card);
      return card;
    };
    const appendExtraCard = (grid, key, content, iconClass) => {
      const card = document.createElement("article");
      card.className = "atlas-card";
      card.dataset.atlasExtra = key;
      card.innerHTML = `<div class="${iconClass}">${content}</div><code>${key}</code>`;
      grid.append(card);
      return card;
    };
    const cityGrid = appendSection("城镇基础剪影与角色组合");
    for (const [key, svg] of cityEntries) appendCard(cityGrid, key, String(svg), "atlas-city");
    const roleBase = String(CITY_BASE_ICON_SVGS?.town || CITY_BASE_ICON_SVGS?.city || cityEntries[0]?.[1] || "");
    for (const [key, badge] of roleEntries) {
      const composite = roleBase.replace("</svg>", `${String(badge)}</svg>`);
      appendCard(cityGrid, `role:${key}`, composite, "atlas-city");
    }
    const combinedRoles = roleBase.replace("</svg>", `${cityRoleBadgeSvg(["capital", "provincial", "port"])}</svg>`);
    appendExtraCard(cityGrid, "roles:capital+provincial+port", combinedRoles, "atlas-city");

    const cultureGrid = appendSection("城镇文化风格（附加展示）");
    const culturePaletteKeys = {
      default: "town",
      maritime: "port",
      waterway: "waterway",
      nomadic: "nomadic",
      highland: "highland",
      woodland: "woodland"
    };
    for (const [cultureStyle, paletteKey] of Object.entries(culturePaletteKeys)) {
      const card = appendExtraCard(cultureGrid, `culture:${cultureStyle}`, CITY_BASE_ICON_SVGS.town, `atlas-city city-map-icon--style-${cultureStyle}`);
      const palette = CITY_ICON_PALETTES[paletteKey];
      const icon = card.querySelector(".atlas-city");
      icon.style.setProperty("--city-wall", palette.wall);
      icon.style.setProperty("--city-roof", palette.roof);
      icon.style.setProperty("--city-stroke", palette.stroke);
      icon.style.setProperty("--city-accent", palette.accent);
      icon.style.setProperty("--city-water", palette.water);
    }

    const markerGrid = appendSection("Marker 与资源点", "atlas-grid--markers");
    const markerSvgs = [];
    for (const [type, definition] of markerEntries) {
      const spec = typeof definition === "string" ? {symbol: definition} : {...definition};
      const resolvedVisual = resolveMarkerIconVisual?.(type, {}) || spec;
      const item = {type, category: resolvedVisual.category || spec.category || "mystery", visual: resolvedVisual};
      let svg = "";
      for (const render of [() => markerIconSvg(item), () => markerIconSvg(type, spec), () => markerIconSvg(type)]) {
        try {
          svg = render();
          if (typeof svg === "string" && svg.includes("<svg")) break;
        } catch {
          svg = "";
        }
      }
      markerSvgs.push(svg);
      const card = appendCard(markerGrid, type, svg, "atlas-marker");
      card.dataset.category = item.category;
      const categoryStyles = {
        natural: ["#587d53", "#263f2c", "#f2edcf"],
        water: ["#397f9f", "#173b52", "#effaff"],
        resource: ["#a77835", "#533817", "#fff1bf"],
        infrastructure: ["#687985", "#2d3b44", "#f2f0db"],
        trade: ["#9a6237", "#4c2c1d", "#fff0c5"],
        hazard: ["#a74639", "#521e1b", "#fff0d7"],
        culture: ["#735e9f", "#36284f", "#f6edff"],
        settlement: ["#8b6650", "#493127", "#fff0d0"],
        mystery: ["#6257a8", "#2d2856", "#f6efff"]
      }[item.category] || ["#6257a8", "#2d2856", "#f6efff"];
      const icon = card.querySelector(".atlas-marker");
      icon.style.setProperty("--marker-fill", categoryStyles[0]);
      icon.style.setProperty("--marker-stroke", categoryStyles[1]);
      icon.style.setProperty("--marker-symbol", categoryStyles[2]);
    }

    const militaryGrid = appendSection("军事资产");
    for (const key of militaryKeys) {
      const url = militaryIconDataUrl(key);
      const classes = ["military-map-icon", "visible", `military-map-icon--${key}`];
      if (key.startsWith("fleet-")) classes.push("military-map-icon--fleet");
      const content = `<span class="${classes.join(" ")}"><span class="military-map-icon-symbol"><img class="military-map-icon-image" src="${url}" alt="${key}"></span><span class="military-map-icon-count">12k</span></span>`;
      appendCard(militaryGrid, key, content, "atlas-military-stage");
    }

    await Promise.all([...root.querySelectorAll("img")].map(image => image.complete ? Promise.resolve() : new Promise((done, fail) => {
      image.addEventListener("load", done, {once: true});
      image.addEventListener("error", fail, {once: true});
    })));
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));

    const svgAudit = [...root.querySelectorAll("svg")].map(svg => {
      const viewBox = svg.viewBox.baseVal;
      const bbox = svg.getBBox();
      const drawableCount = svg.querySelectorAll("path,circle,ellipse,rect,line,polyline,polygon,use").length;
      const source = svg.outerHTML;
      return {
        key: svg.closest("[data-icon-key]")?.dataset.iconKey || "unknown",
        drawableCount,
        width: bbox.width,
        height: bbox.height,
        withinViewBox: bbox.x >= viewBox.x - 1 && bbox.y >= viewBox.y - 1 && bbox.x + bbox.width <= viewBox.x + viewBox.width + 1 && bbox.y + bbox.height <= viewBox.y + viewBox.height + 1,
        forbiddenContent: /<(?:text|image|foreignObject)\b|https?:\/\//i.test(source)
      };
    });
    const imageAudit = [...root.querySelectorAll("img")].map(image => ({src: image.src, width: image.naturalWidth, height: image.naturalHeight}));
    const iconCards = [...root.querySelectorAll("[data-icon-key]")].map(card => ({
      key: card.dataset.iconKey,
      width: card.getBoundingClientRect().width,
      height: card.getBoundingClientRect().height,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth
    }));
    const extraCards = [...root.querySelectorAll("[data-atlas-extra]")].map(card => ({
      key: card.dataset.atlasExtra,
      width: card.getBoundingClientRect().width,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth
    }));
    const normalizedFingerprint = svg => String(svg)
      .replace(/\sdata-icon-(?:type|category|variant)="[^"]*"/g, "")
      .replace(/\s+/g, " ")
      .replace(/>\s+</g, "><")
      .trim();
    return {
      declaredCounts: CANVAS_ICON_COUNTS,
      counts,
      markerFingerprints: new Set(markerSvgs.map(normalizedFingerprint)).size,
      cityFingerprints: new Set(cityEntries.map(([, svg]) => normalizedFingerprint(svg))).size,
      svgAudit,
      imageAudit,
      iconCards,
      extraCards
    };
  });

  assert.deepEqual(atlas.counts, {cityBases: 9, cityRoles: 3, markers: 58, military: 10, total: 80});
  assert.equal(atlas.cityFingerprints, 9, "城镇基础剪影存在重复指纹");
  assert.equal(atlas.markerFingerprints, 58, "Marker 注册类型存在重复或空图指纹");
  assert.equal(atlas.svgAudit.length, 77, "稳定图标与附加展示 SVG 图鉴数量错误");
  assert(atlas.svgAudit.every(icon => icon.drawableCount > 0 && icon.width > 0 && icon.height > 0), "图鉴存在空 SVG");
  assert(atlas.svgAudit.every(icon => icon.withinViewBox), `SVG 图形越出 viewBox：${atlas.svgAudit.filter(icon => !icon.withinViewBox).map(icon => icon.key).join(", ")}`);
  assert(atlas.svgAudit.every(icon => !icon.forbiddenContent), "SVG 图标包含文字、外部图像或远程资源");
  assert.equal(atlas.imageAudit.length, 10, "军事图标数量错误");
  assert(atlas.imageAudit.every(icon => icon.width > 0 && icon.height > 0), "存在无法加载的军事图标");
  assert(atlas.iconCards.every(card => card.scrollWidth <= card.clientWidth), "图鉴卡片存在横向裁切");
  assert.deepEqual(atlas.extraCards.map(card => card.key), [
    "roles:capital+provincial+port",
    "culture:default",
    "culture:maritime",
    "culture:waterway",
    "culture:nomadic",
    "culture:highland",
    "culture:woodland"
  ], "角色组合或六种文化风格附加展示不完整");
  assert(atlas.extraCards.every(card => card.scrollWidth <= card.clientWidth), "附加展示卡片存在横向裁切");

  const atlasViewports = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 760});
    await page.waitForTimeout(120);
    const measurement = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll("#canvas-icon-atlas [data-icon-key]").length,
      extras: document.querySelectorAll("#canvas-icon-atlas [data-atlas-extra]").length,
      clippedCards: [...document.querySelectorAll("#canvas-icon-atlas .atlas-card")].filter(card => card.scrollWidth > card.clientWidth).length
    }));
    assert(measurement.scrollWidth <= measurement.width, `${width}px 图鉴出现横向溢出`);
    assert.equal(measurement.cards, 80, `${width}px 图鉴卡片数量错误`);
    assert.equal(measurement.extras, 7, `${width}px 附加展示卡片数量错误`);
    assert.equal(measurement.clippedCards, 0, `${width}px 图鉴卡片出现裁切`);
    atlasViewports.push({requestedWidth: width, ...measurement});
  }

  await page.setViewportSize({width: 1440, height: 900});
  mkdirSync(dirname(screenshotPath), {recursive: true});
  await page.screenshot({path: screenshotPath, fullPage: true});
  await page.waitForTimeout(120);
  assert.deepEqual(consoleErrors, [], `浏览器 console error：${consoleErrors.join(" | ")}`);
  assert.deepEqual(pageErrors, [], `浏览器 page error：${pageErrors.join(" | ")}`);
  assert(statSync(screenshotPath).size > 0, "图鉴截图未生成");

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    screenshotPath,
    realMapScreenshotPath,
    realMapPngPath,
    realMap: {
      gridCells: realMap.summary.gridCells,
      packCells: realMap.summary.packCells,
      modelCounts: realMap.modelCounts,
      domCounts: realMap.domCounts,
      markerPick,
      png: {width: realMapPng.data.width, height: realMapPng.data.height, bytes: statSync(realMapPngPath).size},
      checksumUnchanged: realMapAfterInteraction.checksum === realMap.summary.checksum,
      revisionUnchanged: realMapAfterInteraction.mapRevision === realMap.summary.mapRevision
    },
    counts: atlas.counts,
    declaredCounts: atlas.declaredCounts,
    fingerprints: {city: atlas.cityFingerprints, markers: atlas.markerFingerprints},
    entryViewports,
    atlasViewports,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
