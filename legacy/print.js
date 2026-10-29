const PRINT_STORAGE_KEY = "coc7-print-sheet-v1";
const SHEET_STORAGE_KEY = "coc7-investigator-sheet-v1";
const THEME_STORAGE_KEY = "coc7-print-theme-v1";
const DEFAULT_PORTRAIT = "assets/default-investigator-portrait.jpg";

const ATTRIBUTES = [
  ["str", "STR", "力量"],
  ["con", "CON", "体质"],
  ["siz", "SIZ", "体型"],
  ["dex", "DEX", "敏捷"],
  ["app", "APP", "外貌"],
  ["int", "INT", "智力"],
  ["pow", "POW", "意志"],
  ["edu", "EDU", "教育"],
];

const DERIVED = [
  ["hp", "HP", "生命"],
  ["mp", "MP", "魔法"],
  ["san", "SAN", "理智"],
  ["luck", "LUCK", "幸运"],
  ["db", "DB", "伤害"],
  ["build", "BUILD", "体格"],
  ["mov", "MOV", "移动"],
];

const BACKSTORY_DETAILS = [
  ["personalDescription", "个人描述"],
  ["ideologyBeliefs", "思想/信念"],
  ["significantPeople", "重要之人"],
  ["meaningfulLocations", "意义非凡之地"],
  ["treasuredPossessions", "宝贵之物"],
  ["traits", "特质"],
  ["injuriesScars", "伤疤/伤病"],
  ["phobiasManias", "恐惧症/躁狂症"],
  ["mythosTomes", "遭遇神话/秘典记录"],
];

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function display(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function derivedValue(data, key) {
  const value = data?.derived?.[key];
  if (value && typeof value === "object") {
    const current = display(value.current);
    const original = display(value.original);
    return current === original ? current : `${current}/${original}`;
  }
  return display(value);
}

function skillTotal(skill) {
  return toNumber(skill.base) + toNumber(skill.occupationPoints) + toNumber(skill.interestPoints) + toNumber(skill.growthPoints);
}

function loadSheetData() {
  const raw = localStorage.getItem(PRINT_STORAGE_KEY) || localStorage.getItem(SHEET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.attrs || !Array.isArray(parsed?.skills)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function renderIdentity(data) {
  const name = display(data.name, "未命名调查员");
  const occupation = display(data.occupationName || data.occupation || data.occupationId, "未定职业");
  $("#printPortrait").src = data.portrait || DEFAULT_PORTRAIT;
  $("#printName").textContent = name;
  $("#identityLine").textContent = `${occupation} · ${display(data.age, "年龄未定")}岁 · ${display(data.gender, "性别未定")}`;
  $("#preparedAt").textContent = data.printPreparedAt
    ? new Date(data.printPreparedAt).toLocaleDateString("zh-CN")
    : new Date().toLocaleDateString("zh-CN");

  const fields = [
    ["姓名", name],
    ["年龄", data.age],
    ["性别", data.gender],
    ["职业", occupation],
    ["时代", data.era],
    ["出生地", data.birthplace],
    ["现居地", data.residence],
  ];
  $("#identityGrid").innerHTML = fields
    .map(([label, value]) => `<article class="identity-field"><span>${label}</span><b>${escapeHtml(display(value))}</b></article>`)
    .join("");
}

function renderAttributes(data) {
  $("#attributesGrid").innerHTML = ATTRIBUTES.map(([key, label, name]) => {
    const value = toNumber(data.attrs?.[key]);
    return `
      <article class="attr-card">
        <span>${label} · ${name}</span>
        <strong>${value}</strong>
        <small>${Math.floor(value / 2)} / ${Math.floor(value / 5)}</small>
      </article>`;
  }).join("");
}

function renderDerived(data) {
  $("#derivedGrid").innerHTML = DERIVED.map(([key, label, name]) => `
    <article class="derived-card">
      <span>${label}</span>
      <strong>${escapeHtml(derivedValue(data, key))}</strong>
      <small>${name}</small>
    </article>
  `).join("");
}

function renderSkills(data) {
  const skills = [...data.skills].sort((a, b) => {
    if (a.name === "信用评级") return -1;
    if (b.name === "信用评级") return 1;
    if (a.name === "闪避") return -1;
    if (b.name === "闪避") return 1;
    return 0;
  });

  $("#skillsGrid").innerHTML = skills.map((skill) => {
    const total = Math.min(999, skillTotal(skill));
    const mark = skill.occupationSelected ? "★" : "";
    return `
      <div class="skill-cell" title="${escapeHtml(skill.name)}">
        <span class="mark">${mark}</span>
        <span class="name">${escapeHtml(skill.name)}</span>
        <span class="value">${total}</span>
        <span class="sub">${Math.floor(total / 2)}</span>
        <span class="sub">${Math.floor(total / 5)}</span>
      </div>`;
  }).join("");
}

function renderWeapons(data) {
  const weapons = Array.isArray(data.weapons) && data.weapons.length
    ? data.weapons
    : [{ name: "徒手格斗", skill: "格斗（斗殴）", value: "", damage: "1D3+DB", range: "接触", ammo: "—" }];

  $("#weaponsRows").innerHTML = weapons.map((weapon) => `
    <div class="weapon-row">
      <span>${escapeHtml(display(weapon.name))}</span>
      <span>${escapeHtml(display(weapon.skill))}</span>
      <span>${escapeHtml(display(weapon.value))}</span>
      <span>${escapeHtml(display(weapon.damage))}</span>
      <span>${escapeHtml(display(weapon.range))}</span>
      <span>${escapeHtml(display(weapon.ammo))}</span>
    </div>
  `).join("");
}

function renderBackstoryDetails(data) {
  $("#backstoryGrid").innerHTML = BACKSTORY_DETAILS.map(([key, label]) => `
    <article class="backstory-box">
      <span>${label}</span>
      <p>${escapeHtml(display(data[key], "—"))}</p>
    </article>
  `).join("");
}

function renderNotes(data) {
  const assetLines = [
    `信用评级：${display(data.assetCredit)}`,
    `现金：${display(data.assetCash)}`,
    `消费水平：${display(data.assetSpending)}`,
    display(data.assetDetails, ""),
  ].filter(Boolean).join("\n");
  const boxes = [
    ["随身物品", data.possessions],
    ["资产", assetLines],
    ["背景故事", data.story],
  ];

  $("#notesGrid").innerHTML = boxes.map(([label, value]) => `
    <article class="note-box${label === "背景故事" ? " note-box--story" : ""}">
      <span>${label}</span>
      <p>${escapeHtml(display(value, " "))}</p>
    </article>
  `).join("");
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  $("#themeSelect").value = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.requestAnimationFrame(fitSheetToOnePage);
}

function fitSheetToOnePage() {
  const page = $("#sheetPage");
  const frame = $("#sheetScaleFrame");
  const status = $("#fitStatus");
  page.classList.remove("is-compact", "is-ultra-compact");
  page.style.setProperty("--scale", "1");
  page.style.setProperty("--frame-offset-x", "0px");
  const pageStyle = getComputedStyle(page);
  const maxHeight = page.clientHeight - parseFloat(pageStyle.paddingTop) - parseFloat(pageStyle.paddingBottom);
  const maxWidth = page.clientWidth - parseFloat(pageStyle.paddingLeft) - parseFloat(pageStyle.paddingRight);

  if (frame.scrollHeight > maxHeight) page.classList.add("is-compact");
  if (frame.scrollHeight > maxHeight) page.classList.add("is-ultra-compact");

  const scale = Math.min(1, maxWidth / frame.scrollWidth, maxHeight / frame.scrollHeight);
  const safeScale = Math.max(0.1, Number.isFinite(scale) ? scale : 1);
  const offsetX = Math.max(0, (maxWidth - frame.scrollWidth * safeScale) / 2);
  page.style.setProperty("--scale", safeScale.toFixed(3));
  page.style.setProperty("--frame-offset-x", `${offsetX.toFixed(2)}px`);
  const compacted = page.classList.contains("is-compact");
  const scaled = safeScale < 0.995;
  status.textContent = scaled
    ? `已等比缩放 ${Math.round(safeScale * 100)}%`
    : compacted ? "A4 单页 · 紧凑" : "A4 单页";
  status.classList.toggle("is-scaled", scaled || compacted);
}

function render() {
  const data = loadSheetData();
  if (!data) {
    $("#sheetPage").hidden = true;
    $("#missingState").hidden = false;
    return;
  }

  renderIdentity(data);
  renderAttributes(data);
  renderDerived(data);
  renderSkills(data);
  renderBackstoryDetails(data);
  renderWeapons(data);
  renderNotes(data);
  window.requestAnimationFrame(fitSheetToOnePage);
}

$("#themeSelect").addEventListener("change", (event) => setTheme(event.target.value));
$("#printNow").addEventListener("click", () => {
  fitSheetToOnePage();
  window.print();
});
$("#backToEditor").addEventListener("click", () => {
  if (window.opener && !window.opener.closed) {
    window.close();
    return;
  }
  window.location.href = "index.html";
});

window.addEventListener("resize", fitSheetToOnePage);
window.addEventListener("beforeprint", fitSheetToOnePage);

setTheme(localStorage.getItem(THEME_STORAGE_KEY) || "parchment");
render();
