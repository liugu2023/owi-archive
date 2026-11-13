# owui-archive — Open WebUI 对话归档阅读站

把一个 Open WebUI 账号下的全部对话定时同步到本地，提供一个**只读**的阅读界面。
没有聊天输入、模型、RAG、用户管理等任何功能，只做归档和阅读。

## 功能

- **自动同步**：每 N 分钟通过 Open WebUI 的 HTTP API 增量拉取（只下载 `updated_at` 变化的对话），也可在页面左下角手动触发
- **只增不删**：源站删除的对话在归档里保留，并标记「源站已删除」；同步失败不会影响已有数据
- **完整保留**：原始 JSON 全量入库（包括所有重新生成的分支）、文件夹、置顶、已归档状态、标签、图片与附件
- **阅读**：Markdown、代码高亮、LaTeX 公式、思考过程 / 工具调用折叠、分支切换、引用来源、深浅色、手机端、打印
- **全文搜索**：SQLite FTS5（trigram，支持中文），标题 + 正文 + 思考内容
- **导出**：单个对话导出 Markdown 或原始 JSON（JSON 可重新导入 Open WebUI）
- **访问控制**：单一密码，登录后 30 天有效

## 部署

需要 Node.js ≥ 22.13（使用内置的 `node:sqlite`，无原生依赖）。

```bash
npm install
cp .env.example .env    # 填 OPENWEBUI_URL / OPENWEBUI_API_KEY / ARCHIVE_PASSWORD
npm start               # 默认 http://127.0.0.1:8090
```

API Key：Open WebUI「设置 → 账号 → API 密钥」。管理员需要在后台开启 API Key 功能；
如果开启了「API Key 端点限制」，要放行 `/api/v1/chats`、`/api/v1/folders`、`/api/v1/files`。

常驻运行：

```bash
sudo cp owui-archive.service /etc/systemd/system/
sudo systemctl enable --now owui-archive
```

默认只监听 `127.0.0.1`，适合挂在 Cloudflare Tunnel / Nginx 后面；要直接对外，把 `.env` 里的 `HOST` 改成 `0.0.0.0`。

## 数据

全部在 `data/`（可用 `DATA_DIR` 修改）：`archive.db` 是 SQLite 数据库，`files/` 是下载的附件。备份这个目录即可。

## 同步逻辑

每轮同步：

1. 拉取文件夹列表
2. 遍历 主列表 / 每个文件夹 / 已归档 / 置顶 四类列表（只有 id 和时间，很轻）
3. `updated_at` 与本地不同的对话才拉取全文；文件夹归属、置顶、归档状态每轮都按列表校正
4. 本地有、源站列表里没有的 → 标记「源站已删除」，不删除
5. 下载新对话引用的附件（单个上限 `MAX_FILE_MB`）

任何一步列表请求失败，整轮放弃，不会误标删除。

## 测试

```bash
npm test    # 起一个假的 Open WebUI 上游，对真实服务跑端到端测试
```
