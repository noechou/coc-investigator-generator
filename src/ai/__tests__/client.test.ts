import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiError,
  DEFAULT_AI_SETTINGS,
  parseAiJson,
  requestAiJson,
  resolveCompletionEndpoint,
  validateAiSettings,
} from "../client";
import { completionResponse, mockSettings } from "./fixtures";

const parseObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AiError("format", "字段无效");
  return value as Record<string, unknown>;
};
type Overrides = Partial<Parameters<typeof requestAiJson>[1]> & {
  settings?: typeof mockSettings;
};
const makeRequest = ({
  settings = mockSettings,
  ...overrides
}: Overrides = {}) =>
  requestAiJson(settings, {
    messages: [{ role: "user", content: "返回 JSON" }],
    parse: parseObject,
    signal: new AbortController().signal,
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("endpoint and settings", () => {
  it.each([
    [
      "https://model.example.test",
      "https://model.example.test/chat/completions",
    ],
    [
      "https://model.example.test/v1",
      "https://model.example.test/v1/chat/completions",
    ],
    [
      "https://model.example.test/v1/",
      "https://model.example.test/v1/chat/completions",
    ],
    [
      "https://model.example.test/v1/chat/completions",
      "https://model.example.test/v1/chat/completions",
    ],
    [
      "https://model.example.test/v1/chat/completions/",
      "https://model.example.test/v1/chat/completions",
    ],
    ["http://localhost:11434/v1", "http://localhost:11434/v1/chat/completions"],
    ["http://127.0.0.1:1234", "http://127.0.0.1:1234/chat/completions"],
    ["http://[::1]:8000/v1", "http://[::1]:8000/v1/chat/completions"],
  ])("normalizes %s without duplicate paths", (value, expected) => {
    expect(resolveCompletionEndpoint(value)).toBe(expected);
  });

  it.each([
    "",
    "/v1",
    "http://remote.example.test",
    "file:///tmp/ai",
    "https://user:pass@model.example.test",
    "https://model.example.test/#page",
    "https://model.example.test/?key=secret",
  ])("rejects unsafe or incomplete endpoint %s", (value) => {
    expect(() => resolveCompletionEndpoint(value)).toThrow();
  });

  it("defaults DeepSeek fields and rejects empty compatible fields without echoing a key", () => {
    expect(
      validateAiSettings({
        ...mockSettings,
        provider: "deepseek",
        endpoint: "",
        model: "",
      }),
    ).toMatchObject({
      endpoint: "https://api.deepseek.com/chat/completions",
      model: DEFAULT_AI_SETTINGS.model,
    });
    expect(() => validateAiSettings({ ...mockSettings, model: "" })).toThrow(
      "模型名称",
    );
    expect(() =>
      validateAiSettings({ ...mockSettings, apiKey: "key\nsecret" }),
    ).toThrow("密钥");
    expect(() =>
      validateAiSettings({ ...mockSettings, model: "\ninvalid model" }),
    ).toThrow("模型名称");
  });
});

describe("JSON transport", () => {
  it("parses plain or single fenced JSON without extracting prose or evaluating code", () => {
    expect(parseAiJson('{"ok":true}')).toEqual({ ok: true });
    expect(parseAiJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseAiJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(() => parseAiJson('解释\n{"ok":true}')).toThrow();
    expect(() => parseAiJson("({ok: true})")).toThrow();
    expect(() => parseAiJson("```js\n({ok:true})\n```")).toThrow();
  });

  it("sends minimal compatible fields and keeps credentials only in the header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeRequest()).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://model.example.test/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "stream",
    ]);
    expect(body.stream).toBe(false);
    expect(String(init.body)).not.toContain(mockSettings.apiKey);
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${mockSettings.apiKey}`,
    });
    expect(init.credentials).toBe("omit");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
  });

  it("sends thinking and JSON mode only for the DeepSeek preset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completionResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await makeRequest({
      settings: {
        ...mockSettings,
        provider: "deepseek",
        endpoint: "",
        model: "",
      },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries truncation once with a larger output budget", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse('{"incomplete":', "length"))
      .mockResolvedValueOnce(completionResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onRetry = vi.fn();
    await expect(makeRequest({ maxTokens: 4096, onRetry })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(8192);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(16_384);
  });

  it("stops after a single retry on malformed documents or schema failures", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(completionResponse("不是 JSON")),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeRequest()).rejects.toMatchObject({
      code: "format",
      message: expect.stringContaining("重试一次"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "auth", "鉴权"],
    [403, "auth", "密钥"],
    [429, "rate_limit", "额度"],
    [400, "request", "模型名称"],
    [404, "request", "API 地址"],
    [500, "request", "暂时"],
  ])(
    "does not retry HTTP %i or expose an echoed credential",
    async (status, code, message) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(`provider-echo:${mockSettings.apiKey}`, { status }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const error: unknown = await makeRequest().catch((value) => value);
      expect(error).toMatchObject({
        code,
        message: expect.stringContaining(message),
      });
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw new Error("expected request error");
      expect(error.message).not.toContain(mockSettings.apiKey);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("reports network/CORS failure in Chinese without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeRequest()).rejects.toMatchObject({
      code: "network",
      message: expect.stringContaining("CORS"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not make a request after cancellation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController();
    abort.abort();
    await expect(makeRequest({ signal: abort.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request and removes listeners and timers even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const removeListener = vi.spyOn(abort.signal, "removeEventListener");
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const result = makeRequest({ signal: abort.signal });
    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await assertion;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out after 90 seconds without retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(makeRequest()).rejects.toMatchObject({
      code: "timeout",
      message: expect.stringContaining("90 秒"),
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(makeRequest()).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes listeners and timers after successful completion", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const removeListener = vi.spyOn(abort.signal, "removeEventListener");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(completionResponse({ ok: true })),
    );
    await makeRequest({ signal: abort.signal });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries failed field validation once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completionResponse([]))
      .mockResolvedValueOnce(completionResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(makeRequest()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects cancellation from a retry callback before issuing a second request", async () => {
    const abort = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(completionResponse("bad"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      makeRequest({ signal: abort.signal, onRetry: () => abort.abort() }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
