export const MARKER_CATEGORY_ICONS = Object.freeze({
  natural: Object.freeze({palette: "natural", plate: "round"}),
  water: Object.freeze({palette: "water", plate: "drop"}),
  resource: Object.freeze({palette: "resource", plate: "hex"}),
  infrastructure: Object.freeze({palette: "infrastructure", plate: "square"}),
  trade: Object.freeze({palette: "trade", plate: "diamond"}),
  hazard: Object.freeze({palette: "hazard", plate: "triangle"}),
  culture: Object.freeze({palette: "culture", plate: "arch"}),
  settlement: Object.freeze({palette: "settlement", plate: "shield"}),
  mystery: Object.freeze({palette: "mystery", plate: "star"})
});

const MARKER_PLATES = Object.freeze({
  round: '<circle class="marker-icon-plate" cx="14" cy="13.6" r="8.7"/>',
  drop: '<path class="marker-icon-plate" d="M14 4.7c4.2 4.7 7.1 8.2 7.1 11.2a7.1 7.1 0 0 1-14.2 0C6.9 12.9 9.8 9.4 14 4.7z"/>',
  hex: '<path class="marker-icon-plate" d="m14 4.6 7.4 4.3v8.7L14 21.9l-7.4-4.3V8.9z"/>',
  square: '<rect class="marker-icon-plate" x="6.3" y="5.9" width="15.4" height="15.4" rx="2.3"/>',
  diamond: '<path class="marker-icon-plate" d="m14 4.3 9.1 9.3-9.1 9.3-9.1-9.3z"/>',
  triangle: '<path class="marker-icon-plate" d="m14 4.6 9.2 16.2H4.8z"/>',
  arch: '<path class="marker-icon-plate" d="M6.2 21.6V13.8a7.8 7.8 0 0 1 15.6 0v7.8z"/>',
  shield: '<path class="marker-icon-plate" d="M5.9 6.2 14 4.4l8.1 1.8v7.2c0 4.5-2.7 7.5-8.1 9.7-5.4-2.2-8.1-5.2-8.1-9.7z"/>',
  star: '<path class="marker-icon-plate" d="m14 4.1 2.8 4.4 5.2-.7-.7 5.2 4.4 2.8-4.4 2.8.7 5.2-5.2-.7-2.8 4.4-2.8-4.4-5.2.7.7-5.2-4.4-2.8 4.4-2.8-.7-5.2 5.2.7z" transform="translate(0 -2.2) scale(1 .86)"/>'
});

export const LEGACY_MARKER_SYMBOLS = Object.freeze({
  mine: '<path d="M9.2 17.7 18 8.9"/><path d="M16.2 7.8c1.6.1 2.7.5 3.6 1.4-.8.2-1.6.6-2.5 1.4"/><path d="m9 9 10 9"/>',
  salt: '<path class="fill" d="M11 10.1h2.7v2.7H11zM15.1 12.4h2.3v2.3h-2.3zM10.2 15.1h2.2v2.2h-2.2z"/><path d="M9.2 18.4h9.6"/>',
  life: '<path d="M10.1 17.8c5.7-.6 8.1-4.4 8.5-8.2-4.5.1-8.2 2.2-8.6 7.6"/><path d="M10.3 17.6c1.4-2.3 3.2-4.1 5.5-5.4"/><path d="M8.7 10.4l.9 1.4 1.5.6-1.5.6-.9 1.4-.7-1.4-1.5-.6 1.5-.6z"/>',
  gem: '<path class="fill" d="m14 7.4 6.5 4.7-2.7 7.5h-7.6l-2.7-7.5z"/><path d="M7.7 12.1h12.6M11.2 8.3l2.8 11.3 2.8-11.3"/>',
  spring: '<path d="M9.1 11.2c1.7-1.4 3.4-1.4 5 0 1.6 1.3 3.2 1.3 4.8 0"/><path d="M9.1 14.6c1.7-1.4 3.4-1.4 5 0 1.6 1.3 3.2 1.3 4.8 0"/><path d="M11.1 18.1h5.8"/>',
  drop: '<path class="fill" d="M14 7.7c3.2 3.8 4.8 6.4 4.8 8.1a4.8 4.8 0 0 1-9.6 0c0-1.7 1.6-4.3 4.8-8.1z"/>',
  volcano: '<path class="fill" d="M7.8 19.2 12.4 8.6h3.2l4.6 10.6z"/><path d="m12 10.4 2 2.2 2-2.2M10.2 19.2h7.6"/>',
  bridge: '<path d="M7.7 18.7h12.6M9 18.6c.7-4.2 2.3-6.3 5-6.3s4.3 2.1 5 6.3M10.2 14.2h7.6"/>',
  inn: '<path class="fill" d="M9.4 10.4h9.2v8H9.4z"/><path d="M8.2 11.1 14 7.5l5.8 3.6M12 18.3v-4h4v4"/>',
  tower: '<path class="fill" d="M10.4 9.2h7.2v10h-7.2z"/><path d="M10 9.1V7.7h1.8v1.4h4.4V7.7H18v1.4M12.4 19.1v-4h3.2v4"/>',
  ruin: '<path d="M8.7 18.8h10.6M10 10.1h8M11.1 10.2v8.2M14 10.2v8.2M16.9 10.2v8.2"/><path class="fill" d="m9.5 8.1 4.5-1.5 4.5 1.5z"/>',
  book: '<path d="M8.5 9.1h4.7c.7 0 1.1.4 1.1 1.1v8.1c0-.7-.5-1.1-1.2-1.1H8.5z"/><path d="M19.5 9.1h-4.7c-.7 0-1.1.4-1.1 1.1v8.1c0-.7.5-1.1 1.2-1.1h4.6z"/>',
  market: '<path d="M8.5 11.2h11M9.6 11.4l1-3h6.8l1 3"/><path class="fill" d="M10 13.2h8v5.7h-8z"/><path d="M12.8 18.8v-3.1h2.4v3.1"/>',
  danger: '<path class="fill" d="m14 7.6 6 11H8z"/><path d="M14 11.3v3.6M14 17.4h.1"/>',
  star: '<path class="fill" d="m14 7.6 1.7 4 4.2.4-3.2 2.8.9 4.2-3.6-2.2-3.6 2.2.9-4.2L8.1 12l4.2-.4z"/>',
  marker: '<circle class="fill" cx="14" cy="13.8" r="4.5"/><path d="M14 9.3v9"/>'
});

export const MARKER_SYMBOL_OPTIONS = Object.freeze([
  ["marker", "通用"], ["mine", "矿山"], ["salt", "盐晶"], ["life", "生物"],
  ["gem", "宝石"], ["spring", "温泉"], ["drop", "水源"], ["volcano", "火山"],
  ["bridge", "桥梁"], ["inn", "驿馆"], ["tower", "塔楼"], ["ruin", "遗迹"],
  ["book", "书卷"], ["market", "商贸"], ["danger", "危险"], ["star", "奇观"]
].map(([value, label]) => Object.freeze({value, label})));

const TYPE_ICON_ROWS = [
  ["volcanoes", "natural", '<path class="fill" d="M7.8 19.1 12 9.1h4l4.2 10z"/><path d="m11.4 10.8 2.6 2.3 2.6-2.3M9.4 19.1h9.2"/>'],
  ["hot-springs", "resource", '<path d="M9.4 17.8c1.5-1 3-1 4.5 0s3 1 4.5 0M10.6 14.4c-.9-1.1-.7-2.1.5-3.1s1.4-2 .5-3M15.5 14.4c-.9-1.1-.7-2.1.5-3.1s1.4-2 .5-3"/>'],
  ["water-sources", "water", '<path class="fill" d="M14 7.4c3.2 3.7 4.8 6.4 4.8 8.1a4.8 4.8 0 0 1-9.6 0c0-1.7 1.6-4.4 4.8-8.1z"/><path d="M11.7 16.2c.3 1.1 1.1 1.7 2.3 1.8"/>'],
  ["mines", "resource", LEGACY_MARKER_SYMBOLS.mine],
  ["salt-lakes", "resource", '<path class="fill" d="m14 7.4 2.1 3.5 4 .1-1.9 3.5 1.9 3.5-4 .1-2.1 3.5-2.1-3.5-4-.1 1.9-3.5L7.9 11l4-.1z"/><path d="M9.4 14.5h9.2"/>'],
  ["rare-biota", "resource", '<path d="M10 18.7c5.8-.6 8.3-4.4 8.5-9-4.8.2-8.1 2.6-8.5 8.4M10.4 18.2l5.4-5.4"/><circle class="fill" cx="9" cy="10.4" r="1.5"/>'],
  ["gem-fields", "resource", LEGACY_MARKER_SYMBOLS.gem],
  ["quarries", "resource", '<path class="fill" d="m8.2 17.8 2.5-7.3 5-2.1 4.1 5.2-2.1 5.2z"/><path d="m10.7 10.5 3.1 3.2 1.9-5.3M8.8 17.7l5-4"/>'],
  ["clay-pits", "resource", '<ellipse class="fill" cx="14" cy="16.7" rx="6.5" ry="2.6"/><path d="M8.8 16.4c1.9-2.7 2.8-5.4 2.6-8.1h5.2c-.2 2.7.7 5.4 2.6 8.1M11.4 11.2h5.2"/>'],
  ["coalfields", "resource", '<path class="fill" d="m8.2 15.2 2.7-5.8 5.6-1.1 3.4 4.8-2.1 5.8-6.2.3z"/><path d="m10.1 13.2 3.6 2.2 3.8-4"/>'],
  ["sulfur-springs", "resource", '<path d="M8.6 18.4h10.8M10 15.5c1.3-.9 2.6-.9 4 0s2.7.9 4 0M11.2 13c-1.1-1.3-.7-2.4.8-3.4M16 13c-1.1-1.3-.7-2.4.8-3.4"/><circle class="fill" cx="18.5" cy="9" r="1.2"/>'],
  ["nitrate-caves", "resource", '<path class="fill" d="M7.6 18.8 10 10.5l4-3.1 4 3.1 2.4 8.3z"/><path d="M10.2 18.8c.5-3.8 1.8-5.7 3.8-5.7s3.3 1.9 3.8 5.7M11.4 10.7h5.2"/>'],
  ["amber-coasts", "resource", '<path class="fill" d="m14 7.6 5.2 3v6L14 19.7l-5.2-3.1v-6z"/><path d="m10 18.4-2.1 1.2m10.1-1.2 2.1 1.2M11.2 10.8l5.7 5.7"/>'],
  ["pearl-shoals", "resource", '<path d="M8.2 17.6c1.4-4.8 3.3-7.2 5.8-7.2s4.4 2.4 5.8 7.2c-3.9 2-7.7 2-11.6 0z"/><circle class="fill" cx="14" cy="15.4" r="2.7"/>'],
  ["coral-reefs", "resource", '<path d="M14 19.2v-9.1m0 4.2-3.7-3.2m3.7 5.4 4.2-3.6m-7.9 6.3v-4m7.9 4v-3.7"/><circle class="fill" cx="10.3" cy="10.8" r="1.1"/><circle class="fill" cx="18.2" cy="12.6" r="1.1"/>'],
  ["fisheries", "resource", '<path class="fill" d="M8.1 14c3.2-3.5 6.7-4.2 10.4-2l2.1-2v8l-2.1-2c-3.7 2.2-7.2 1.5-10.4-2z"/><circle cx="11.6" cy="13.2" r=".6"/>'],
  ["good-harbors", "resource", '<path d="M14 8.1v10.8M10.5 11.2h7M8.5 15.8c.7 2.1 2.5 3.2 5.5 3.2s4.8-1.1 5.5-3.2M10.7 17.4 8.5 15.8m8.8 1.6 2.2-1.6"/><circle class="fill" cx="14" cy="8.3" r="1.4"/>'],
  ["lumber-camps", "resource", '<path class="fill" d="m14 7.4-5.3 7.2h3.1l-4.1 4.6h12.6l-4.1-4.6h3.1z"/><path d="M14 13.1v7.2M9.4 10.5l9.2 8.4"/>'],
  ["resin-forests", "resource", '<path d="m14 7.3-5.7 7.4h3.2l-3.8 4.4h12.6l-3.8-4.4h3.2z"/><path class="fill" d="M14 13c2 2.3 3 3.8 3 4.7a3 3 0 0 1-6 0c0-.9 1-2.4 3-4.7z"/>'],
  ["herb-valleys", "resource", '<path d="M14 19.8V9.1m0 5.2c-2.8 0-4.5-1.3-5.2-3.9 3.1-.4 4.8.9 5.2 3.9zm0 2.6c2.8 0 4.5-1.3 5.2-3.9-3.1-.4-4.8.9-5.2 3.9"/>'],
  ["dye-fields", "resource", '<circle class="fill" cx="14" cy="13.8" r="2.3"/><path d="M14 7.3v4.2m0 4.6v4.2m-6.5-6.5h4.2m4.6 0h4.2m-10.9-4.6 3 3m3.8 3.8 3 3m0-9.8-3 3M12.6 16l-3 3"/>'],
  ["spice-groves", "resource", '<path d="M10.2 19c4.8-1 7.4-4.5 7.6-10.3-5.5.3-8.1 3.7-7.6 10.3zm.4-.5 5.4-6.1"/><circle class="fill" cx="18.6" cy="17.4" r="1.4"/><circle class="fill" cx="8.5" cy="11.2" r="1.1"/>'],
  ["tea-hills", "resource", '<path d="M8.2 18.8c1.7-2.6 3.6-4 5.8-4s4.1 1.4 5.8 4M9.8 15.5c.7-4.5 3.4-7 8.1-7.5-.2 4.3-2.9 6.8-8.1 7.5zM10.2 15.2l5.4-4.5"/>'],
  ["silk-groves", "resource", '<ellipse class="fill" cx="14" cy="14" rx="3.8" ry="6.1"/><path d="M10.5 11.8c-2.3-1.9-3.8-1.4-4.5 1.5 1.9 1.4 3.5 1.4 4.8.1m6.7-1.6c2.3-1.9 3.8-1.4 4.5 1.5-1.9 1.4-3.5 1.4-4.8.1M14 8v12"/>'],
  ["horse-pastures", "resource", '<path class="fill" d="M9.4 18.9v-7.4l3.2-3.2 4.8 1.5 1.7 4.1-3.7.8-1.2 4.2z"/><path d="M12.7 8.5 11 6.9m5.8 3.1 2-1.6M10 14.5h5.4"/>'],
  ["salt-meadows", "resource", '<path d="M8.1 18.9c1.2-2 3.2-3 5.9-3s4.7 1 5.9 3M10 15.7l-1.3-5.1m4.4 5.3-.5-7m4.3 7 .7-5.5"/><path class="fill" d="m18.4 8.3 1 1.7 2 .1-1 1.7 1 1.7-2 .1-1 1.7-1-1.7-2-.1 1-1.7-1-1.7 2-.1z"/>'],
  ["oases", "resource", '<path d="M8.2 19c1.6-2.1 3.5-3.1 5.8-3.1s4.2 1 5.8 3M14 16v-6.5m0 2.4c-2.8 0-4.5-1.1-5.1-3.4 2.7-.4 4.4.7 5.1 3.4zm0 1.2c2.7 0 4.4-1.1 5-3.4-2.7-.4-4.4.7-5 3.4"/>'],
  ["sacred-springs", "resource", '<path class="fill" d="M14 9c2.7 3.2 4.1 5.3 4.1 6.6a4.1 4.1 0 0 1-8.2 0c0-1.3 1.4-3.4 4.1-6.6z"/><path d="M14 6.7v2m-5.7 1 1.8 1m9.6-1-1.8 1M8.2 19.4h11.6"/>'],
  ["bridges", "infrastructure", LEGACY_MARKER_SYMBOLS.bridge],
  ["inns", "trade", LEGACY_MARKER_SYMBOLS.inn],
  ["lighthouses", "infrastructure", '<path class="fill" d="M11.3 19.1h5.4l-1-8.4h-3.4z"/><path d="m10.4 10.7 3.6-3.1 3.6 3.1M8.2 8.6l2.5 1m9.1-1-2.5 1M9.5 19.1h9M14 7.5V5.9"/>'],
  ["waterfalls", "natural", '<path d="M9.2 8.3h9.6M10.4 8.5c0 4.8 1.2 7.3 3.6 7.3s3.6-2.5 3.6-7.3M9 19c1.7-1.2 3.3-1.2 5 0s3.3 1.2 5 0"/><path class="fill" d="m14 12.4 2 3.4-2 3.4-2-3.4z"/>'],
  ["battlefields", "hazard", '<path d="m9 8.6 10 10m0-10-10 10M8.2 7.8l2.2.4-.2 2.2m9.6-2.6-2.2.4.2 2.2M10 17.6l-1.8 2.2m9.8-2.2 1.8 2.2"/>'],
  ["dungeons", "mystery", '<path class="fill" d="M9 19.2v-7.6l5-4 5 4v7.6z"/><path d="M11.4 19.2v-4.8h5.2v4.8M12.4 11.7h3.2M14 14.4v4.8"/>'],
  ["lake-monsters", "hazard", '<path d="M8.4 18.5c1.8-4.3 3.7-6.5 5.7-6.5 1.2 0 2.4.8 3.5 2.3M10.3 13.1c-1-2.7-.5-4.5 1.5-5.4 2.1 1.5 2.8 3.4 2.1 5.7M8 19.2c1.8-.9 3.6-.9 5.4 0s3.6.9 5.4 0"/><circle class="fill" cx="12" cy="9.9" r=".7"/>'],
  ["sea-monsters", "hazard", '<path d="M14 8.1v7.5m-2.2-5.9c-3.6.3-5.2 2.3-4.8 6m9.2-6c3.6.3 5.2 2.3 4.8 6m-9.7-1.9c-2.7 1.1-3.4 3.1-2.1 6m7.5-6c2.7 1.1 3.4 3.1 2.1 6"/><ellipse class="fill" cx="14" cy="10.2" rx="3.2" ry="4"/>'],
  ["hill-monsters", "hazard", '<path class="fill" d="m9.1 18.9 1.2-7.9 3.7-3.4 3.7 3.4 1.2 7.9z"/><path d="m10.5 11-2.1-2.2m9.1 2.2 2.1-2.2M11.5 14.2h.1m4.8 0h.1m-4.6 2.3c1.4 1 2.8 1 4.2 0"/>'],
  ["sacred-forests", "culture", '<path class="fill" d="m14 6.9-6 8h3.2l-4.1 4.4h13.8l-4.1-4.4H20z"/><path d="M14 12v8.2M10.2 8.1l1.4 1.4m6.2-1.4-1.4 1.4"/>'],
  ["sacred-pineries", "culture", '<path class="fill" d="m14 6.4-4.6 6h2.2L8 17h3.2l-2.5 3.1h10.6L16.8 17H20l-3.6-4.6h2.2z"/><path d="M14 12.2v8.4"/>'],
  ["sacred-palm-groves", "culture", '<path d="M14 19.8v-8.6m0 .7c-3.4-.1-5.5-1.6-6.2-4.5 3.3-.4 5.4 1.1 6.2 4.5zm0 0c3.4-.1 5.5-1.6 6.2-4.5-3.3-.4-5.4 1.1-6.2 4.5zm0-1.1c-1.7-2.4-1.7-4.2 0-5.5 1.7 1.3 1.7 3.1 0 5.5"/>'],
  ["brigands", "hazard", '<path class="fill" d="M9 11.1c3.3-2.5 6.7-2.5 10 0l-1.4 8H10.4z"/><path d="M10.3 11.2 9 7.7l3.8 2m4.9 1.5L19 7.7l-3.8 2M11.7 14.5h.1m4.4 0h.1m-4.3 2.6h4"/>'],
  ["pirates", "hazard", '<path d="M8.2 19h11.6M14 18.8V7.5m0 .8 5.2 2.5-5.2 2.5"/><path class="fill" d="M9.2 16.3h9.6l-2.1 2.7h-5.4z"/><circle cx="16.1" cy="10.8" r=".7"/>'],
  ["statues", "culture", '<path class="fill" d="M11.1 18.9h5.8l-.8-5.2h-4.2z"/><circle class="fill" cx="14" cy="9.9" r="2.5"/><path d="M9.2 19h9.6M12 13.5l-2-2m6 2 2-2"/>'],
  ["ruins", "culture", '<path d="M8.2 19h11.6M9.5 10h9M10.7 10.2v8.5M14 10.2v8.5M17.3 10.2v8.5"/><path class="fill" d="m9 8 5-1.7L19 8z"/><path d="m12.9 10 1.3 2-1.1 2"/>'],
  ["libraries", "culture", LEGACY_MARKER_SYMBOLS.book],
  ["circuses", "settlement", '<path class="fill" d="M7.9 19 10 10.1h8L20.1 19z"/><path d="m10 10.2 4-3.2 4 3.2M14 7v12M8.8 15.5h10.4"/>'],
  ["jousts", "settlement", '<path d="M9 19.1 18.7 8.4M16.6 8.2l2.3.2-.2 2.3M10.7 14.8l2.8 2.8"/><path class="fill" d="m8.6 16.9 2.5 2.5-2.9.6-1.4-1.4z"/>'],
  ["fairs", "trade", '<path d="M8.1 12h11.8M9.3 12l1.2-3.5h7l1.2 3.5M10 14v5m4-5v5m4-5v5M8.8 19h10.4"/><path class="fill" d="M9.4 12h3v2.3h-3zm3 0h3.2v2.3h-3.2zm3.2 0h3v2.3h-3z"/>'],
  ["canoes", "infrastructure", '<path class="fill" d="M7.7 15.7c4.2 2 8.4 2 12.6 0-1 3-3.1 4.4-6.3 4.4s-5.3-1.4-6.3-4.4z"/><path d="m9.1 10.1 9.8 8.3m-1.4-9.7-7 11.1"/>'],
  ["migration", "natural", '<path d="M7.6 13.4h11.6m-3.1-3.2 3.2 3.2-3.2 3.2M8.7 18.9h8.8"/><circle class="fill" cx="9.4" cy="9.3" r="1.5"/>'],
  ["dances", "culture", '<circle class="fill" cx="14" cy="8.8" r="1.7"/><path d="M14 10.7v4m0-2.2-3.7 2m3.7-2 3.7 2m-3.7.2-3 5m3-5 3 5"/>'],
  ["mirage", "mystery", '<path d="M7.7 18.4c1.6-1.2 3.2-1.2 4.8 0s3.2 1.2 4.8 0 3.2-1.2 4.8 0M9.1 14.5c1.3-.9 2.6-.9 3.9 0s2.6.9 3.9 0 2.6-.9 3.9 0"/><path class="fill" d="m14 7.4 1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5z"/>'],
  ["caves", "natural", '<path class="fill" d="M7.2 19.2c.8-7.4 3.1-11.1 6.8-11.1s6 3.7 6.8 11.1z"/><path d="M10.4 19.2c.4-4 1.6-6 3.6-6s3.2 2 3.6 6M9.4 10.8 7.8 8.9m10.8 1.9 1.6-1.9"/>'],
  ["portals", "mystery", '<ellipse cx="14" cy="13.8" rx="5.5" ry="7"/><ellipse cx="14" cy="13.8" rx="2.5" ry="4"/><path d="M14 6.8v14m-5.5-7h11"/>'],
  ["rifts", "mystery", '<path class="fill" d="m15.2 6.7-5 6.1 3.1 1.3-3.5 7 8-7.9-3.2-1.2z"/><path d="m8.2 9.2 2.2 1m7.2 7.2 2.2 1M18.5 8l-2 2m-7 7-2 2"/>'],
  ["disturbed-burials", "hazard", '<path class="fill" d="M9 19.3v-7.7c0-3 1.7-4.5 5-4.5s5 1.5 5 4.5v7.7z"/><circle cx="12" cy="12.2" r="1"/><circle cx="16" cy="12.2" r="1"/><path d="m12.1 16 1.9-1.4 1.9 1.4M8 19.3h12"/>'],
  ["necropolises", "culture", '<path class="fill" d="M9 19.2v-7.4c0-3.1 1.7-4.7 5-4.7s5 1.6 5 4.7v7.4z"/><path d="M14 9v7m-2.4-4.7h4.8M7.8 19.2h12.4"/>'],
  ["encounters", "mystery", '<path class="fill" d="m14 6.8 2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-4 2.1.8-4.4-3.2-3.1 4.4-.6z"/><circle cx="14" cy="13.3" r="1.2"/>']
];

export const MARKER_TYPE_ICONS = Object.freeze(Object.fromEntries(TYPE_ICON_ROWS.map(([type, category, svg]) => [type, Object.freeze({type, category, symbol: `type:${type}`, svg})])));

export function resolveMarkerIconVisual(type, visual = {}) {
  const definition = MARKER_TYPE_ICONS[type] || MARKER_TYPE_ICONS.encounters;
  if (visual?.manual) {
    const symbol = LEGACY_MARKER_SYMBOLS[visual.symbol] ? visual.symbol : "marker";
    return Object.freeze({
      ...visual,
      category: MARKER_CATEGORY_ICONS[visual.palette] ? visual.palette : definition.category,
      palette: MARKER_CATEGORY_ICONS[visual.palette] ? visual.palette : definition.category,
      plate: MARKER_CATEGORY_ICONS[visual.palette]?.plate || MARKER_CATEGORY_ICONS[definition.category].plate,
      symbol,
      svg: LEGACY_MARKER_SYMBOLS[symbol],
      manual: true
    });
  }
  const category = MARKER_CATEGORY_ICONS[definition.category] ? definition.category : "mystery";
  return Object.freeze({
    ...visual,
    category,
    palette: category,
    plate: MARKER_CATEGORY_ICONS[category].plate,
    symbol: definition.symbol,
    svg: definition.svg,
    manual: false
  });
}

export function markerIconSvg({type, category, visual} = {}) {
  const resolved = resolveMarkerIconVisual(type, visual);
  const plate = MARKER_PLATES[resolved.plate] || MARKER_PLATES.star;
  return `<svg viewBox="0 0 28 32" aria-hidden="true" focusable="false" data-icon-type="${escapeIconKey(type || "encounters")}" data-icon-category="${escapeIconKey(category || resolved.category)}">
    <path class="marker-icon-shadow" d="M14 30.8c2.3-1.9 11.6-10.3 11.6-18.1C25.6 6 20.8 1.7 14 1.7S2.4 6 2.4 12.7c0 7.8 9.3 16.2 11.6 18.1z"/>
    <path class="marker-icon-body" d="M14 30.8c2.3-1.9 11.6-10.3 11.6-18.1C25.6 6 20.8 1.7 14 1.7S2.4 6 2.4 12.7c0 7.8 9.3 16.2 11.6 18.1z"/>
    ${plate}
    <g class="marker-icon-symbol" transform="translate(0 .2)">${resolved.svg}</g>
  </svg>`;
}

export const CITY_BASE_ICON_SVGS = Object.freeze({
  hamlet: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="hamlet"><circle class="city-icon-line" data-city-part="primary-outline" cx="17" cy="13" r="4.8"/></svg>`,
  village: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="village"><path class="city-icon-line" data-city-part="primary-outline" d="M17 5 26 20H8Z"/></svg>`,
  town: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="town"><path class="city-icon-line" data-city-part="primary-outline" d="m17 3.5 11 9.5-11 9.5L6 13Z"/></svg>`,
  city: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="city"><ellipse class="city-icon-line" data-city-part="primary-outline" cx="17" cy="13" rx="13" ry="9.7"/><ellipse class="city-icon-line city-icon-line--thin" data-city-part="inner-ring" cx="17" cy="13" rx="7" ry="5"/></svg>`,
  capital: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="capital"><path class="city-icon-line" data-city-part="primary-outline" d="m17 2.5 2.8 6.8h7.5l-6 4.5 2.4 7.7-6.7-4.7-6.7 4.7 2.4-7.7-6-4.5h7.5Z"/></svg>`,
  provincial: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="provincial"><path class="city-icon-line" data-city-part="primary-outline" d="M17 3 28 8.5v9L17 23 6 17.5v-9Z"/></svg>`,
  port: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="port"><path class="city-icon-line" data-city-part="primary-outline" d="M14 4C8 5 5 8.5 5 13s3 7.5 8 9M21 22c5-1.5 8-4.5 8-9s-3-8-9-9"/><path class="city-icon-line city-icon-line--thin" data-city-part="water-gap" d="M12 22q5-3 10 0"/></svg>`,
  fort: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="fort"><path class="city-icon-line" data-city-part="primary-outline" d="M7 3h20v20H7Z"/></svg>`,
  camp: `<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false" data-city-language="a-minimal-top-down" data-city-kind="camp"><path class="city-icon-line" data-city-part="primary-outline" d="M8 21 17 5l9 16M12 21h10"/></svg>`
});

export const CITY_ROLE_BADGE_SVGS = Object.freeze({
  capital: ({x = 28.2} = {}) => `<g class="city-icon-role-badge city-icon-role-badge--capital"><circle class="city-icon-role-badge-bg" cx="${x}" cy="5.2" r="4"/><path class="city-icon-role-badge-mark" d="m${x - 2.4} 5.8.7-3 1.7 1.6 1.7-1.6.7 3z"/></g>`,
  provincial: ({x = 28.2} = {}) => `<g class="city-icon-role-badge city-icon-role-badge--provincial"><circle class="city-icon-role-badge-bg" cx="${x}" cy="5.2" r="4"/><path class="city-icon-role-badge-mark" d="M${x - 1.4} 7.5V2.7m.2.3h3l-1 1.2 1 1.2h-3"/></g>`,
  port: ({x = 5.8} = {}) => `<g class="city-icon-role-badge city-icon-role-badge--port"><circle class="city-icon-role-badge-bg" cx="${x}" cy="5.2" r="3.7"/><path class="city-icon-role-badge-mark" d="M${x} 2.8v4.8m-1.7-1.4c.4 1.1 1 1.6 1.7 1.6s1.3-.5 1.7-1.6M${x - 1.1} 4h2.2"/></g>`
});

export function cityBaseIconSvg(silhouette = "town") {
  return CITY_BASE_ICON_SVGS[silhouette] || CITY_BASE_ICON_SVGS.town;
}

export function cityRoleBadgeSvg(roles = []) {
  const parts = [];
  if (roles.includes("capital")) parts.push(CITY_ROLE_BADGE_SVGS.capital());
  if (roles.includes("provincial")) parts.push(CITY_ROLE_BADGE_SVGS.provincial({x: roles.includes("capital") ? 20.5 : 28.2}));
  if (roles.includes("port")) parts.push(CITY_ROLE_BADGE_SVGS.port());
  return parts.join("");
}

export const MILITARY_ICON_KEYS = Object.freeze([
  "fleet-large", "fleet-small", "archers", "archers-heavy", "cavalry",
  "cavalry-heavy", "infantry", "infantry-heavy", "mountain", "artillery"
]);

export const MILITARY_ICON_SVGS = Object.freeze({
  infantry: '<path class="military-glyph-fill" d="M5 17.5V9l5-3 5 3v8.5z"/><path d="M7.4 17.5v-5.2h5.2v5.2M10 5.8V3.4m-2.4 1.2h4.8"/>',
  "infantry-heavy": '<path class="military-glyph-fill" d="M4.6 16.8V8.3L10 5l5.4 3.3v8.5L10 19z"/><path d="M7.3 16.7v-5h5.4v5M6.2 9.3h7.6M10 5V2.8m-2.6 1.1h5.2"/><path class="military-glyph-accent" d="M15.5 7.1h2v7.2h-2z"/>',
  archers: '<path d="M5.1 17.6c6.1-3 6.1-12.2 0-15.2M6.1 10h9.5m-2.6-2.6 2.8 2.6-2.8 2.6"/><path class="military-glyph-accent" d="m5.1 2.4 1.2 7.6-1.2 7.6"/>',
  "archers-heavy": '<path d="M4.3 17.8c6.3-3.1 6.3-12.5 0-15.6M5.5 10h10.8m-3-2.8 3 2.8-3 2.8"/><path class="military-glyph-accent" d="m4.3 2.2 1.4 7.8-1.4 7.8M8.6 4.6h2v10.8h-2z"/>',
  cavalry: '<path class="military-glyph-fill" d="M4.2 16.8V9.6l4.1-4.1 5.8 1.8 2.1 5-4.4 1.1-1.5 4.4z"/><path d="M8.5 5.7 6.6 3.8m7.1 3.7 2.2-1.8M5 12.6h7m-4.8 4.6-2 1.1m7.2-4.8 2.4 4"/>',
  "cavalry-heavy": '<path class="military-glyph-fill" d="M3.8 16.8V9.3l4.4-4.4 6.2 2 2.2 5.2-4.8 1.2-1.5 4.5z"/><path d="M8.4 5.1 6.3 3m7.9 4.1 2.3-1.9M4.7 12.2h7.4M7 17.1l-2.2 1.2m7.5-5 2.6 4.3"/><path class="military-glyph-accent" d="M7.1 8.7h5.8l-1.2 3.8H7.4z"/>',
  artillery: '<circle class="military-glyph-fill" cx="7" cy="15" r="3"/><circle class="military-glyph-fill" cx="14.8" cy="15" r="2.1"/><path d="M5 12.7 15.6 7l1.2 2.3-7.5 4M14.8 7.4l1.8-2.7"/>',
  mountain: '<path class="military-glyph-fill" d="m2.7 17.4 5.4-9.7 2.2 3.7 2.6-5.3 4.4 11.3z"/><path d="m6.4 10.7 1.7 1.8 1.2-1.1m1.8-2.9 1.8 2 1.3-1.2M5.3 17.4h10.4"/>',
  "fleet-small": '<path class="military-glyph-fill" d="M3 13.4h14c-1 3.1-3.3 4.7-7 4.7s-6-1.6-7-4.7z"/><path d="M10 13.4V4.2m.2 1 4.5 2.6-4.5 2.6M4 18.1c1.3-.7 2.7-.7 4 0s2.7.7 4 0 2.7-.7 4 0"/>',
  "fleet-large": '<path class="military-glyph-fill" d="M2.2 13h15.6c-1.1 3.5-3.7 5.2-7.8 5.2S3.3 16.5 2.2 13z"/><path d="M10 13V2.8m.2 1.1 5.1 2.9-5.1 2.9m-6.8 8.5c1.5-.8 2.9-.8 4.4 0s2.9.8 4.4 0 2.9-.8 4.4 0M5 12.9V9.8h2.2v3.1"/>'
});

export function militaryIconSvg(variant = "infantry") {
  const key = MILITARY_ICON_SVGS[variant] ? variant : "infantry";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false" data-icon-variant="${key}"><style>.military-icon-glyph{fill:none;stroke:#241b12;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}.military-glyph-fill{fill:#f2dfaa}.military-glyph-accent{fill:#b34835}</style><g class="military-icon-glyph">${MILITARY_ICON_SVGS[key]}</g></svg>`;
}

export function militaryIconDataUrl(variant = "infantry") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(militaryIconSvg(variant))}`;
}

export const CANVAS_ICON_COUNTS = Object.freeze({
  cityBases: Object.keys(CITY_BASE_ICON_SVGS).length,
  cityRoles: Object.keys(CITY_ROLE_BADGE_SVGS).length,
  markerTypes: Object.keys(MARKER_TYPE_ICONS).length,
  markerCategories: Object.keys(MARKER_CATEGORY_ICONS).length,
  legacyMarkerSymbols: Object.keys(LEGACY_MARKER_SYMBOLS).length,
  military: MILITARY_ICON_KEYS.length,
  total: Object.keys(CITY_BASE_ICON_SVGS).length + Object.keys(CITY_ROLE_BADGE_SVGS).length + Object.keys(MARKER_TYPE_ICONS).length + MILITARY_ICON_KEYS.length
});

function escapeIconKey(value) {
  return String(value).replace(/[^a-z0-9:_-]/gi, "");
}
