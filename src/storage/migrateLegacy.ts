import { OCCUPATIONS, SKILL_DEFINITIONS } from "../domain/catalogs";
import { createCharacter, getDerived, skillTotal } from "../domain/rules";
import { portableCharacter, assertPortablePortrait } from "./portable";
import {
  ATTRIBUTE_KEYS,
  BACKSTORY_KEYS,
  type Attributes,
  type Character,
  type Skill,
  type Weapon,
} from "../domain/types";

type LegacyRecord = Record<string, unknown>;

function record(input: unknown, label: string): LegacyRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label}必须是对象。`);
  }
  return input as LegacyRecord;
}

function text(value: unknown, label: string, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${label}必须是文本。`);
  return value;
}

/** Legacy inputs stored number fields as strings. Consume the entire string;
 * parseInt would silently accept e.g. "60<script>" or truncate fractions.
 */
function number(
  value: unknown,
  label: string,
  fallback?: number,
  min = 0,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" && typeof value !== "string")
    throw new Error(`${label}必须是有效数字。`);
  if (typeof value === "string" && !/^[+-]?\d+(?:\.0+)?$/.test(value.trim())) {
    throw new Error(`${label}必须是完整的整数。`);
  }
  const result = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isSafeInteger(result) || result < min)
    throw new Error(`${label}必须是大于等于 ${min} 的有限整数。`);
  return result;
}

function flag(value: unknown, label: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label}必须是布尔值。`);
  return value;
}

function fieldText(value: unknown, label: string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${label}必须是有限数字或文本。`);
    return String(value);
  }
  return text(value, label);
}

function attributes(value: unknown, label: string): Attributes {
  const source = record(value, label);
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, number(source[key], `${label}.${key}`)]),
  ) as Attributes;
}

function matchName(value: string): string {
  // Accept ASCII/full-width parentheses without changing the character's text.
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function portrait(value: unknown): string {
  const source = text(value, "头像");
  assertPortablePortrait(source);
  return source;
}

function damageBonus(value: unknown, label: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "number")
    return String(number(value, label, undefined, -Number.MAX_SAFE_INTEGER));
  const result = text(value, label).trim();
  if (!/^[+-]?(?:\d+|\d*[dD]\d+)$/.test(result))
    throw new Error(`${label}必须是整数或骰子表达式。`);
  return result;
}

function derivedPair(
  source: LegacyRecord,
  key: string,
  fallback: number,
): { current: number; original: number } {
  if (source[key] === undefined)
    return { current: fallback, original: fallback };
  const value = source[key];
  if (value === null) throw new Error(`派生值.${key}不能为 null。`);
  const entry =
    typeof value === "object"
      ? record(value, `派生值.${key}`)
      : { current: value, original: value };
  if (
    entry.current === null ||
    entry.original === null ||
    (entry.current === undefined && entry.original === undefined)
  ) {
    throw new Error(`派生值.${key}的当前值或原始值缺失。`);
  }
  const min = key === "build" ? -Number.MAX_SAFE_INTEGER : 0;
  const current = number(
    entry.current ?? entry.original,
    `派生值.${key}.current`,
    fallback,
    min,
  );
  const original = number(
    entry.original ?? entry.current,
    `派生值.${key}.original`,
    fallback,
    min,
  );
  return { current, original };
}

function migrateSkills(
  raw: unknown,
  character: Character,
  warnings: string[],
): Skill[] {
  const definitions = new Map(
    SKILL_DEFINITIONS.map((definition) => [
      matchName(definition.name),
      definition,
    ]),
  );
  const defaults = character.skills.map((skill) => ({
    ...skill,
    base:
      skill.baseType === "dodge"
        ? Math.floor(character.attrs.dex / 2)
        : skill.baseType === "ownLanguage"
          ? character.attrs.edu
          : skill.base,
  }));
  if (raw === undefined) return defaults;
  if (!Array.isArray(raw)) throw new Error("旧版技能必须是数组。");
  const result: Skill[] = [];
  const used = new Set<string>();
  raw.forEach((value, index) => {
    const item = record(value, `技能 ${index + 1}`);
    const name = text(item.name, `技能 ${index + 1} 名称`);
    if (!name.trim()) throw new Error(`技能 ${index + 1} 缺少名称。`);
    const definition = definitions.get(matchName(name));
    const duplicate = definition && used.has(definition.id);
    const custom = !definition || Boolean(duplicate);
    const id = custom ? `legacy-custom-${index}` : definition.id;
    used.add(id);
    const baseType = !custom ? definition.baseType : undefined;
    const defaultBase =
      baseType === "dodge"
        ? Math.floor(character.attrs.dex / 2)
        : baseType === "ownLanguage"
          ? character.attrs.edu
          : (definition?.base ?? 0);
    const base = number(item.base, `技能「${name}」基础值`, defaultBase);
    const occupationPoints = number(
      item.occupationPoints,
      `技能「${name}」职业点`,
      0,
    );
    const interestPoints = number(
      item.interestPoints,
      `技能「${name}」兴趣点`,
      0,
    );
    const legacyTotal =
      item.value === undefined
        ? undefined
        : number(item.value, `技能「${name}」总值`);
    const growthPoints = number(
      item.growthPoints,
      `技能「${name}」成长点`,
      legacyTotal === undefined
        ? 0
        : Math.max(0, legacyTotal - base - occupationPoints - interestPoints),
    );
    if (baseType && base !== defaultBase) {
      warnings.push(
        `技能「${name}」的旧基础值 ${base} 与属性计算值 ${defaultBase} 不同，已保留手填基础值。`,
      );
    }
    if (duplicate)
      warnings.push(
        `旧版包含同名技能「${name}」，重复项已作为自定义技能保留。`,
      );
    result.push({
      id,
      name,
      base,
      ...(baseType && base === defaultBase ? { baseType } : {}),
      occupationPoints,
      interestPoints,
      growthPoints,
      occupationSelected: flag(
        item.occupationSelected,
        `技能「${name}」职业标记`,
      ),
      custom,
      pinned: flag(item.pinned, `技能「${name}」常用标记`),
    });
  });
  // An explicit empty list stays empty. For partial old saves, fill only missing
  // standard definitions; never replace or drop provided custom rows.
  if (!raw.length) return [];
  return [...result, ...defaults.filter((skill) => !used.has(skill.id))];
}

function migrateWeapons(raw: unknown, character: Character): Weapon[] {
  if (raw === undefined) return character.weapons;
  if (!Array.isArray(raw)) throw new Error("旧版武器必须是数组。");
  return raw.map((value, index) => {
    const item = record(value, `武器 ${index + 1}`);
    const name = text(item.name, `武器 ${index + 1} 名称`);
    const skillName = text(item.skill ?? item.skillName, `武器「${name}」技能`);
    const skill = character.skills.find(
      (candidate) => matchName(candidate.name) === matchName(skillName),
    );
    const rawValue = item.value ?? item.manualValue;
    const valueNumber =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? null
        : number(rawValue, `武器「${name}」成功率`);
    // The old success rate was independently editable. Retain an override only
    // when it differs; otherwise let the weapon follow future skill growth.
    const manualValue =
      valueNumber !== null &&
      (!skill || valueNumber !== skillTotal(skill, character))
        ? valueNumber
        : null;
    return {
      id: `legacy-weapon-${index}`,
      name,
      skillId: skill?.id ?? null,
      skillName,
      manualValue,
      damage: fieldText(item.damage, `武器「${name}」伤害`),
      range: fieldText(item.range, `武器「${name}」射程`),
      ammo: fieldText(item.ammo, `武器「${name}」弹药`),
      malfunction: fieldText(item.malfunction, `武器「${name}」故障`),
    };
  });
}

export function migrateLegacy(input: unknown): {
  character: Character;
  warnings: string[];
} {
  const raw = record(input, "旧版角色卡");
  if (raw.version !== 3) throw new Error("只支持迁移旧版 v3 角色卡。");
  const warnings: string[] = [];
  const preserved: string[] = [];
  const character = createCharacter({
    method: "legacy",
    ageAdjustments: false,
  });
  character.attrs = attributes(raw.attrs, "属性");
  character.creationAttrs =
    raw.creationAttrs !== undefined
      ? attributes(raw.creationAttrs, "建卡属性")
      : raw.baseAttrs !== undefined
        ? attributes(raw.baseAttrs, "建卡属性")
        : { ...character.attrs };
  character.method = "legacy";
  character.rules.ageAdjustments = false;
  character.ageAdjusted = false;
  character.ageAudit = [];
  character.age = number(raw.age, "年龄", 28, 1);
  for (const key of [
    "name",
    "gender",
    "era",
    "residence",
    "birthplace",
    "concept",
    "possessions",
    "assetCash",
    "assetSpending",
    "assetDetails",
    "story",
    "notes",
  ] as const) {
    character[key] = text(raw[key], key, key === "era" ? "1920s" : "");
  }
  character.portrait = portrait(raw.portrait);
  const savedAt = raw.savedAt;
  if (savedAt !== undefined && savedAt !== null && savedAt !== "") {
    if (typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt)))
      throw new Error("旧版存档时间无效。");
    character.createdAt = new Date(savedAt).toISOString();
    character.updatedAt = character.createdAt;
  }
  const occupationId = text(raw.occupationId, "职业 ID");
  const occupationName = text(raw.occupationName ?? raw.occupation, "职业名称");
  const occupation =
    OCCUPATIONS.find((item) => item.id === occupationId) ??
    OCCUPATIONS.find(
      (item) => matchName(item.name) === matchName(occupationName),
    );
  character.occupationId =
    occupation?.id ?? (occupationId || occupationName ? "custom" : "");
  character.customOccupationName = text(
    raw.customOccupationName,
    "自定义职业名称",
    occupation?.id === "custom" || !occupation
      ? occupationName || occupationId
      : "",
  );
  if (!occupation && (occupationId || occupationName))
    warnings.push("旧版职业未匹配到新版目录，名称已作为自定义职业保留。");
  const rawBackstory =
    raw.backstory === undefined ? {} : record(raw.backstory, "背景详情");
  for (const key of BACKSTORY_KEYS)
    character.backstory[key] = text(
      raw[key] ?? rawBackstory[key],
      `背景.${key}`,
    );
  character.skills = migrateSkills(raw.skills, character, warnings);
  character.weapons = migrateWeapons(raw.weapons, character);
  character.derivedOverrides = {};
  const calculated = getDerived(character);
  const rawDerived =
    raw.derived === undefined ? {} : record(raw.derived, "派生值");
  const hp = derivedPair(rawDerived, "hp", calculated.hp);
  const mp = derivedPair(rawDerived, "mp", calculated.mp);
  const san = derivedPair(rawDerived, "san", character.attrs.pow);
  const luck = derivedPair(rawDerived, "luck", 50);
  character.resources = {
    hp: hp.current,
    mp: mp.current,
    san: san.current,
    luck: luck.current,
  };
  character.initialLuck = number(raw.initialLuck, "初始幸运", luck.original);
  // Original HP/MP are the old maximums, whereas old original SAN is an initial
  // value, not the seventh-edition maximum (99 minus Cthulhu Mythos).
  if (hp.original !== calculated.hp)
    character.derivedOverrides.hp = hp.original;
  if (mp.original !== calculated.mp)
    character.derivedOverrides.mp = mp.original;
  for (const key of ["build", "mov"] as const) {
    const pair = derivedPair(rawDerived, key, calculated[key]);
    if (pair.current !== calculated[key])
      character.derivedOverrides[key] = pair.current;
  }
  const rawDb = rawDerived.db;
  const dbEntry =
    rawDb !== null && typeof rawDb === "object"
      ? record(rawDb, "派生值.db")
      : { current: rawDb, original: rawDb };
  if (
    rawDb !== undefined &&
    (dbEntry.current === null ||
      dbEntry.original === null ||
      (dbEntry.current === undefined && dbEntry.original === undefined))
  )
    throw new Error("伤害加值不能为 null 或空对象。");
  const dbCurrent = damageBonus(
    dbEntry.current ?? dbEntry.original,
    "伤害加值当前值",
    calculated.db,
  );
  // Validate the original too, even though it is kept in the migration note.
  damageBonus(
    dbEntry.original ?? dbEntry.current,
    "伤害加值原始值",
    calculated.db,
  );
  if (dbCurrent !== calculated.db) character.derivedOverrides.db = dbCurrent;
  if (Object.keys(rawDerived).length) {
    preserved.push(
      `旧版当前值／原始值（完整记录）：\n${JSON.stringify(rawDerived, null, 2)}`,
    );
    warnings.push(
      "旧版当前值／原始值已完整保留在笔记的迁移记录；原始 SAN 不作为理智上限。",
    );
  }
  if (
    raw.initialLuck !== undefined &&
    character.initialLuck !== luck.original &&
    rawDerived.luck !== undefined
  ) {
    warnings.push(
      "旧版初始幸运与幸运原始值不一致，已采用明确的初始幸运，并保留原始记录。",
    );
  }
  if (raw.assetCredit !== undefined && raw.assetCredit !== "") {
    const manualCredit = number(raw.assetCredit, "手填信用评级");
    const creditSkill = character.skills.find(
      (item) => matchName(item.name) === matchName("信用评级"),
    );
    const skillCredit = creditSkill ? skillTotal(creditSkill, character) : 0;
    if (manualCredit !== skillCredit) {
      warnings.push(
        `旧版手填信用评级 ${manualCredit} 与技能值 ${skillCredit} 不同，手填值已保留在资产说明。`,
      );
      character.assetDetails += `${character.assetDetails ? "\n\n" : ""}旧版手填信用评级：${manualCredit}（迁移时技能值：${skillCredit}）。`;
    }
  }
  if (raw.source !== undefined)
    preserved.push(`旧版生成来源：${text(raw.source, "生成来源")}`);
  if (raw.logs !== undefined) character.logs = raw.logs as Character["logs"];
  if (preserved.length)
    character.notes += `${character.notes ? "\n\n" : ""}—— 旧版 v3 迁移记录 ——\n${preserved.join("\n\n")}`;
  character.warnings = [...warnings];
  return { character: portableCharacter(character), warnings };
}
