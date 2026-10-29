import { useState } from "react";
import type { Character } from "../../domain/types";
import { getCredit, getDerived, occupationName } from "../../domain/rules";
import { ART } from "../../components/art";
import { Icon, Portrait, formatDate } from "../../components/ui";

interface Props {
  characters: Character[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onBackup: () => void;
  onExample: () => void;
  onLegacy?: () => void;
}
export default function Library({
  characters,
  loading,
  onOpen,
  onCreate,
  onImport,
  onBackup,
  onExample,
  onLegacy,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const filtered = characters.filter(
    (c) =>
      (filter === "archived" ? c.archived : !c.archived) &&
      (filter !== "draft" || c.phase === "draft") &&
      `${c.name} ${c.concept} ${occupationName(c)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const active = characters.filter((c) => !c.archived);
  const latest = active.find((c) => c.phase === "ready") || active[0];
  return (
    <main className="library page-main">
      <header className="page-title-row">
        <div>
          <span className="section-context">你的角色，都在这里</span>
          <h1>调查员档案</h1>
        </div>
        <div className="header-actions">
          <button className="button quiet" onClick={onImport}>
            <Icon name="upload" />
            导入档案
          </button>
          <button className="button primary" onClick={onCreate}>
            <Icon name="plus" />
            新建调查员
          </button>
        </div>
      </header>
      {onLegacy && (
        <div className="notice">
          <Icon name="archive" />
          <p>发现旧版浏览器存档，可以保留原件并迁入新版。</p>
          <button className="button small" onClick={onLegacy}>
            导入旧存档
          </button>
        </div>
      )}
      <section className="library-intro">
        <div className="intro-copy">
          <span className="file-stamp">调查员事务所</span>
          <h2>
            每个人物，
            <br />
            都有未完的故事。
          </h2>
          <p>
            从一句想法开始，或翻开已有档案。
            <br className="desktop-only" />
            准备好下一次调查。
          </p>
          <button className="text-link" onClick={onCreate}>
            创建一位新调查员 <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="archive-scene">
          <img
            src={ART.libraryHero}
            alt="深夜的密斯卡托尼克大学禁书档案室，台灯照着一份盖了红章的卷宗"
            width={1920}
            height={1280}
            fetchPriority="high"
          />
          <span className="archive-scene-rain" aria-hidden="true" />
          <div className="archive-scene-caption">
            <span>密斯卡托尼克大学 · 限阅书库</span>
            <small>有些卷宗，翻开后就合不上了。</small>
          </div>
        </div>
        {latest ? (
          <button className="recent-dossier" onClick={() => onOpen(latest.id)}>
            <img className="dossier-tape" src={ART.tape} alt="" />
            <div className="recent-meta">
              <span>继续上次调查</span>
              <span>{formatDate(latest.updatedAt)}</span>
            </div>
            <div className="recent-body">
              <Portrait name={latest.name} src={latest.portrait} />
              <div>
                <h3>{latest.name || "未命名调查员"}</h3>
                <p>
                  {occupationName(latest)} / {latest.age} 岁
                </p>
                <span className="recent-concept">
                  {latest.concept || latest.story || "档案仍在等待补全"}
                </span>
              </div>
            </div>
            <div className="recent-footer">
              <span className="status-dot" />
              {latest.phase === "draft" ? "继续完成角色草稿" : "打开跑团面板"}
              <Icon name="arrow" size={18} />
            </div>
          </button>
        ) : (
          <div className="intro-guide">
            <Icon name="book" size={36} />
            <h3>
              你带来想法，
              <br />
              我们整理成档案。
            </h3>
            <p>
              AI 生成人物草稿，规则自动核算。
              <br />
              也可以从骰子或空白角色卡开始。
            </p>
            <button className="button" onClick={onExample}>
              先看看示例角色
            </button>
          </div>
        )}
      </section>
      <div className="library-toolbar">
        <div className="tabs" aria-label="档案分类">
          {[
            ["active", "全部档案"],
            ["draft", "建卡草稿"],
            ["archived", "已归档"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "active" && <span>{active.length}</span>}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名、职业、人物概念"
            aria-label="搜索角色档案"
          />
        </label>
      </div>
      {loading ? (
        <div className="empty-state">
          <span className="loading-mark" />
          <p>正在打开档案柜…</p>
        </div>
      ) : filtered.length ? (
        <div className="dossier-grid">
          {filtered.map((c) => {
            const d = getDerived(c);
            return (
              <button
                className="dossier-card"
                key={c.id}
                onClick={() => onOpen(c.id)}
              >
                <div className="dossier-card-head">
                  <span className="file-ref">
                    档案 {c.id.slice(0, 6).toUpperCase()}
                  </span>
                  <span
                    className={`badge ${c.phase === "draft" ? "badge-muted" : ""}`}
                  >
                    {c.archived
                      ? "已归档"
                      : c.phase === "draft"
                        ? "草稿"
                        : "调查中"}
                  </span>
                </div>
                <div className="dossier-card-body">
                  <Portrait name={c.name} src={c.portrait} />
                  <div>
                    <h2>{c.name || "未命名调查员"}</h2>
                    <p>{occupationName(c)}</p>
                    <small>
                      {c.age} 岁 / {c.era}
                    </small>
                  </div>
                </div>
                <p className="dossier-excerpt">
                  {c.concept ||
                    c.story ||
                    "尚未记录人物概念。打开档案，补全这个人物。"}
                </p>
                <div className="dossier-card-state">
                  <span>
                    生命{" "}
                    <b>
                      {c.resources.hp}
                      <i> / {d.hp}</i>
                    </b>
                  </span>
                  <span>
                    理智 <b>{c.resources.san}</b>
                  </span>
                  <span>
                    信用 <b>{getCredit(c)}</b>
                  </span>
                </div>
                <footer>
                  <span>{formatDate(c.updatedAt)} 更新</span>
                  <Icon name="arrow" size={17} />
                </footer>
              </button>
            );
          })}
          <button className="dossier-card new-dossier" onClick={onCreate}>
            <span className="new-dossier-icon">
              <Icon name="plus" size={26} />
            </span>
            <h2>下一位调查员</h2>
            <p>一个念头，一份新档案。</p>
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <img className="empty-art" src={ART.emptyTome} alt="" />
          <h2>
            {query
              ? "没有找到这份档案"
              : filter === "archived"
                ? "还没有归档的角色"
                : filter === "draft"
                  ? "没有未完成的草稿"
                  : "第一份档案，等你开启"}
          </h2>
          <p>
            {query
              ? "试试姓名、职业或人物概念中的其他词。"
              : "创建调查员，或导入一张已有的角色卡。"}
          </p>
          <div className="inline-actions">
            <button className="button primary" onClick={onCreate}>
              新建调查员
            </button>
            <button className="button" onClick={onExample}>
              查看示例
            </button>
          </div>
        </div>
      )}
      <img className="ornament-divider" src={ART.divider} alt="" />
      <footer className="library-footer">
        <p>
          <Icon name="archive" size={16} />
          档案保存在当前浏览器，记得定期备份。
        </p>
        <button className="text-link" onClick={onBackup}>
          备份全部档案 <Icon name="download" size={16} />
        </button>
      </footer>
    </main>
  );
}
