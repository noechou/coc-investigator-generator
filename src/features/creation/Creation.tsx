import { useEffect, useRef, useState } from "react";
import type {
  AiSettings,
  Character,
  CreateOptions,
  Method,
} from "../../domain/types";
import { createCharacter } from "../../domain/rules";
import { generateCharacter } from "../../ai/generateCharacter";
import { ART } from "../../components/art";
import { Field, Icon, Modal } from "../../components/ui";

export default function Creation({
  settings,
  onSettings,
  onClose,
  onCreated,
}: {
  settings: AiSettings;
  onSettings: () => void;
  onClose: () => void;
  onCreated: (c: Character) => void;
}) {
  const [method, setMethod] = useState<Method>("concept");
  const [concept, setConcept] = useState("");
  const [age, setAge] = useState(28);
  const [era, setEra] = useState("1920s");
  const [cap, setCap] = useState(75);
  const [ageRules, setAgeRules] = useState(true);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const options: CreateOptions = {
    method,
    concept: concept.trim(),
    age,
    era,
    skillCap: cap,
    ageAdjustments: ageRules,
  };
  async function start() {
    setError("");
    if (!Number.isInteger(age) || age < 15 || age > 89) {
      setError("请输入 15–89 岁；其他年龄可在建卡后作为团内设定调整。");
      return;
    }
    if (method === "concept" && concept.trim().length < 4) {
      setError("再多写一点人物概念，例如职业、经历或正在寻找什么。");
      return;
    }
    if (method === "concept" && (!settings.apiKey || !settings.model)) {
      setError("请先配置 AI 服务和密钥，密钥仅留在当前会话。");
      return;
    }
    if (method !== "concept") {
      onCreated(createCharacter(options));
      return;
    }
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRunning(true);
    try {
      const c = await generateCharacter(
        options,
        settings,
        setStage,
        ctrl.signal,
      );
      if (!ctrl.signal.aborted) onCreated(c);
    } catch (err) {
      if (!ctrl.signal.aborted)
        setError(err instanceof Error ? err.message : "生成没有完成，请重试。");
    } finally {
      if (controller.current === ctrl) {
        setRunning(false);
        controller.current = null;
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setStage("");
  }
  return (
    <Modal
      title="创建调查员"
      onClose={() => {
        cancel();
        onClose();
      }}
      wide
    >
      <div className="creation-layout">
        <aside className="creation-aside">
          <img
            className="creation-desk-art"
            src={ART.desk}
            alt="灯下摆着旧照片、笔记本和放大镜的调查桌"
            width={640}
            height={960}
          />
          <div className="creation-symbol">
            <Icon name="spark" size={38} />
          </div>
          <h3>
            先有一个人，
            <br />
            再有一份档案。
          </h3>
          <p>
            不必把设定想得很完整。
            <br />
            一个职业，一段经历，
            <br />
            或一个尚未解开的疑问。
          </p>
          <span className="creation-aside-note">
            生成结果可以自由修改，
            <br />
            由你决定这个人是谁。
          </span>
        </aside>
        <div className="creation-form">
          <div className="segmented" aria-label="创建方式">
            {[
              ["concept", "AI 人设生成"],
              ["random", "规则掷骰"],
              ["manual", "手动建卡"],
            ].map(([value, label]) => (
              <button
                className={method === value ? "active" : ""}
                key={value}
                onClick={() => setMethod(value as Method)}
                disabled={running}
              >
                {label}
              </button>
            ))}
          </div>
          <Field
            label={
              method === "concept"
                ? "你想扮演怎样的调查员？"
                : "人物概念（选填）"
            }
          >
            <textarea
              autoFocus
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              rows={5}
              disabled={running}
              placeholder="一位回到阿卡姆的战地医生。每周四，他都会收到一封来自失踪战友的信。"
              maxLength={5000}
            />
          </Field>
          <div className="form-grid">
            <Field label="年龄">
              <input
                type="number"
                min={15}
                max={89}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                disabled={running}
              />
            </Field>
            <Field label="故事的年代">
              <select
                value={era}
                onChange={(e) => setEra(e.target.value)}
                disabled={running}
              >
                <option>1920s</option>
                <option>现代</option>
                <option>其他</option>
              </select>
            </Field>
          </div>
          <details className="creation-advanced">
            <summary>建卡规则</summary>
            <div className="form-grid">
              <Field label="初始技能上限">
                <select
                  value={cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                  disabled={running}
                >
                  <option value={75}>75（默认）</option>
                  <option value={80}>80（团内规则）</option>
                  <option value={90}>90（团内规则）</option>
                  <option value={99}>99（团内规则）</option>
                </select>
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={ageRules}
                  onChange={(e) => setAgeRules(e.target.checked)}
                  disabled={running}
                />
                <span>应用 7 版年龄修正</span>
              </label>
            </div>
          </details>
          <p className="help-text">
            {method === "concept"
              ? "属性按人物概念生成，并非随机骰点。职业点和衍生值由规则计算，完成后可审阅整张卡。"
              : method === "random"
                ? "由程序按 7 版掷出基础属性，记录年龄修正，再由你选择职业和分配技能。"
                : "从空白角色卡开始，逐项设置属性、职业与背景。"}
          </p>
          {method === "concept" && (
            <button
              className="provider-summary"
              onClick={onSettings}
              disabled={running}
            >
              <Icon name="settings" size={16} />
              <span>
                {settings.model || "设置 AI 服务"}
                <small>
                  {settings.apiKey ? "已配置会话密钥" : "尚未配置密钥"}
                </small>
              </span>
              <Icon name="edit" size={15} />
            </button>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {running && (
            <div className="generation-progress" role="status">
              <span className="loading-mark" />
              <div>
                <strong>{stage || "正在准备生成…"}</strong>
                <p>可随时取消，不会改动已有角色。</p>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="button" onClick={running ? cancel : onClose}>
              {running ? "取消生成" : "取消"}
            </button>
            <button
              className="button primary"
              onClick={start}
              disabled={running}
            >
              <Icon
                name={
                  method === "concept"
                    ? "spark"
                    : method === "random"
                      ? "dice"
                      : "plus"
                }
              />
              {running
                ? "正在生成…"
                : method === "concept"
                  ? "生成完整角色草稿"
                  : method === "random"
                    ? "掷骰并开始建卡"
                    : "开始手动建卡"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
