import type { Character } from "../../domain/types";
import { ATTRIBUTE_KEYS, BACKSTORY_KEYS } from "../../domain/types";
import { ATTRIBUTE_LABELS, BACKSTORY_LABELS } from "../../domain/catalogs";
import {
  getDerived,
  occupationName,
  skillTotal,
  weaponValue,
  getCredit,
} from "../../domain/rules";
import { Icon } from "../../components/ui";

export default function PrintSheet({
  character: c,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  const d = getDerived(c);
  return (
    <div className="print-view">
      <div className="print-controls">
        <button className="button" onClick={onClose}>
          <Icon name="back" size={17} />
          返回档案
        </button>
        <p>核心角色卡与背景续页。长内容会自然分页。</p>
        <button className="button primary" onClick={() => window.print()}>
          <Icon name="print" size={18} />
          打印 / 保存 PDF
        </button>
      </div>
      <article className="print-document">
        <header className="print-document-header">
          <div>
            <span>调查员档案 / COC 7 版</span>
            <h1>{c.name || "未命名调查员"}</h1>
            <p>
              {occupationName(c)} / {c.age} 岁 / {c.era}
            </p>
          </div>
          {c.portrait && <img src={c.portrait} alt="调查员头像" />}
        </header>
        <p className="print-concept">{c.concept}</p>
        <div className="print-identity">
          <span>性别：{c.gender || "—"}</span>
          <span>现居地：{c.residence || "—"}</span>
          <span>出生地：{c.birthplace || "—"}</span>
        </div>
        <div className="print-attributes">
          {ATTRIBUTE_KEYS.map((k) => (
            <div key={k}>
              <span>
                {ATTRIBUTE_LABELS[k]} {k.toUpperCase()}
              </span>
              <strong>{c.attrs[k]}</strong>
              <small>
                {Math.floor(c.attrs[k] / 2)} / {Math.floor(c.attrs[k] / 5)}
              </small>
            </div>
          ))}
        </div>
        <div className="print-status">
          <span>
            生命{" "}
            <b>
              {c.resources.hp} / {d.hp}
            </b>
          </span>
          <span>
            魔法{" "}
            <b>
              {c.resources.mp} / {d.mp}
            </b>
          </span>
          <span>
            理智{" "}
            <b>
              {c.resources.san} / {d.sanMax}
            </b>
          </span>
          <span>
            幸运 <b>{c.resources.luck}</b>
          </span>
          <span>
            DB <b>{d.db}</b>
          </span>
          <span>
            体格 <b>{d.build}</b>
          </span>
          <span>
            移动 <b>{d.mov}</b>
          </span>
        </div>
        <section>
          <h2>
            技能 <small>常规 / 困难 / 极难；＊为职业技能</small>
          </h2>
          <div className="print-skills">
            {c.skills.map((s) => (
              <div key={s.id}>
                <span>
                  {s.occupationSelected ? "＊" : ""}
                  {s.name}
                </span>
                <b>{skillTotal(s, c)}</b>
                <small>
                  {Math.floor(skillTotal(s, c) / 2)} /{" "}
                  {Math.floor(skillTotal(s, c) / 5)}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>武器</h2>
          <table className="print-weapon-table">
            <thead>
              <tr>
                {["武器", "技能", "成功率", "伤害", "射程", "弹药", "故障"].map(
                  (t) => (
                    <th key={t}>{t}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {c.weapons.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>{w.skillName}</td>
                  <td>{weaponValue(w, c)}</td>
                  <td>{w.damage}</td>
                  <td>{w.range}</td>
                  <td>{w.ammo}</td>
                  <td>{w.malfunction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>随身物品与资产</h2>
          <p className="prose">{c.possessions || "未记录"}</p>
          <p>
            信用 {getCredit(c)}　现金 {c.assetCash || "—"}　消费水平{" "}
            {c.assetSpending || "—"}
          </p>
          <p className="prose">{c.assetDetails}</p>
        </section>
        <section className="print-background">
          <h2>人物背景</h2>
          <div className="print-background-grid">
            {BACKSTORY_KEYS.filter((k) => c.backstory[k]).map((k) => (
              <article key={k}>
                <h3>{BACKSTORY_LABELS[k]}</h3>
                <p className="prose">{c.backstory[k]}</p>
              </article>
            ))}
          </div>
          <p className="prose">{c.story}</p>
        </section>
        {c.notes && (
          <section>
            <h2>调查笔记</h2>
            <p className="prose">{c.notes}</p>
          </section>
        )}
        {c.rules.houseRules && (
          <section>
            <h2>团内规则说明</h2>
            <p className="prose">{c.rules.houseRules}</p>
          </section>
        )}
        <footer>
          COC 调查员档案 /{" "}
          {c.method === "concept"
            ? "AI 人设生成"
            : c.method === "random"
              ? "规则掷骰"
              : c.method === "legacy"
                ? "旧版迁入"
                : "手动建卡"}{" "}
          / 非官方玩家辅助工具
        </footer>
      </article>
    </div>
  );
}
