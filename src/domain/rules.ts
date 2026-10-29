import { ATTRIBUTE_KEYS, BACKSTORY_KEYS } from "./types";
import type {
  AttributeKey,
  Attributes,
  Budgets,
  Character,
  CreateOptions,
  Derived,
  Occupation,
  Skill,
  Weapon,
} from "./types";
import { ATTRIBUTE_LABELS, OCCUPATIONS, SKILL_DEFINITIONS } from "./catalogs";
import { rollDice } from "./checks";

export const DEFAULT_ATTRIBUTES: Attributes = {
  str: 50,
  con: 50,
  siz: 65,
  dex: 50,
  app: 50,
  int: 65,
  pow: 50,
  edu: 65,
};

export interface AgeRule {
  min: number;
  max: number;
  physicalKeys: AttributeKey[];
  physicalDeduction: number;
  eduPenalty: number;
  eduChecks: number;
  appDeduction: number;
  luckReroll: boolean;
}

export const AGE_RULES: AgeRule[] = [
  {
    min: 15,
    max: 19,
    physicalKeys: ["str", "siz"],
    physicalDeduction: 5,
    eduPenalty: 5,
    eduChecks: 0,
    appDeduction: 0,
    luckReroll: true,
  },
  {
    min: 20,
    max: 39,
    physicalKeys: [],
    physicalDeduction: 0,
    eduPenalty: 0,
    eduChecks: 1,
    appDeduction: 0,
    luckReroll: false,
  },
  {
    min: 40,
    max: 49,
    physicalKeys: ["str", "con", "dex"],
    physicalDeduction: 5,
    eduPenalty: 0,
    eduChecks: 2,
    appDeduction: 5,
    luckReroll: false,
  },
  {
    min: 50,
    max: 59,
    physicalKeys: ["str", "con", "dex"],
    physicalDeduction: 10,
    eduPenalty: 0,
    eduChecks: 3,
    appDeduction: 10,
    luckReroll: false,
  },
  {
    min: 60,
    max: 69,
    physicalKeys: ["str", "con", "dex"],
    physicalDeduction: 20,
    eduPenalty: 0,
    eduChecks: 4,
    appDeduction: 15,
    luckReroll: false,
  },
  {
    min: 70,
    max: 79,
    physicalKeys: ["str", "con", "dex"],
    physicalDeduction: 40,
    eduPenalty: 0,
    eduChecks: 4,
    appDeduction: 20,
    luckReroll: false,
  },
  {
    min: 80,
    max: 150,
    physicalKeys: ["str", "con", "dex"],
    physicalDeduction: 80,
    eduPenalty: 0,
    eduChecks: 4,
    appDeduction: 25,
    luckReroll: false,
  },
];

export function newEntityId(prefix = "character"): string {
  const value =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export function getOccupation(id: string): Occupation | undefined {
  return OCCUPATIONS.find((occupation) => occupation.id === id);
}

export function occupationName(c: Character): string {
  return c.occupationId === "custom"
    ? c.customOccupationName.trim() || "自定义职业"
    : getOccupation(c.occupationId)?.name ||
        c.customOccupationName ||
        "职业待定";
}

/** A generic catalog specialization may match a specialization renamed by its owner. */
export function skillMatchesReference(
  skill: Skill,
  reference: string,
): boolean {
  if (skill.id === reference || skill.name === reference) return true;
  const definition = SKILL_DEFINITIONS.find((item) => item.id === skill.id);
  if (definition?.name === reference) return true;
  if (!reference.endsWith("（自选）")) return false;
  const prefix = reference.slice(0, -4);
  return skill.name.startsWith(`${prefix}（`) && skill.name.endsWith("）");
}

export function skillBase(skill: Skill, c?: Character): number {
  if (c && skill.baseType === "dodge") return Math.floor(c.attrs.dex / 2);
  if (c && skill.baseType === "ownLanguage") return c.attrs.edu;
  return skill.base;
}

/** The creation cap does not limit a skill improved during play. */
export function skillTotal(skill: Skill, c?: Character): number {
  return (
    skillBase(skill, c) +
    skill.occupationPoints +
    skill.interestPoints +
    skill.growthPoints
  );
}

export function isCreditSkill(skill: Skill): boolean {
  return (
    ["credit-rating", "base-10"].includes(skill.id) || skill.name === "信用评级"
  );
}

export function isMythosSkill(skill: Skill): boolean {
  return (
    ["cthulhu-mythos", "base-11"].includes(skill.id) ||
    skill.name === "克苏鲁神话"
  );
}

export function getCredit(c: Character): number {
  const credit = c.skills.find(isCreditSkill);
  return credit ? skillTotal(credit, c) : 0;
}

export function weaponValue(w: Weapon, c: Character): number {
  if (w.manualValue !== null && Number.isFinite(w.manualValue))
    return w.manualValue;
  const skill =
    (w.skillId ? c.skills.find((item) => item.id === w.skillId) : undefined) ??
    c.skills.find((item) => item.name === w.skillName);
  return skill ? skillTotal(skill, c) : 0;
}

export function getDerived(c: Character): Derived {
  const { str, con, siz, dex, pow } = c.attrs;
  const sum = str + siz;
  let db: string;
  let build: number;
  if (sum <= 64) {
    db = "-2";
    build = -2;
  } else if (sum <= 84) {
    db = "-1";
    build = -1;
  } else if (sum <= 124) {
    db = "0";
    build = 0;
  } else if (sum <= 164) {
    db = "+1D4";
    build = 1;
  } else if (sum <= 204) {
    db = "+1D6";
    build = 2;
  } else {
    const dice = 2 + Math.floor((sum - 205) / 80);
    db = `+${dice}D6`;
    build = dice + 1;
  }
  const baseMov = str < siz && dex < siz ? 7 : str > siz && dex > siz ? 9 : 8;
  const agePenalty =
    c.age >= 80
      ? 5
      : c.age >= 70
        ? 4
        : c.age >= 60
          ? 3
          : c.age >= 50
            ? 2
            : c.age >= 40
              ? 1
              : 0;
  const mythos = c.skills.find(isMythosSkill);
  const derived: Derived = {
    hp: Math.max(0, Math.floor((con + siz) / 10)),
    mp: Math.max(0, Math.floor(pow / 5)),
    sanMax: Math.max(0, 99 - (mythos ? skillTotal(mythos, c) : 0)),
    db,
    build,
    mov: Math.max(1, baseMov - agePenalty),
  };
  // Explicit overrides are house rules or preserved legacy values, never inferred
  // from current HP/MP/SAN, which must survive damage and spending unchanged.
  for (const key of ["hp", "mp", "sanMax", "build", "mov"] as const) {
    const override = c.derivedOverrides[key];
    const numeric =
      typeof override === "number"
        ? override
        : typeof override === "string" && override.trim() !== ""
          ? Number(override)
          : Number.NaN;
    if (Number.isFinite(numeric))
      derived[key] =
        key === "build"
          ? Math.trunc(numeric)
          : Math.max(0, Math.floor(numeric));
  }
  const overrideDb = c.derivedOverrides.db;
  if (typeof overrideDb === "string" && overrideDb.trim())
    derived.db = overrideDb;
  else if (typeof overrideDb === "number" && Number.isFinite(overrideDb))
    derived.db = String(overrideDb);
  return derived;
}

export function getBudgets(c: Character): Budgets {
  const attrs = c.phase === "ready" ? c.creationAttrs : c.attrs;
  const occupation = getOccupation(c.occupationId);
  let occupationTotal = 0;
  let formula = "请先选择职业";
  if (occupation) {
    const { edu, app, dex, str, pow } = attrs;
    switch (occupation.formula) {
      case "edu4":
        occupationTotal = edu * 4;
        formula = "EDU × 4";
        break;
      case "edu2App2":
        occupationTotal = edu * 2 + app * 2;
        formula = "EDU × 2 + APP × 2";
        break;
      case "edu2Dex2":
        occupationTotal = edu * 2 + dex * 2;
        formula = "EDU × 2 + DEX × 2";
        break;
      default: {
        const choices =
          occupation.formula === "edu2BestDexStr"
            ? { dex, str }
            : occupation.formula === "edu2BestDexPow"
              ? { dex, pow }
              : occupation.formula === "edu2BestAppDexStr"
                ? { app, dex, str }
                : occupation.formula === "edu2BestAppDexStrPow"
                  ? { app, dex, str, pow }
                  : null;
        if (!choices) {
          formula = "未知职业点公式";
          break;
        }
        const [key, value] = Object.entries(choices).reduce((best, entry) =>
          entry[1] > best[1] ? entry : best,
        );
        occupationTotal = edu * 2 + value * 2;
        formula = `EDU × 2 + ${key.toUpperCase()} × 2`;
      }
    }
    formula += ` = ${occupationTotal}`;
  }
  const occupationSpent = c.skills.reduce(
    (sum, skill) => sum + skill.occupationPoints,
    0,
  );
  const interestTotal = attrs.int * 2;
  const interestSpent = c.skills.reduce(
    (sum, skill) => sum + skill.interestPoints,
    0,
  );
  return {
    occupationTotal,
    occupationSpent,
    occupationRemaining: occupationTotal - occupationSpent,
    interestTotal,
    interestSpent,
    interestRemaining: interestTotal - interestSpent,
    formula,
  };
}

export function validateCreation(c: Character): string[] {
  const warnings: string[] = [];
  const occupation = getOccupation(c.occupationId);
  const budgets = getBudgets(c);
  if (!c.name.trim()) warnings.push("尚未填写调查员姓名。");
  if (!occupation) warnings.push("尚未选择有效职业。");
  if (c.age < 15)
    warnings.push("15 岁以下没有标准建卡年龄修正规则，请与守秘人确认。");
  if (c.rules.ageAdjustments && !c.ageAdjusted)
    warnings.push("年龄修正尚未应用，请确认手动属性是否已包含修正。");
  if (budgets.occupationRemaining !== 0)
    warnings.push(
      budgets.occupationRemaining < 0
        ? `职业点超出预算 ${-budgets.occupationRemaining} 点。`
        : `还有 ${budgets.occupationRemaining} 点职业点未分配。`,
    );
  if (budgets.interestRemaining !== 0)
    warnings.push(
      budgets.interestRemaining < 0
        ? `兴趣点超出预算 ${-budgets.interestRemaining} 点。`
        : `还有 ${budgets.interestRemaining} 点兴趣点未分配。`,
    );
  const selected = c.skills.filter(
    (skill) =>
      skill.occupationSelected &&
      !isCreditSkill(skill) &&
      !isMythosSkill(skill),
  );
  if (occupation) {
    if (selected.length !== 8)
      warnings.push(
        `职业技能应选择 8 项，当前为 ${selected.length} 项（信用评级另计）。`,
      );
    for (const required of occupation.required) {
      if (!selected.some((skill) => skillMatchesReference(skill, required)))
        warnings.push(`职业必选技能未选：${required}。`);
    }
    for (const group of occupation.groups ?? []) {
      const count = selected.filter((skill) =>
        group.options.some((option) => skillMatchesReference(skill, option)),
      ).length;
      if (count < group.count)
        warnings.push(`职业技能要求未满足：${group.label}。`);
    }
    const creditSkill = c.skills.find(isCreditSkill);
    const credit = creditSkill
      ? skillBase(creditSkill, c) +
        creditSkill.occupationPoints +
        creditSkill.interestPoints
      : 0;
    if (credit < occupation.credit[0] || credit > occupation.credit[1])
      warnings.push(
        `信用评级建卡值应为 ${occupation.credit[0]}–${occupation.credit[1]}，当前为 ${credit}。`,
      );
  }
  for (const skill of c.skills) {
    const initial =
      skillBase(skill, c) + skill.occupationPoints + skill.interestPoints;
    const invested = skill.occupationPoints + skill.interestPoints;
    if (isMythosSkill(skill) && invested > 0)
      warnings.push("克苏鲁神话不能分配建卡点数。");
    if (isMythosSkill(skill) && skill.occupationSelected)
      warnings.push("克苏鲁神话不能作为职业技能。");
    if (skill.occupationPoints > 0 && !skill.occupationSelected)
      warnings.push(`${skill.name} 未选为职业技能，却分配了职业点。`);
    const cap = isCreditSkill(skill)
      ? (occupation?.credit[1] ?? 99)
      : c.rules.skillCap;
    if (invested > 0 && initial > cap)
      warnings.push(`${skill.name} 的建卡值 ${initial} 超过上限 ${cap}。`);
    if (
      ![
        skill.base,
        skill.occupationPoints,
        skill.interestPoints,
        skill.growthPoints,
      ].every(
        (value) =>
          Number.isFinite(value) && value >= 0 && Number.isInteger(value),
      )
    ) {
      warnings.push(`${skill.name} 含有无效的技能点数。`);
    }
  }
  return [...new Set(warnings)];
}

function deductPhysical(
  attrs: Attributes,
  keys: AttributeKey[],
  points: number,
): Record<string, number> {
  const deductions: Record<string, number> = {};
  // At most 80 iterations for the supported age brackets, even for tiny stats.
  for (let remaining = points; remaining > 0; remaining -= 1) {
    const key = keys
      .filter((item) => attrs[item] > 1)
      .sort(
        (a, b) => attrs[b] - attrs[a] || keys.indexOf(a) - keys.indexOf(b),
      )[0];
    if (!key) break;
    attrs[key] -= 1;
    deductions[key] = (deductions[key] ?? 0) + 1;
  }
  return deductions;
}

/** Apply once after initial rolled/proposed attributes, before entering play. */
export function applyInitialAgeAdjustments(
  c: Character,
  rng: () => number = Math.random,
): Character {
  if (c.ageAdjusted) return structuredClone(c);
  const attrs = { ...c.creationAttrs };
  const audit = [...c.ageAudit];
  let luck = c.initialLuck;
  const rule = AGE_RULES.find((item) => c.age >= item.min && c.age <= item.max);
  if (!c.rules.ageAdjustments) audit.push("未应用年龄修正。");
  else if (!rule) audit.push("15 岁以下无标准年龄修正，保留原始属性。");
  else {
    const deductions = deductPhysical(
      attrs,
      rule.physicalKeys,
      rule.physicalDeduction,
    );
    const changes = Object.entries(deductions).map(
      ([key, amount]) => `${ATTRIBUTE_LABELS[key as AttributeKey]} −${amount}`,
    );
    if (changes.length) audit.push(`年龄体能修正：${changes.join("、")}。`);
    const deducted = Object.values(deductions).reduce(
      (sum, amount) => sum + amount,
      0,
    );
    if (deducted < rule.physicalDeduction)
      audit.push(
        `身体属性不足，余下 ${rule.physicalDeduction - deducted} 点年龄扣减须与守秘人处理。`,
      );
    if (rule.appDeduction) {
      const amount = Math.min(rule.appDeduction, Math.max(0, attrs.app - 1));
      attrs.app -= amount;
      audit.push(`年龄外貌修正：外貌 −${amount}。`);
    }
    if (rule.eduPenalty) {
      const amount = Math.min(rule.eduPenalty, Math.max(0, attrs.edu - 1));
      attrs.edu -= amount;
      audit.push(`年龄教育修正：教育 −${amount}。`);
    }
    for (let index = 0; index < rule.eduChecks; index += 1) {
      const before = attrs.edu;
      const roll = rollDice("1D100", rng).total;
      const gain =
        roll > before
          ? Math.min(rollDice("1D10", rng).total, Math.max(0, 99 - before))
          : 0;
      attrs.edu += gain;
      audit.push(
        `教育增强 ${index + 1}/${rule.eduChecks}：D100=${roll}，原值 ${before}，增加 ${gain}。`,
      );
    }
    if (rule.luckReroll) {
      const reroll = rollDice("3D6", rng).total * 5;
      luck = Math.max(luck, reroll);
      audit.push(`少年幸运取高：${c.initialLuck} / ${reroll} → ${luck}。`);
    }
  }
  const adjusted: Character = {
    ...structuredClone(c),
    attrs,
    ageAdjusted: Boolean(c.rules.ageAdjustments && rule),
    ageAudit: audit,
  };
  // initialLuck remains the PRE-age roll; only current luck uses the teenager's second roll.
  adjusted.skills = adjusted.skills.map((skill) => ({
    ...skill,
    base: skillBase(skill, adjusted),
  }));
  const derived = getDerived(adjusted);
  adjusted.resources = {
    hp: derived.hp,
    mp: derived.mp,
    san: Math.min(attrs.pow, derived.sanMax),
    luck,
  };
  return adjusted;
}

/** Initialize a new attribute proposal from its PRE-age values. Same source never rerolls or stacks aging. */
export function initializeAttributes(
  c: Character,
  attrs: Attributes,
  luck: number = c.initialLuck,
): Character {
  for (const key of ATTRIBUTE_KEYS) {
    if (!Number.isInteger(attrs[key]) || attrs[key] < 0 || attrs[key] > 999)
      throw new RangeError(`${ATTRIBUTE_LABELS[key]}须为 0–999 的整数。`);
  }
  if (!Number.isInteger(luck) || luck < 0 || luck > 999)
    throw new RangeError("幸运须为 0–999 的整数。");
  const marker = `属性初始化：${c.age}岁；年龄修正${c.rules.ageAdjustments ? "开启" : "关闭"}`;
  if (
    c.ageAudit[0] === marker &&
    c.initialLuck === luck &&
    ATTRIBUTE_KEYS.every((key) => c.creationAttrs[key] === attrs[key])
  )
    return structuredClone(c);
  const next = structuredClone(c);
  next.creationAttrs = { ...attrs };
  next.attrs = { ...attrs };
  next.initialLuck = luck;
  next.ageAdjusted = false;
  // Keep the initial dice audit on the first call, not the old age deductions on a new proposal.
  next.ageAudit = [
    marker,
    ...c.ageAudit.filter((line) =>
      /^(?:STR|CON|SIZ|DEX|APP|INT|POW|EDU|幸运)：\(/.test(line),
    ),
  ];
  return applyInitialAgeAdjustments(next);
}

export function createCharacter(options?: CreateOptions): Character {
  const method = options?.method ?? "manual";
  const age = options?.age ?? 28;
  const cap = options?.skillCap ?? 75;
  if (!["manual", "concept", "random", "legacy"].includes(method))
    throw new Error("无效的建卡方式。");
  if (!Number.isInteger(age) || age < 1 || age > 150)
    throw new RangeError("年龄须为 1–150 的整数。");
  if (!Number.isInteger(cap) || cap < 1 || cap > 99)
    throw new RangeError("技能建卡上限须为 1–99 的整数。");
  const attrs = { ...DEFAULT_ATTRIBUTES };
  const audit: string[] = [];
  let luck = 50;
  if (method === "random") {
    for (const key of ATTRIBUTE_KEYS) {
      const formula =
        key === "siz" || key === "int" || key === "edu" ? "2D6+6" : "3D6";
      const result = rollDice(formula);
      attrs[key] = result.total * 5;
      audit.push(
        `${key.toUpperCase()}：(${formula}；骰面 ${result.rolls.join("/")}) × 5 = ${attrs[key]}。`,
      );
    }
    const result = rollDice("3D6");
    luck = result.total * 5;
    audit.push(`幸运：(3D6；骰面 ${result.rolls.join("/")}) × 5 = ${luck}。`);
  }
  const now = new Date().toISOString();
  const c: Character = {
    schemaVersion: 4,
    id: newEntityId(),
    revision: 0,
    createdAt: now,
    updatedAt: now,
    archived: false,
    phase: "draft",
    name: "",
    age,
    gender: "",
    era: options?.era ?? "1920s",
    occupationId: "",
    customOccupationName: "",
    residence: "",
    birthplace: "",
    portrait: "",
    concept: options?.concept ?? "",
    method,
    attrs,
    creationAttrs: { ...attrs },
    initialLuck: luck,
    ageAdjusted: false,
    ageAudit: audit,
    rules: {
      skillCap: cap,
      ageAdjustments: options?.ageAdjustments ?? true,
      houseRules: "",
    },
    skills: SKILL_DEFINITIONS.map((definition) => ({
      ...definition,
      base:
        definition.baseType === "dodge"
          ? Math.floor(attrs.dex / 2)
          : definition.baseType === "ownLanguage"
            ? attrs.edu
            : definition.base,
      occupationPoints: 0,
      interestPoints: 0,
      growthPoints: 0,
      occupationSelected: false,
      custom: false,
      pinned: false,
    })),
    weapons: [
      {
        id: newEntityId("weapon"),
        name: "徒手格斗",
        skillId: "fighting-brawl",
        skillName: "格斗（斗殴）",
        manualValue: null,
        damage: "1D3+DB",
        range: "接触",
        ammo: "—",
        malfunction: "—",
      },
    ],
    resources: { hp: 0, mp: 0, san: attrs.pow, luck },
    derivedOverrides: {},
    possessions: "",
    assetCash: "",
    assetSpending: "",
    assetDetails: "",
    backstory: Object.fromEntries(
      BACKSTORY_KEYS.map((key) => [key, ""]),
    ) as Character["backstory"],
    story: "",
    notes: "",
    logs: [],
    warnings: [],
  };
  if (method === "random") return initializeAttributes(c, attrs, luck);
  const derived = getDerived(c);
  c.resources = {
    hp: derived.hp,
    mp: derived.mp,
    san: Math.min(attrs.pow, derived.sanMax),
    luck,
  };
  return c;
}
