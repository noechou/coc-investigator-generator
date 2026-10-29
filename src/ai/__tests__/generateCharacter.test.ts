import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCharacter, regenerateBackground } from "../generateCharacter";
import {
  createCharacter,
  getBudgets,
  getDerived,
  validateCreation,
  weaponValue,
} from "../../domain/rules";
import * as rules from "../../domain/rules";
import { selectOccupation } from "../../domain/allocation";
import {
  completionResponse,
  mockSettings,
  profileFixture,
  proposedAttrs,
  proposedBackstory,
} from "./fixtures";
import type { Character, CreateOptions } from "../../domain/types";

const options: CreateOptions = {
  method: "concept",
  concept: "一名追查码头失踪案的女记者。",
  age: 45,
  era: "1920s",
};
const freshSignal = () => new AbortController().signal;
const targets = {
  occupationAllocations: [{ skill: "图书馆使用", points: 40 }],
  interestAllocations: [{ skill: "格斗（斗殴）", points: 15 }],
};

function mockGeneration(allocation: unknown = targets) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(completionResponse(profileFixture()))
    .mockResolvedValueOnce(completionResponse(allocation));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function playedCharacter(): Character {
  const c = selectOccupation(
    createCharacter({
      method: "manual",
      concept: options.concept,
      era: "1920s",
      age: 45,
    }),
    "journalist",
  );
  c.name = "林知秋";
  c.story = "她正在寻找码头失踪的友人。";
  c.backstory = { ...proposedBackstory } as Character["backstory"];
  c.skills[0].growthPoints = 3;
  c.resources = { hp: 4, mp: 2, san: 37, luck: 41 };
  c.notes = "已经使用两次急救。";
  c.revision = 9;
  c.phase = "ready";
  c.logs = [
    {
      id: "log-one",
      at: c.updatedAt,
      kind: "resource",
      title: "受伤",
      detail: "HP -3",
    },
  ];
  return c;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("concept-first generation", () => {
  it("applies proposed attributes and age once before exposing computed budgets to the second stage", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initialize = vi.spyOn(rules, "initializeAttributes");
    const fetchMock = mockGeneration();
    const stages: string[] = [];
    const result = await generateCharacter(
      options,
      mockSettings,
      (stage) => stages.push(stage),
      freshSignal(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("concept");
    expect(result.phase).toBe("draft");
    expect(result.creationAttrs).toEqual(proposedAttrs);
    expect(result.attrs.str + result.attrs.con + result.attrs.dex).toBe(
      proposedAttrs.str + proposedAttrs.con + proposedAttrs.dex - 5,
    );
    expect(result.attrs.app).toBe(proposedAttrs.app - 5);
    expect(result.attrs.edu).toBe(proposedAttrs.edu);
    expect(
      result.ageAudit.filter((line) => line.startsWith("教育增强")),
    ).toHaveLength(2);
    expect(result.initialLuck).toBe(55);
    expect(result.resources).toEqual({
      hp: getDerived(result).hp,
      mp: getDerived(result).mp,
      san: proposedAttrs.pow,
      luck: 55,
    });
    expect(validateCreation(result)).toEqual([]);
    expect(result.age).toBe(45);
    expect(result.era).toBe("1920s");
    expect(result.concept).toBe(options.concept);
    expect(result.name).toBe("林知秋");
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    const firstInput = JSON.parse(firstBody.messages[1].content);
    const secondInput = JSON.parse(secondBody.messages[1].content);
    expect(firstInput.concept).toBe(options.concept);
    expect(firstInput).not.toHaveProperty("attrs");
    expect(secondInput.attrs).toEqual(result.attrs);
    expect(secondInput.budgets).toEqual({
      occupation: result.attrs.edu * 4,
      interest: result.attrs.int * 2,
    });
    expect(getBudgets(result)).toMatchObject({
      occupationRemaining: 0,
      interestRemaining: 0,
    });
    expect(stages.length).toBeGreaterThanOrEqual(4);
    expect(stages.every((stage) => /[一-鿿]/.test(stage))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(mockSettings.apiKey);
  });

  it("supports disabled aging and absent allocation targets through the local allocator", async () => {
    mockGeneration({});
    const result = await generateCharacter(
      { ...options, ageAdjustments: false },
      mockSettings,
      () => {},
      freshSignal(),
    );
    expect(result.attrs).toEqual(proposedAttrs);
    expect(result.ageAdjusted).toBe(false);
    expect(getBudgets(result)).toMatchObject({
      occupationRemaining: 0,
      interestRemaining: 0,
    });
    expect(result.skills.some((skill) => skill.occupationPoints > 0)).toBe(
      true,
    );
  });

  it("enforces local budgets and caps even when the model asks to spend far too many points", async () => {
    mockGeneration({
      occupationAllocations: [{ skill: "图书馆使用", points: 10_000 }],
      interestAllocations: [{ skill: "图书馆使用", points: 10_000 }],
    });
    const result = await generateCharacter(
      { ...options, ageAdjustments: false },
      mockSettings,
      () => {},
      freshSignal(),
    );
    expect(validateCreation(result)).toEqual([]);
    expect(getBudgets(result)).toMatchObject({
      occupationRemaining: 0,
      interestRemaining: 0,
    });
    expect(
      result.skills.find((skill) => skill.name === "图书馆使用"),
    ).toMatchObject({ base: 20, occupationPoints: 55, interestPoints: 0 });
    const mythos = result.skills.find((skill) => skill.name === "克苏鲁神话");
    expect(mythos).toMatchObject({
      occupationPoints: 0,
      interestPoints: 0,
      occupationSelected: false,
    });
  });

  it("links every proposed and default weapon to a real live skill ID", async () => {
    mockGeneration({});
    const result = await generateCharacter(
      options,
      mockSettings,
      () => {},
      freshSignal(),
    );
    expect(result.weapons.map((weapon) => weapon.name)).toEqual([
      "徒手格斗",
      "小刀",
    ]);
    for (const weapon of result.weapons) {
      const skill = result.skills.find(
        (candidate) => candidate.id === weapon.skillId,
      )!;
      expect(skill).toBeDefined();
      expect(weapon.skillName).toBe(skill.name);
      expect(weapon.manualValue).toBeNull();
      const before = weaponValue(weapon, result);
      skill.growthPoints += 7;
      expect(weaponValue(weapon, result)).toBe(before + 7);
      skill.growthPoints -= 7;
    }
  });

  it("snapshots options/settings and preserves HTML-shaped text literally", async () => {
    const literal = '<script>throw new Error("not executed")</script>';
    const profile = profileFixture();
    profile.identity.name = literal;
    profile.backstory.personalDescription = literal;
    profile.story = literal;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(profile))
      .mockResolvedValueOnce(completionResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const mutableOptions = { ...options };
    const settings = { ...mockSettings };
    const result = await generateCharacter(
      mutableOptions,
      settings,
      () => {
        mutableOptions.age = 19;
        mutableOptions.concept = "后来改动";
        settings.endpoint = "https://other.example.test";
        settings.apiKey = "changed-after-start";
      },
      freshSignal(),
    );
    expect(result.age).toBe(45);
    expect(result.concept).toBe(options.concept);
    expect(result.name).toBe(literal);
    expect(result.story).toBe(literal);
    expect(result.backstory.personalDescription).toBe(literal);
    expect(
      fetchMock.mock.calls.every(
        (call) => call[0] === "https://model.example.test/v1/chat/completions",
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(
        (call) =>
          call[1].headers.Authorization === `Bearer ${mockSettings.apiKey}`,
      ),
    ).toBe(true);
  });

  it.each([
    { ...options, concept: "" },
    { ...options, age: NaN },
    { ...options, age: 151 },
    { ...options, skillCap: 0 },
    { ...options, skillCap: 100 },
  ])("rejects invalid user options before any request", async (invalid) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateCharacter(invalid, mockSettings, () => {}, freshSignal()),
    ).rejects.toMatchObject({ code: "settings" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries invalid profile fields once and never enters allocation if still invalid", async () => {
    const badProfile = {
      ...profileFixture(),
      attrs: { ...proposedAttrs, str: 999 },
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(completionResponse(badProfile)),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateCharacter(options, mockSettings, () => {}, freshSignal()),
    ).rejects.toMatchObject({ code: "format" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String(call[1].body)).messages[0].content).toContain(
        "第一阶段",
      );
    }
  });

  it("rejects invented occupation/skill fields instead of silently replacing them", async () => {
    const badProfile = profileFixture();
    badProfile.occupationId = "invented";
    badProfile.priorities = ["任意神奇技能"];
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(completionResponse(badProfile)),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateCharacter(options, mockSettings, () => {}, freshSignal()),
    ).rejects.toMatchObject({ code: "format" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not enter stage two if cancelled after receiving the profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(profileFixture()));
    vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController();
    await expect(
      generateCharacter(
        options,
        mockSettings,
        (stage) => {
          if (stage.includes("按年龄")) abort.abort();
        },
        abort.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not return a result if cancelled at the final callback", async () => {
    mockGeneration();
    const abort = new AbortController();
    await expect(
      generateCharacter(
        options,
        mockSettings,
        (stage) => {
          if (stage.includes("草稿已生成")) abort.abort();
        },
        abort.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("background regeneration", () => {
  it("only changes backstory/story and keeps the input, revision, resources, logs and growth intact", async () => {
    const character = playedCharacter();
    const snapshot = structuredClone(character);
    const proposal = {
      backstory: {
        ...proposedBackstory,
        ideologyBeliefs: "不能让沉默成为习惯。",
      },
      story: "她决定重访码头，查清友人留下的线索。",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse(proposal));
    vi.stubGlobal("fetch", fetchMock);
    const result = await regenerateBackground(
      character,
      mockSettings,
      () => {},
      freshSignal(),
    );
    expect(character).toEqual(snapshot);
    expect(result).not.toBe(character);
    expect(result).toEqual({ ...snapshot, ...proposal });
    expect(result.resources).not.toBe(character.resources);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const input = JSON.parse(body.messages[1].content);
    expect(input.identity.name).toBe(character.name);
    expect(input.story).toBe(character.story);
    expect(input.backstory).toEqual(character.backstory);
    expect(body.messages[0].content).toContain("此次只重写角色背景");
    expect(JSON.stringify(body)).not.toContain(mockSettings.apiKey);
  });

  it("does not mutate the character on malformed or malicious returned fields", async () => {
    const character = playedCharacter();
    const snapshot = structuredClone(character);
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        completionResponse({
          backstory: proposedBackstory,
          story: "背景",
          attrs: { str: 999 },
          resources: { hp: 999 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      regenerateBackground(character, mockSettings, () => {}, freshSignal()),
    ).rejects.toMatchObject({ code: "format" });
    expect(character).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never adopts a response after cancellation", async () => {
    const character = playedCharacter();
    const snapshot = structuredClone(character);
    const abort = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        completionResponse({ backstory: proposedBackstory, story: "新背景" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      regenerateBackground(
        character,
        mockSettings,
        (stage) => {
          if (stage.includes("新背景已生成")) abort.abort();
        },
        abort.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(character).toEqual(snapshot);
  });
});
