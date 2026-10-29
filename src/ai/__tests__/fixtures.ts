import type { AiSettings } from "../../domain/types";
import { BACKSTORY_KEYS } from "../../domain/types";

export const mockSettings: AiSettings = {
  provider: "compatible",
  endpoint: "https://model.example.test/v1",
  model: "mock-model",
  apiKey: "mock-key-not-a-secret",
};
export const proposedAttrs = {
  str: 50,
  con: 55,
  siz: 65,
  dex: 60,
  app: 50,
  int: 70,
  pow: 60,
  edu: 65,
};
export const proposedBackstory = Object.fromEntries(
  BACKSTORY_KEYS.map((key) => [
    key,
    ["injuriesScars", "phobiasManias", "mythosTomes"].includes(key)
      ? ""
      : `一条可用于扮演的线索：${key}`,
  ]),
);

export function profileFixture() {
  return {
    attrs: { ...proposedAttrs },
    luck: 55,
    identity: {
      name: "林知秋",
      gender: "女",
      residence: "上海",
      birthplace: "苏州",
    },
    occupationId: "journalist",
    priorities: ["图书馆使用", "侦查", "说服", "心理学", "潜行"],
    equipment: {
      weapons: [
        {
          name: "小刀",
          skill: "格斗（斗殴）",
          damage: "1D4+DB",
          range: "接触",
          ammo: "—",
          malfunction: "—",
        },
      ],
      possessions: "旧相机、采访本与一封未寄出的信。",
    },
    backstory: { ...proposedBackstory },
    story:
      "她是一名追查失踪工人的记者，随身带着母亲留下的旧相机。报社的沉默让她决定继续走访码头。",
  };
}

export function completionResponse(
  value: unknown,
  finishReason = "stop",
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: finishReason,
          message: {
            content: typeof value === "string" ? value : JSON.stringify(value),
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
