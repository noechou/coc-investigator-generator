import type { AiSettings } from "../domain/types";

export const DEFAULT_AI_SETTINGS: Readonly<AiSettings> = Object.freeze({
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  apiKey: "",
});

export type AiErrorCode =
  | "settings"
  | "auth"
  | "rate_limit"
  | "request"
  | "network"
  | "timeout"
  | "format";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiMessage {
  role: "system" | "user";
  content: string;
}

interface JsonRequest<T> {
  messages: AiMessage[];
  parse: (input: unknown) => T;
  signal: AbortSignal;
  onRetry?: () => void;
  maxTokens?: number;
  timeoutMs?: number;
}

const TIMEOUT_MS = 90_000;
const INITIAL_MAX_TOKENS = 8_192;
const MAX_OUTPUT_TOKENS = 16_384;

/** Normalize a base URL or a full OpenAI-compatible chat-completions URL. */
export function resolveCompletionEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new AiError(
      "settings",
      "请输入完整的 API 地址，例如 https://api.deepseek.com 或 https://服务地址/v1。",
    );
  }
  const local =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new AiError(
      "settings",
      "API 地址须使用 HTTPS；本机 localhost 服务可以使用 HTTP。",
    );
  }
  if (url.username || url.password) {
    throw new AiError(
      "settings",
      "API 地址不能包含账号或密码，请将密钥填写在 API Key 中。",
    );
  }
  if (url.search || url.hash) {
    throw new AiError(
      "settings",
      "API 地址不能带查询参数或锚点，请填写服务的基础地址或 chat/completions 地址。",
    );
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions")
    ? path
    : `${path}/chat/completions`;
  return url.toString();
}

/** Returns a call-local copy. This module never persists settings, credentials or responses. */
export function validateAiSettings(settings: AiSettings): AiSettings {
  if (
    settings?.provider !== "deepseek" &&
    settings?.provider !== "compatible"
  ) {
    throw new AiError("settings", "请选择 DeepSeek 或兼容服务。");
  }
  const apiKey =
    typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";
  if (!apiKey || apiKey.length > 8192 || /[^\x21-\x7e]/.test(apiKey)) {
    throw new AiError(
      "settings",
      "请填写有效的 API Key，密钥中不能包含空格或换行。",
    );
  }
  const suppliedModel =
    typeof settings.model === "string" ? settings.model.trim() : "";
  const model =
    suppliedModel ||
    (settings.provider === "deepseek" ? DEFAULT_AI_SETTINGS.model : "");
  if (
    !model ||
    model.length > 200 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/@+\-]*$/.test(model)
  ) {
    throw new AiError(
      "settings",
      "请填写服务支持的模型名称，例如 deepseek-v4-flash；名称中不能包含空格或换行。",
    );
  }
  const endpoint =
    typeof settings.endpoint === "string" ? settings.endpoint.trim() : "";
  if (!endpoint && settings.provider === "compatible") {
    throw new AiError(
      "settings",
      "请填写兼容服务的 API 地址，例如 https://服务地址/v1。",
    );
  }
  return {
    provider: settings.provider,
    endpoint: resolveCompletionEndpoint(
      endpoint || DEFAULT_AI_SETTINGS.endpoint,
    ),
    model,
    apiKey,
  };
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("已取消 AI 生成。", "AbortError");
}

/** Accept only a complete JSON document or a single JSON code fence; never evaluate code. */
export function parseAiJson(content: string): unknown {
  let text = content.trim();
  if (text.startsWith("```")) {
    const fence = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n?```$/i.exec(text);
    if (!fence)
      throw new AiError(
        "format",
        "AI 返回了 JSON 以外的说明文字或不完整的代码块。",
      );
    text = fence[1].trim();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError("format", "AI 返回的 JSON 不完整或格式错误。");
  }
}

function httpError(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError(
      "auth",
      "API 鉴权失败，请检查密钥是否有效，以及是否属于当前服务。",
    );
  }
  if (status === 429) {
    return new AiError(
      "rate_limit",
      "请求过于频繁或服务额度不足（429），请稍后重试并检查账户额度。",
    );
  }
  if (status === 402) {
    return new AiError(
      "request",
      "API 账户余额不足（402），请检查服务账户余额。",
    );
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AiError(
      "request",
      `服务未接受请求（HTTP ${status}），请检查 API 地址、模型名称及模型是否支持 chat/completions。`,
    );
  }
  return new AiError(
    "request",
    `AI 服务暂时无法完成请求（HTTP ${status}），请稍后重试。`,
  );
}

function responseContent(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("choices" in payload)
  ) {
    throw new AiError(
      "format",
      "AI 服务未返回有效的 choices 结果，请确认服务支持 chat/completions。",
    );
  }
  const choices = payload.choices;
  const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (typeof choice !== "object" || choice === null) {
    throw new AiError("format", "AI 服务未返回有效的生成结果。");
  }
  if ("finish_reason" in choice && choice.finish_reason === "length") {
    throw new AiError("format", "AI 输出已达到长度上限，结果被截断。");
  }
  const message = "message" in choice ? choice.message : undefined;
  const content =
    typeof message === "object" && message !== null && "content" in message
      ? message.content
      : undefined;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiError("format", "AI 未返回可解析的 JSON 正文。");
  }
  return content;
}

async function requestOnce(
  settings: AiSettings,
  messages: AiMessage[],
  signal: AbortSignal,
  maxTokens: number,
  timeoutMs: number,
): Promise<unknown> {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timedOut = false;
  let rejectAborted: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectAborted(new DOMException("已取消 AI 生成。", "AbortError"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectAborted(
      new AiError("timeout", "AI 请求超过 90 秒，请检查网络或稍后重试。"),
    );
  }, timeoutMs);
  try {
    const result = (async () => {
      const response = await fetch(settings.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          messages,
          stream: false,
          max_tokens: maxTokens,
          ...(settings.provider === "deepseek"
            ? {
                thinking: { type: "disabled" },
                response_format: { type: "json_object" },
              }
            : {}),
        }),
      });
      if (!response.ok) throw httpError(response.status);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiError("format", "AI 服务返回的响应不是完整的 JSON。");
      }
      return parseAiJson(responseContent(payload));
    })();
    const value = await Promise.race([result, aborted]);
    throwIfAborted(signal);
    return value;
  } catch (error) {
    throwIfAborted(signal);
    if (timedOut)
      throw new AiError("timeout", "AI 请求超过 90 秒，请检查网络或稍后重试。");
    if (error instanceof AiError) throw error;
    // Do not echo raw fetch/provider errors: they can include a URL, request headers or credentials.
    throw new AiError(
      "network",
      "无法连接 AI 服务，请检查网络和 API 地址。浏览器跨域限制（CORS）也可能阻止请求，请使用允许浏览器访问的兼容接口。",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** One retry only for malformed/truncated output, including invalid structured fields. */
export async function requestAiJson<T>(
  settings: AiSettings,
  request: JsonRequest<T>,
): Promise<T> {
  throwIfAborted(request.signal);
  const normalized = validateAiSettings(settings);
  const initialTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(INITIAL_MAX_TOKENS, request.maxTokens ?? INITIAL_MAX_TOKENS),
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(request.signal);
    const messages: AiMessage[] =
      attempt === 0
        ? request.messages
        : [
            ...request.messages,
            {
              role: "user",
              content:
                "上次返回的数据不完整或不符合约定字段。请重新输出完整、符合上述字段和数值范围的 JSON，不要附带解释或代码。",
            },
          ];
    try {
      const payload = await requestOnce(
        normalized,
        messages,
        request.signal,
        Math.min(MAX_OUTPUT_TOKENS, initialTokens * (attempt + 1)),
        request.timeoutMs ?? TIMEOUT_MS,
      );
      throwIfAborted(request.signal);
      const parsed = request.parse(payload);
      throwIfAborted(request.signal);
      return parsed;
    } catch (error) {
      throwIfAborted(request.signal);
      if (!(error instanceof AiError) || error.code !== "format") throw error;
      if (attempt === 1) {
        throw new AiError(
          "format",
          `${error.message} 已自动重试一次，请调整人物概念或模型后重试。`,
        );
      }
      request.onRetry?.();
    }
  }
  throw new AiError("format", "AI 返回格式无法解析。");
}
