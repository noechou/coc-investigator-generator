# COC 7版调查员基础属性生成器

一个面向《克苏鲁的呼唤》第七版玩家和 KP 的纯前端静态建卡工具。它可以快速生成调查员基础属性，并继续辅助补全职业、技能、装备、人物背景细项和单页打印版角色卡。

本项目无需后端服务，下载后可以直接打开，也可以部署到 GitHub Pages、Netlify、Vercel 等静态托管平台。

## 在线体验

本项目适合部署到 GitHub Pages。部署完成后，访客可以直接在浏览器中使用；未部署时，也可以下载仓库后打开 `index.html` 或按下方方式本地运行。

## 功能特性

- 快速生成 COC 7版八项基础属性：
  - STR、CON、DEX、APP、POW：`3D6 × 5`
  - SIZ、INT、EDU：`(2D6 + 6) × 5`
  - Luck：`3D6 × 5`
- 自动计算 HP、MP、SAN、Luck、Damage Bonus、Build、MOV。
- 每次生成结果都会以卡片形式保留，方便比较多组调查员属性。
- 支持手动修改属性，并实时刷新半值、五分之一值和衍生属性。
- 支持 AI 根据人物背景生成更贴合概念的属性。
- 支持从属性卡创建完整角色卡。
- 支持 AI 智能填卡：
  - 自动选择职业
  - 自动选择职业技能
  - 根据点数预算分配技能点
  - 本地校验职业点、兴趣点、信用评级和技能限制
  - 可选补全武器、随身物品、人物背景细项和背景故事
- 支持调查员头像、本地保存、JSON 导入导出。
- 支持单页角色卡打印或保存为 PDF。
- 内置 3D 骰子效果；外部骰子资源加载失败时会自动回退到本地随机结果。

## 快速开始

如果你只是想快速建一名调查员，推荐使用 AI 流程：

1. 打开网页，点击首页的“让 AI 替你填属性”。
2. 输入年龄和一句人物背景，例如“退伍军人，回到故乡后成为码头保安”。
3. 填入 DeepSeek API Key，点击“开始演算”。
4. 从生成结果中选择满意的一张属性卡。
5. 点击进入完整角色卡，再使用“AI 智能填卡”补职业、技能、装备和人物背景细项。
6. 最后本地保存、导出 JSON，或打印 / 保存为 PDF。

不使用 AI 也可以。直接设置年龄和随机次数，点击“全部随机”，页面会按 COC 7版规则生成多张属性卡。

## AI 功能说明

默认模型为：

```text
deepseek-v4-flash · 思考深度 MEDIUM
```

AI 区域角落有一行低调的“切换模型”。点击后会切换到：

```text
deepseek-v4-pro · 思考深度 MAX
```

再次点击可切回 Flash。Flash 更适合快速生成；Pro 更适合复杂背景或希望更稳的推理时使用。

API Key 仅用于从当前浏览器向 DeepSeek API 发起请求。本项目不会将其写入 `localStorage`，也不会上传到作者服务器。由于调用发生在浏览器端，请避免使用高额度或长期主 Key，建议使用单独创建的低额度 Key。

## 本地运行

本项目是纯静态网页，不需要安装后端服务。

### 方式一：直接打开

双击打开：

```text
index.html
```

部分浏览器可能会限制本地文件的弹窗、打印页或外部资源加载，因此更推荐使用本地静态服务器。

### 方式二：使用 Python 静态服务器

在项目目录执行：

```bash
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
```

其中 `8000` 只是示例端口，可以替换为任意未被占用的端口。不建议默认使用 `80` 端口，因为它常需要管理员权限，也更容易和系统或其他服务冲突。

Windows 用户也可以运行：

```text
scripts/start-server.cmd
```

如需指定端口：

```text
scripts/start-server.cmd 8080
```

如需在局域网内访问，可自行绑定 `0.0.0.0` 并确认防火墙和网络安全设置。`scripts/optional/allow-firewall.cmd` 仅供确实需要局域网访问时手动使用，不是正常运行所必需。

## 项目结构

```text
.
├─ index.html
├─ app.js
├─ styles.css
├─ print.html
├─ print.js
├─ print.css
├─ assets/
│  ├─ coc-archive-desk.png
│  └─ default-investigator-portrait.jpg
├─ scripts/
│  ├─ start-server.cmd
│  └─ optional/
│     └─ allow-firewall.cmd
├─ README.md
├─ LICENSE
└─ .gitignore
```

## 第三方服务与资源

- AI 能力依赖 DeepSeek Chat Completions API。
- 3D 骰子效果运行时会尝试从 jsDelivr 加载 `@3d-dice/dice-box`。
- 页面素材位于 `assets/`。

## 隐私与安全

- 本项目没有后端，DeepSeek API Key 会从浏览器直接发送到 DeepSeek API。
- API Key 不会被保存到 `localStorage`。
- 本地保存的角色卡数据会写入浏览器 `localStorage`。
- 导出的 JSON 文件可能包含角色姓名、背景故事和其他自定义内容，请自行决定是否公开分享。
- 不要把真实 API Key、私人角色卡 JSON、调试日志或本地路径提交到公开仓库。

## 许可证

本项目使用 MIT License。详见 [LICENSE](LICENSE)。

## 免责声明

本项目为非官方玩家辅助工具，与 Chaosium、Call of Cthulhu 官方出版方无关联。规则计算和 AI 生成内容仅供跑团参考，实际使用请以正式规则书、守秘人裁定和团内规则为准。
