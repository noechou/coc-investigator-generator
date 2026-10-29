import {
  ATTRIBUTE_KEYS,
  BACKSTORY_KEYS,
  type Character,
} from "../domain/types";
import { parseCharacter } from "../domain/schema";

const RASTER_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif)$/i;

/** Images are portable data or image URLs, never HTML, SVG, blob or script URLs. */
export function assertPortablePortrait(value: string): void {
  if (value === "") return;
  if (value !== value.trim() || /[\u0000-\u001f\u007f<>"'`]/.test(value)) {
    throw new Error(
      "头像地址包含不安全的字符，请使用 PNG、JPEG、GIF、WebP 或 AVIF 图片。",
    );
  }
  if (value.startsWith("data:")) {
    const match =
      /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,([a-zA-Z0-9+/]+={0,2})$/i.exec(
        value,
      );
    if (!match)
      throw new Error("头像必须是普通图片，不能使用 HTML 或 SVG 数据。");
    try {
      const prefix = atob(match[1].slice(0, 256))
        .replace(/^\s+/, "")
        .toLowerCase();
      if (/^(?:<|\xef\xbb\xbf\s*<)/.test(prefix))
        throw new Error("unsafe image content");
    } catch {
      throw new Error("头像图片数据无效，不能导入。");
    }
    return;
  }
  let path: string;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password)
      throw new Error("头像地址不能含有登录凭据。");
    path = url.pathname;
  } else {
    if (
      /^[a-z][a-z\d+.-]*:/i.test(value) ||
      value.startsWith("//") ||
      value.includes("\\")
    ) {
      throw new Error("头像地址不受支持，请使用普通图片地址或上传图片。");
    }
    path = value.split(/[?#]/, 1)[0];
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    throw new Error("头像地址无效。");
  }
  if (!RASTER_EXTENSION.test(path))
    throw new Error("头像地址必须指向普通图片，不能使用 HTML 或 SVG。");
}

/** Project known fields explicitly so settings and credentials cannot enter backups. */
export function portableCharacter(input: Character): Character {
  // Validate first: callers cannot make a malformed object appear valid by omitting fields.
  const c = parseCharacter(input);
  assertPortablePortrait(c.portrait);
  const overrides: Character["derivedOverrides"] = {};
  for (const key of ["hp", "mp", "sanMax", "db", "build", "mov"] as const) {
    if (c.derivedOverrides[key] !== undefined)
      overrides[key] = c.derivedOverrides[key];
  }
  return {
    schemaVersion: 4,
    id: c.id,
    revision: c.revision,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    archived: c.archived,
    phase: c.phase,
    name: c.name,
    age: c.age,
    gender: c.gender,
    era: c.era,
    occupationId: c.occupationId,
    customOccupationName: c.customOccupationName,
    residence: c.residence,
    birthplace: c.birthplace,
    portrait: c.portrait,
    concept: c.concept,
    method: c.method,
    attrs: Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, c.attrs[key]]),
    ) as Character["attrs"],
    creationAttrs: Object.fromEntries(
      ATTRIBUTE_KEYS.map((key) => [key, c.creationAttrs[key]]),
    ) as Character["creationAttrs"],
    initialLuck: c.initialLuck,
    ageAdjusted: c.ageAdjusted,
    ageAudit: [...c.ageAudit],
    rules: {
      skillCap: c.rules.skillCap,
      ageAdjustments: c.rules.ageAdjustments,
      houseRules: c.rules.houseRules,
    },
    skills: c.skills.map((s) => ({
      id: s.id,
      name: s.name,
      base: s.base,
      ...(s.baseType === undefined ? {} : { baseType: s.baseType }),
      occupationPoints: s.occupationPoints,
      interestPoints: s.interestPoints,
      growthPoints: s.growthPoints,
      occupationSelected: s.occupationSelected,
      custom: s.custom,
      pinned: s.pinned,
    })),
    weapons: c.weapons.map((w) => ({
      id: w.id,
      name: w.name,
      skillId: w.skillId,
      skillName: w.skillName,
      manualValue: w.manualValue,
      damage: w.damage,
      range: w.range,
      ammo: w.ammo,
      malfunction: w.malfunction,
    })),
    resources: {
      hp: c.resources.hp,
      mp: c.resources.mp,
      san: c.resources.san,
      luck: c.resources.luck,
    },
    derivedOverrides: overrides,
    possessions: c.possessions,
    assetCash: c.assetCash,
    assetSpending: c.assetSpending,
    assetDetails: c.assetDetails,
    backstory: Object.fromEntries(
      BACKSTORY_KEYS.map((key) => [key, c.backstory[key]]),
    ) as Character["backstory"],
    story: c.story,
    notes: c.notes,
    logs: c.logs.map((e) => ({
      id: e.id,
      at: e.at,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      ...(e.result === undefined ? {} : { result: e.result }),
      ...(e.target === undefined ? {} : { target: e.target }),
      ...(e.outcome === undefined ? {} : { outcome: e.outcome }),
      ...(e.annotation === undefined ? {} : { annotation: e.annotation }),
    })),
    warnings: [...c.warnings],
  };
}
