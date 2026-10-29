import { autoAllocate, selectOccupation } from "../domain/allocation";
import {
  createCharacter,
  initializeAttributes,
  validateCreation,
} from "../domain/rules";
import { parseCharacter } from "../domain/schema";
import type {
  AiSettings,
  Character,
  CreateOptions,
  Weapon,
} from "../domain/types";
import {
  AiError,
  requestAiJson,
  throwIfAborted,
  validateAiSettings,
} from "./client";
import {
  allocationMessages,
  backgroundMessages,
  profileMessages,
} from "./prompts";
import { parseAllocation, parseBackground, parseProfile } from "./schemas";
import type { AiProfile } from "./schemas";

export { AiError, DEFAULT_AI_SETTINGS, validateAiSettings } from "./client";

type StageCallback = (stage: string) => void;
const resolveSkill = (skills: Character["skills"], reference: string) =>
  skills.find((skill) => skill.id === reference || skill.name === reference);

function withEquipment(character: Character, profile: AiProfile): Character {
  const brawl = resolveSkill(character.skills, "格斗（斗殴）");
  if (!brawl) throw new Error("角色缺少徒手格斗对应的技能。");
  const unarmed = character.weapons.find(
    (weapon) => weapon.name === "徒手格斗",
  );
  const weapons: Weapon[] = [
    {
      id: unarmed?.id ?? crypto.randomUUID(),
      name: "徒手格斗",
      skillId: brawl.id,
      skillName: brawl.name,
      manualValue: null,
      damage: "1D3+DB",
      range: "接触",
      ammo: "—",
      malfunction: "—",
    },
  ];
  for (const proposal of profile.equipment.weapons) {
    // The canonical unarmed weapon always uses the real Brawl skill, including future growth.
    if (proposal.name.trim() === "徒手格斗") continue;
    const skill = resolveSkill(character.skills, proposal.skill);
    if (!skill) throw new Error("武器对应技能不存在。");
    weapons.push({
      id: crypto.randomUUID(),
      name: proposal.name,
      skillId: skill.id,
      skillName: skill.name,
      manualValue: null,
      damage: proposal.damage,
      range: proposal.range,
      ammo: proposal.ammo,
      malfunction: proposal.malfunction,
    });
  }
  return { ...character, weapons, possessions: profile.equipment.possessions };
}

function assertCreationOptions(options: CreateOptions): void {
  if (typeof options.concept !== "string" || !options.concept.trim()) {
    throw new AiError("settings", "请先写下人物构想，再开始 AI 生成。");
  }
  if (options.concept.length > 20_000) {
    throw new AiError("settings", "人物构想超过 20000 字符，请精简后再生成。");
  }
  if (
    options.age !== undefined &&
    (!Number.isInteger(options.age) || options.age < 1 || options.age > 150)
  ) {
    throw new AiError("settings", "角色年龄需要是 1–150 之间的整数。");
  }
  if (
    options.era !== undefined &&
    (typeof options.era !== "string" || options.era.length > 200)
  ) {
    throw new AiError("settings", "时代设定需要是 200 字符以内的文字。");
  }
  if (
    options.skillCap !== undefined &&
    (!Number.isInteger(options.skillCap) ||
      options.skillCap < 1 ||
      options.skillCap > 99)
  ) {
    throw new AiError("settings", "初始技能上限需要是 1–99 之间的整数。");
  }
  if (
    options.ageAdjustments !== undefined &&
    typeof options.ageAdjustments !== "boolean"
  ) {
    throw new AiError("settings", "请检查年龄修正规则设置。");
  }
}

/** No state, storage, or credentials are retained. The caller decides when to adopt the returned draft. */
export async function generateCharacter(
  options: CreateOptions,
  settings: AiSettings,
  onStage: StageCallback,
  signal: AbortSignal,
): Promise<Character> {
  throwIfAborted(signal);
  assertCreationOptions(options);
  // Snapshot settings/options before yielding so later UI edits cannot change a running job.
  const config = validateAiSettings(settings);
  const ageAdjustments = options.ageAdjustments ?? true;
  let character = createCharacter({
    ...options,
    method: "concept",
    ageAdjustments: false,
  });
  character.rules.ageAdjustments = ageAdjustments;
  onStage("理解人物构想，生成属性与背景");
  const profile = await requestAiJson(config, {
    messages: profileMessages(character),
    parse: parseProfile,
    signal,
    maxTokens: 8192,
    onRetry: () => onStage("人物资料格式不完整，正在重试一次"),
  });
  throwIfAborted(signal);
  onStage("按年龄修正规则计算属性与技能预算");
  throwIfAborted(signal);
  character = initializeAttributes(
    {
      ...character,
      name: profile.identity.name,
      gender: profile.identity.gender,
      residence: profile.identity.residence,
      birthplace: profile.identity.birthplace,
      backstory: profile.backstory,
      story: profile.story,
    },
    profile.attrs,
    profile.luck,
  );
  character = selectOccupation(
    character,
    profile.occupationId,
    profile.priorities,
  );
  character = withEquipment(character, profile);
  // Validate our completed structure before disclosing it in the next request.
  character = parseCharacter(character);
  onStage("结合人物经历，建议职业与兴趣技能");
  const targets = await requestAiJson(config, {
    messages: allocationMessages(character, profile.priorities),
    parse: (value) => parseAllocation(value, character),
    signal,
    maxTokens: 4096,
    onRetry: () => onStage("技能建议格式不完整，正在重试一次"),
  });
  throwIfAborted(signal);
  onStage("校验点数、装备和建卡规则");
  throwIfAborted(signal);
  character = autoAllocate(character, profile.priorities, targets);
  character = parseCharacter({ ...character, phase: "draft" });
  character.warnings = [
    ...new Set([...character.warnings, ...validateCreation(character)]),
  ];
  throwIfAborted(signal);
  onStage("角色草稿已生成，可以检查和修改");
  throwIfAborted(signal);
  return character;
}

/** Return a separate character with only backstory/story changed; never alter play state or the input. */
export async function regenerateBackground(
  input: Character,
  settings: AiSettings,
  onStage: StageCallback,
  signal: AbortSignal,
): Promise<Character> {
  throwIfAborted(signal);
  const config = validateAiSettings(settings);
  const character = parseCharacter(input);
  onStage("阅读现有角色，重新整理人物背景");
  const proposal = await requestAiJson(config, {
    messages: backgroundMessages(character),
    parse: parseBackground,
    signal,
    maxTokens: 6144,
    onRetry: () => onStage("背景格式不完整，正在重试一次"),
  });
  throwIfAborted(signal);
  const result: Character = {
    ...character,
    backstory: proposal.backstory,
    story: proposal.story,
  };
  parseCharacter(result);
  onStage("新背景已生成，可以预览和确认");
  throwIfAborted(signal);
  return result;
}
