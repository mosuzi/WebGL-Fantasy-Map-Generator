const stages = [
  {kicker: "卷一 · 开卷", copy: "启封舆图，静候山河舒展"},
  {kicker: "卷二 · 识卷", copy: "辨读旧卷，拾取经纬遗痕"},
  {kicker: "卷三 · 成势", copy: "铺陈山川，勾勒江河脉络"},
  {kicker: "卷四 · 定邦", copy: "点定郡国，推演城邑人烟"},
  {kicker: "卷五 · 合卷", copy: "山河成卷，万邦静待启行"}
];

const root = document.querySelector("#showcase-root");
const kicker = document.querySelector("#stage-kicker");
const status = document.querySelector("#showcase-status");
const progressLine = document.querySelector("#progress-line");
const replayButton = document.querySelector("#replay-button");
const nextButton = document.querySelector("#next-copy-button");
const errorButton = document.querySelector("#error-button");
const staticButton = document.querySelector("#static-button");

let stageIndex = 0;

function renderStage() {
  const stage = stages[stageIndex];
  kicker.textContent = stage.kicker;
  status.textContent = stage.copy;
  progressLine.style.setProperty("--progress", `${((stageIndex + 1) / stages.length) * 100}%`);
}

function setErrorMode(enabled) {
  root.dataset.mode = enabled ? "error" : "normal";
  errorButton.setAttribute("aria-pressed", String(enabled));
  if (enabled) {
    kicker.textContent = "卷页有损 · 请稍候";
    status.textContent = "旧卷一时未能辨读，可重试展开或稍后再启";
    return;
  }
  renderStage();
}

function replayScroll() {
  setErrorMode(false);
  root.classList.remove("is-static");
  staticButton.setAttribute("aria-pressed", "false");
  root.classList.remove("is-replaying");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.add("is-replaying"));
  });
}

replayButton.addEventListener("click", replayScroll);

nextButton.addEventListener("click", () => {
  stageIndex = (stageIndex + 1) % stages.length;
  setErrorMode(false);
});

errorButton.addEventListener("click", () => {
  setErrorMode(root.dataset.mode !== "error");
});

staticButton.addEventListener("click", () => {
  const enabled = !root.classList.contains("is-static");
  root.classList.toggle("is-static", enabled);
  staticButton.setAttribute("aria-pressed", String(enabled));
});

renderStage();
