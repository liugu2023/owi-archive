// Open WebUI 对话归档阅读站 —— 单文件服务端：定时同步 + SQLite 存储 + 只读 API + 静态页面
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');

// ───────────────────────── 配置 ─────────────────────────
const env = process.env;
const CFG = {
	host: env.HOST || '127.0.0.1',
	port: Number(env.PORT || 8090),
	dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, 'data')),
	upstream: (env.OPENWEBUI_URL || '').replace(/\/+$/, ''),
	apiKey: env.OPENWEBUI_API_KEY || '',
	password: env.ARCHIVE_PASSWORD || '',
	intervalMin: Math.max(1, Number(env.SYNC_INTERVAL_MINUTES || 15)),
	downloadFiles: env.SYNC_FILES !== '0',
	maxFileBytes: Number(env.MAX_FILE_MB || 50) * 1024 * 1024,
	requestTimeoutMs: Number(env.REQUEST_TIMEOUT_SECONDS || 60) * 1000
};

if (!CFG.password) {
	console.error('未设置 ARCHIVE_PASSWORD，拒绝启动。请在 .env 中设置访问密码。');
	process.exit(1);
}

fs.mkdirSync(path.join(CFG.dataDir, 'files'), { recursive: true });

// ───────────────────────── 数据库 ─────────────────────────
const db = new DatabaseSync(path.join(CFG.dataDir, 'archive.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS chats (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	archived INTEGER NOT NULL DEFAULT 0,
	pinned INTEGER NOT NULL DEFAULT 0,
	folder_id TEXT,
	tags TEXT NOT NULL DEFAULT '[]',
	models TEXT NOT NULL DEFAULT '[]',
	msg_count INTEGER NOT NULL DEFAULT 0,
	data TEXT NOT NULL,
	synced_at INTEGER NOT NULL,
	missing_upstream INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated_at DESC);
CREATE TABLE IF NOT EXISTS folders (
	id TEXT PRIMARY KEY,
	parent_id TEXT,
	name TEXT NOT NULL,
	missing_upstream INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS files (
	id TEXT PRIMARY KEY,
	name TEXT,
	content_type TEXT,
	size INTEGER,
	status TEXT NOT NULL,
	fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
-- 阅读位置（跨设备续读）：归档内容本身只读，这是唯一由阅读端写入的数据
-- 收藏的消息：摘录由阅读端在收藏时提供，列表页不必再去翻原始 JSON
CREATE TABLE IF NOT EXISTS stars (
	chat_id TEXT NOT NULL,
	message_id TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT '',
	excerpt TEXT NOT NULL DEFAULT '',
	t INTEGER NOT NULL,
	PRIMARY KEY (chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS reading (
	chat_id TEXT PRIMARY KEY,
	message_id TEXT,
	rel REAL NOT NULL DEFAULT 0,
	pct INTEGER NOT NULL DEFAULT 0,
	t INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS msg_fts USING fts5(
	chat_id UNINDEXED, message_id UNINDEXED, role UNINDEXED, text, tokenize='trigram'
);
`);

const q = {
	getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
	setMeta: db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
	chatIndex: db.prepare('SELECT id, updated_at, archived, pinned, folder_id, missing_upstream FROM chats'),
	upsertChat: db.prepare(`INSERT INTO chats(id, title, created_at, updated_at, archived, pinned, folder_id, tags, models, msg_count, data, synced_at, missing_upstream)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
		ON CONFLICT(id) DO UPDATE SET title=excluded.title, created_at=excluded.created_at, updated_at=excluded.updated_at,
			archived=excluded.archived, pinned=excluded.pinned, folder_id=excluded.folder_id, tags=excluded.tags, models=excluded.models,
			msg_count=excluded.msg_count, data=excluded.data, synced_at=excluded.synced_at, missing_upstream=0`),
	setFlags: db.prepare('UPDATE chats SET archived = ?, pinned = ?, folder_id = ?, missing_upstream = 0 WHERE id = ?'),
	setMissing: db.prepare('UPDATE chats SET missing_upstream = 1 WHERE id = ?'),
	delFts: db.prepare('DELETE FROM msg_fts WHERE chat_id = ?'),
	addFts: db.prepare('INSERT INTO msg_fts(chat_id, message_id, role, text) VALUES(?, ?, ?, ?)'),
	upsertFolder: db.prepare(`INSERT INTO folders(id, parent_id, name, missing_upstream) VALUES(?, ?, ?, 0)
		ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id, name=excluded.name, missing_upstream=0`),
	folderIds: db.prepare('SELECT id FROM folders'),
	setFolderMissing: db.prepare('UPDATE folders SET missing_upstream = 1 WHERE id = ?'),
	getFile: db.prepare('SELECT * FROM files WHERE id = ?'),
	upsertFile: db.prepare(`INSERT INTO files(id, name, content_type, size, status, fetched_at) VALUES(?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name, content_type=excluded.content_type, size=excluded.size, status=excluded.status, fetched_at=excluded.fetched_at`),
	listChats: db.prepare(`SELECT id, title, created_at, updated_at, archived, pinned, folder_id, tags, models, msg_count, missing_upstream
		FROM chats ORDER BY updated_at DESC`),
	listFolders: db.prepare('SELECT id, parent_id, name, missing_upstream FROM folders ORDER BY name'),
	getChat: db.prepare('SELECT * FROM chats WHERE id = ?'),
	counts: db.prepare('SELECT COUNT(*) AS chats, COALESCE(SUM(msg_count), 0) AS messages FROM chats'),
	hasChat: db.prepare('SELECT 1 FROM chats WHERE id = ?'),
	listStars: db.prepare('SELECT chat_id, message_id, role, excerpt, t FROM stars ORDER BY t DESC LIMIT 2000'),
	putStar: db.prepare(`INSERT INTO stars(chat_id, message_id, role, excerpt, t) VALUES(?, ?, ?, ?, ?)
		ON CONFLICT(chat_id, message_id) DO UPDATE SET role=excluded.role, excerpt=excluded.excerpt`),
	delStar: db.prepare('DELETE FROM stars WHERE chat_id = ? AND message_id = ?'),
	countStars: db.prepare('SELECT COUNT(*) AS n FROM stars'),
	statsIndex: db.prepare('SELECT id, updated_at FROM chats'),
	statsData: db.prepare('SELECT data FROM chats WHERE id = ?'),
	allChatData: db.prepare('SELECT data FROM chats ORDER BY updated_at DESC'),
	getReading: db.prepare('SELECT message_id, rel, pct, t FROM reading WHERE chat_id = ?'),
	listReading: db.prepare('SELECT chat_id, message_id, rel, pct, t FROM reading ORDER BY t DESC LIMIT ?'),
	putReading: db.prepare(`INSERT INTO reading(chat_id, message_id, rel, pct, t) VALUES(?, ?, ?, ?, ?)
		ON CONFLICT(chat_id) DO UPDATE SET message_id=excluded.message_id, rel=excluded.rel, pct=excluded.pct, t=excluded.t`),
	pruneReading: db.prepare('DELETE FROM reading WHERE chat_id NOT IN (SELECT chat_id FROM reading ORDER BY t DESC LIMIT ?)')
};
const READING_KEEP = 500; // 服务器上最多保留这么多个对话的阅读位置
const READING_SEND = 200; // 每次下发给浏览器的数量（最近读过的）

const getMeta = (k, d = null) => q.getMeta.get(k)?.value ?? d;
const setMeta = (k, v) => q.setMeta.run(k, String(v));

let SECRET = getMeta('cookie_secret');
if (!SECRET) {
	SECRET = crypto.randomBytes(32).toString('hex');
	setMeta('cookie_secret', SECRET);
}

// ───────────────────────── 对话解析 ─────────────────────────
function textOfContent(content) {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((p) => (typeof p === 'string' ? p : (p?.text ?? '')))
			.filter(Boolean)
			.join('\n');
	}
	return '';
}

function messagesOf(chatBody) {
	const map = chatBody?.history?.messages;
	if (map && typeof map === 'object' && Object.keys(map).length) return Object.values(map);
	return Array.isArray(chatBody?.messages) ? chatBody.messages : [];
}

function searchableText(msg) {
	const parts = [textOfContent(msg.content)];
	if (Array.isArray(msg.output)) {
		for (const item of msg.output) {
			if (item?.type === 'message') continue; // 已包含在 content 中
			if (item?.type === 'reasoning') parts.push(textOfContent(item.summary?.length ? item.summary : item.content));
		}
	}
	// 去掉内联 base64，避免索引膨胀
	return parts
		.join('\n')
		.replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, '')
		.trim();
}

// ───────────────────────── 统计：字数与 token ─────────────────────────
// 字数按中文习惯：每个汉字（含假名、谚文）算 1 个字，一串连续的字母 / 数字算 1 个词，标点和空白不计
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu;
function measure(text) {
	if (!text) return { cjk: 0, words: 0, other: 0 };
	const cjk = (text.match(CJK_RE) || []).length;
	const rest = text.replace(CJK_RE, ' ');
	const words = (rest.match(/[\p{L}\p{N}]+(?:['’._-][\p{L}\p{N}]+)*/gu) || []).length;
	const other = rest.replace(/\s+/g, ' ').length; // 非汉字部分的字符数，估算 token 用
	return { cjk, words, other };
}
// 上游没有返回用量时，按模型所属的分词器家族估算：[匹配规则, 每个汉字约合多少 token, 每个其他字符约合多少 token]。
// 这些系数是粗略的经验值，不是真实分词结果；觉得偏了就改这张表。排在前面的规则优先
const TOKEN_FAMILIES = [
	[/gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|chatgpt|\bo[134](-|$)/i, 0.8, 0.25],
	[/gpt-|davinci|text-embedding/i, 1.2, 0.25],
	[/claude/i, 1.2, 0.29],
	[/gemini|gemma|palm/i, 0.7, 0.25],
	[/deepseek/i, 0.6, 0.3],
	[/qwen|tongyi|glm|zhipu|moonshot|kimi|doubao|ernie|wenxin|hunyuan|yi-|minimax|abab|spark|baichuan/i, 0.65, 0.27],
	[/grok/i, 0.8, 0.25],
	[/llama|mistral|mixtral|phi-|command-r/i, 1.1, 0.27]
];
const TOKEN_DEFAULT = [1, 0.27];
const familyOf = (model) => {
	const f = TOKEN_FAMILIES.find(([re]) => re.test(model));
	return f ? [f[1], f[2]] : TOKEN_DEFAULT;
};
const estTokens = (ms, fam) => ms.cjk * fam[0] + ms.other * fam[1];
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
// Open WebUI 原样保存上游的 usage，字段名因上游而异（OpenAI / Anthropic / Ollama）
function usageOf(m) {
	const u = m.usage || m.info?.usage || m.info;
	if (!u || typeof u !== 'object') return null;
	const input = num(u.prompt_tokens) ?? num(u.input_tokens) ?? num(u.prompt_eval_count);
	const output = num(u.completion_tokens) ?? num(u.output_tokens) ?? num(u.eval_count);
	return input == null && output == null ? null : { input, output };
}
function reasoningText(m) {
	if (!Array.isArray(m.output)) return '';
	return m.output
		.filter((it) => it?.type === 'reasoning')
		.map((it) => textOfContent(it.summary?.length ? it.summary : it.content))
		.join('\n');
}
// 一个对话的统计。所有分支都算：重新生成的回答同样写过字、花过 token
function chatStats(body) {
	let map = body?.history?.messages;
	if (!map || !Object.keys(map).length) {
		map = {};
		let prev = null;
		for (const [i, m] of (body?.messages || []).entries()) {
			const id = String(m.id ?? `m${i}`);
			map[id] = { ...m, parentId: m.parentId !== undefined ? m.parentId : prev };
			prev = id;
		}
	}
	const ms = new Map();
	for (const [id, m] of Object.entries(map)) ms.set(id, measure(textOfContent(m.content).replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, '')));
	// 某条消息之前的全部上文（沿父消息一路往上），即生成它时发给模型的内容
	const ctx = new Map();
	const context = (id) => {
		const chain = [];
		for (let cur = id; cur != null && map[cur] && !ctx.has(cur) && chain.length < 100000; cur = map[cur].parentId) chain.push(cur);
		for (const cur of chain.reverse()) {
			const p = map[cur].parentId;
			const base = p != null && ctx.has(p) ? ctx.get(p) : { cjk: 0, other: 0 };
			const own = p != null && ms.has(p) ? ms.get(p) : { cjk: 0, other: 0 };
			ctx.set(cur, { cjk: base.cjk + own.cjk, other: base.other + own.other });
		}
		return ctx.get(id) || { cjk: 0, other: 0 };
	};
	const out = { user: { chars: 0, messages: 0 }, models: {} };
	for (const [id, m] of Object.entries(map)) {
		const own = ms.get(id);
		const chars = own.cjk + own.words;
		if (m.role === 'user') {
			out.user.chars += chars;
			out.user.messages++;
			continue;
		}
		if (m.role !== 'assistant') continue;
		const name = typeof (m.modelName || m.model) === 'string' ? m.modelName || m.model : '未知模型';
		const a = (out.models[name] ||= { chars: 0, messages: 0, input: 0, output: 0, reported: 0 });
		a.chars += chars;
		a.messages++;
		const fam = familyOf(`${m.model || ''} ${m.modelName || ''}`);
		const u = usageOf(m);
		if (u) a.reported++;
		// 输出包含思考内容；上游给了数就用上游的，缺哪项估哪项
		const think = measure(reasoningText(m));
		a.output += u?.output ?? estTokens({ cjk: own.cjk + think.cjk, other: own.other + think.other }, fam);
		a.input += u?.input ?? estTokens(context(id), fam);
	}
	return out;
}
const statsCache = new Map(); // chat id -> { updated_at, stats }
function archiveStats() {
	const seen = new Set();
	const total = { user: { chars: 0, messages: 0 }, models: {} };
	// 只有新的、改过的对话才去读正文，其余用上次算好的
	for (const row of q.statsIndex.all()) {
		seen.add(row.id);
		let c = statsCache.get(row.id);
		if (!c || c.updated_at !== row.updated_at) {
			let st;
			try {
				st = chatStats(JSON.parse(q.statsData.get(row.id).data).chat);
			} catch {
				st = { user: { chars: 0, messages: 0 }, models: {} };
			}
			statsCache.set(row.id, (c = { updated_at: row.updated_at, stats: st }));
		}
		total.user.chars += c.stats.user.chars;
		total.user.messages += c.stats.user.messages;
		for (const [name, a] of Object.entries(c.stats.models)) {
			const t = (total.models[name] ||= { chats: 0, chars: 0, messages: 0, input: 0, output: 0, reported: 0 });
			t.chats++;
			for (const k of ['chars', 'messages', 'input', 'output', 'reported']) t[k] += a[k];
		}
	}
	for (const id of statsCache.keys()) if (!seen.has(id)) statsCache.delete(id);
	const models = Object.entries(total.models)
		.map(([name, a]) => ({ name, ...a, input: Math.round(a.input), output: Math.round(a.output) }))
		.sort((a, b) => b.output + b.input - (a.output + a.input));
	return { user: total.user, models };
}

const FILE_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const FILE_URL_RE = /\/api\/v1\/files\/([0-9a-fA-F-]{36})(?:\/content)?/g;

function fileRefsOf(messages) {
	const refs = new Map(); // id -> name
	for (const m of messages) {
		for (const f of Array.isArray(m.files) ? m.files : []) {
			const candidates = [f?.id, f?.file?.id, f?.url];
			for (const c of candidates) {
				if (typeof c !== 'string') continue;
				if (FILE_ID_RE.test(c)) refs.set(c, f?.name || f?.file?.filename || refs.get(c) || null);
				else for (const mt of c.matchAll(FILE_URL_RE)) refs.set(mt[1], f?.name || refs.get(mt[1]) || null);
			}
		}
		const text = textOfContent(m.content);
		if (text.includes('/api/v1/files/')) {
			for (const mt of text.matchAll(FILE_URL_RE)) if (!refs.has(mt[1])) refs.set(mt[1], null);
		}
	}
	return refs;
}

function storeChat(remote, flags) {
	const body = remote.chat || {};
	const messages = messagesOf(body);
	const models = [...new Set(messages.map((m) => m.modelName || m.model).filter((x) => typeof x === 'string'))];
	const tags = Array.isArray(remote.meta?.tags) ? remote.meta.tags : [];
	const record = {
		id: remote.id,
		title: remote.title || body.title || '未命名对话',
		created_at: remote.created_at,
		updated_at: remote.updated_at,
		share_id: remote.share_id ?? null,
		meta: remote.meta ?? {},
		chat: body
	};
	db.exec('BEGIN');
	try {
		q.upsertChat.run(
			remote.id,
			record.title,
			Number(remote.created_at) || 0,
			Number(remote.updated_at) || 0,
			(flags.archived ?? remote.archived) ? 1 : 0,
			(flags.pinned ?? remote.pinned) ? 1 : 0,
			flags.folder_id !== undefined ? flags.folder_id : (remote.folder_id ?? null),
			JSON.stringify(tags),
			JSON.stringify(models),
			messages.length,
			JSON.stringify(record),
			Math.floor(Date.now() / 1000)
		);
		q.delFts.run(remote.id);
		for (const m of messages) {
			const text = searchableText(m);
			if (text) q.addFts.run(remote.id, String(m.id ?? ''), String(m.role ?? ''), text);
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return fileRefsOf(messages);
}

// ───────────────────────── 上游请求 ─────────────────────────
async function upstreamFetch(pathname, { raw = false } = {}) {
	let lastErr;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(CFG.upstream + pathname, {
				headers: { Authorization: `Bearer ${CFG.apiKey}`, Accept: raw ? '*/*' : 'application/json' },
				signal: AbortSignal.timeout(CFG.requestTimeoutMs)
			});
			if (res.status >= 500 || res.status === 429) {
				await res.body?.cancel();
				throw new Error(`HTTP ${res.status}`);
			}
			if (raw) return res;
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				const err = new Error(`HTTP ${res.status} ${pathname} ${text.slice(0, 200)}`);
				err.status = res.status;
				err.permanent = true;
				throw err;
			}
			return await res.json();
		} catch (e) {
			lastErr = e;
			if (e.permanent) break;
			await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
		}
	}
	throw lastErr;
}

async function walkPages(makePath, pageSize) {
	const out = [];
	const seen = new Set();
	for (let page = 1; page < 100000; page++) {
		const items = await upstreamFetch(makePath(page));
		if (!Array.isArray(items) || items.length === 0) break;
		let fresh = 0;
		for (const it of items) {
			if (it?.id && !seen.has(it.id)) {
				seen.add(it.id);
				out.push(it);
				fresh++;
			}
		}
		if (fresh === 0 || items.length < pageSize) break;
	}
	return out;
}

async function downloadFile(id, name) {
	const existing = q.getFile.get(id);
	const now = Math.floor(Date.now() / 1000);
	if (existing && (existing.status === 'ok' || existing.status === 'too_large')) return;
	if (existing && now - existing.fetched_at < 24 * 3600) return; // 失败的一天后再试
	const dest = path.join(CFG.dataDir, 'files', id);
	try {
		const res = await upstreamFetch(`/api/v1/files/${id}/content`, { raw: true });
		if (!res.ok) {
			await res.body?.cancel();
			q.upsertFile.run(id, name, null, 0, `http_${res.status}`, now);
			return;
		}
		const type = res.headers.get('content-type') || 'application/octet-stream';
		const declared = Number(res.headers.get('content-length') || 0);
		if (declared > CFG.maxFileBytes) {
			await res.body?.cancel();
			q.upsertFile.run(id, name, type, declared, 'too_large', now);
			return;
		}
		const tmp = dest + '.part';
		const out = fs.createWriteStream(tmp);
		let size = 0;
		let tooLarge = false;
		for await (const chunk of res.body) {
			size += chunk.length;
			if (size > CFG.maxFileBytes) {
				tooLarge = true;
				break;
			}
			if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
		}
		await new Promise((r) => out.end(r));
		if (tooLarge) {
			fs.rmSync(tmp, { force: true });
			q.upsertFile.run(id, name, type, size, 'too_large', now);
			return;
		}
		fs.renameSync(tmp, dest);
		if (!name) {
			const cd = res.headers.get('content-disposition') || '';
			const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
			if (m) {
				try {
					name = decodeURIComponent(m[1]);
				} catch {
					name = m[1];
				}
			}
		}
		q.upsertFile.run(id, name, type, size, 'ok', now);
	} catch (e) {
		fs.rmSync(dest + '.part', { force: true });
		q.upsertFile.run(id, name, null, 0, 'error', now);
	}
}

// ───────────────────────── 同步 ─────────────────────────
const sync = {
	running: false,
	phase: '',
	lastRun: Number(getMeta('last_sync_at', 0)) || null,
	lastOk: Number(getMeta('last_sync_ok_at', 0)) || null,
	lastError: getMeta('last_sync_error', '') || null,
	lastStats: JSON.parse(getMeta('last_sync_stats', 'null'))
};

async function runSync() {
	if (sync.running) return;
	if (!CFG.upstream || !CFG.apiKey) {
		sync.lastError = '未配置 OPENWEBUI_URL / OPENWEBUI_API_KEY';
		return;
	}
	sync.running = true;
	const stats = { listed: 0, updated: 0, failed: 0, missing: 0, files: 0 };
	try {
		// 1. 文件夹（实例关闭了文件夹功能时会 403，忽略即可）
		sync.phase = '文件夹';
		let folders = null;
		try {
			folders = await upstreamFetch('/api/v1/folders/');
		} catch (e) {
			if (!e.status || e.status === 401) throw e;
		}

		// 2. 各列表：未归档（无文件夹）/ 每个文件夹 / 已归档 / 置顶
		sync.phase = '对话列表';
		const remote = new Map(); // id -> { updated_at, archived, pinned, folder_id }
		const add = (items, flags) => {
			for (const it of items) {
				const cur = remote.get(it.id) || { archived: false, pinned: false, folder_id: null };
				// folderKnown：这条列表能确定文件夹归属（主列表只含无文件夹的对话，文件夹列表即该文件夹）
				remote.set(it.id, { ...cur, ...flags, folderKnown: true, updated_at: it.updated_at });
			}
		};
		// 拿不到文件夹列表时，把文件夹内的对话也并入主列表，避免漏掉
		const inc = Array.isArray(folders) ? '' : '&include_folders=true';
		add(await walkPages((p) => `/api/v1/chats/?page=${p}&include_pinned=true${inc}`, 60), {});
		if (Array.isArray(folders)) {
			for (const f of folders) {
				add(await walkPages((p) => `/api/v1/chats/folder/${encodeURIComponent(f.id)}/list?page=${p}`, 10), {
					folder_id: f.id
				});
			}
		}
		const knowsFolders = Array.isArray(folders);
		for (const it of await walkPages((p) => `/api/v1/chats/archived?page=${p}`, 60)) {
			const cur = remote.get(it.id) || { pinned: false, folder_id: null, folderKnown: false };
			remote.set(it.id, { ...cur, archived: true, updated_at: it.updated_at });
		}
		const pinned = await upstreamFetch('/api/v1/chats/pinned');
		for (const it of Array.isArray(pinned) ? pinned : []) {
			if (remote.has(it.id)) remote.get(it.id).pinned = true;
			// 文件夹里的置顶对话只出现在置顶列表里（旧版本的文件夹列表会排除置顶），归属以对话详情为准
			else remote.set(it.id, { archived: false, pinned: true, folder_id: null, folderKnown: false, updated_at: it.updated_at });
		}
		stats.listed = remote.size;

		// 3. 拉取有变化的对话全文
		const local = new Map(q.chatIndex.all().map((r) => [r.id, r]));
		const fileRefs = new Map();
		let done = 0;
		const changed = [...remote].filter(([id, r]) => !local.has(id) || local.get(id).updated_at !== r.updated_at);
		for (const [id, r] of remote) {
			const l = local.get(id);
			if (!l || l.updated_at !== r.updated_at) continue;
			const folderId = knowsFolders && r.folderKnown ? r.folder_id : l.folder_id;
			if (l.archived !== +r.archived || l.pinned !== +r.pinned || l.folder_id !== folderId || l.missing_upstream) {
				q.setFlags.run(+r.archived, +r.pinned, folderId, id);
			}
		}
		for (const [id, r] of changed) {
			sync.phase = `对话 ${++done}/${changed.length}`;
			try {
				const chat = await upstreamFetch(`/api/v1/chats/${encodeURIComponent(id)}`);
				if (!chat?.id) throw new Error('空响应');
				// 文件夹归属：列表无法确定时，以对话详情中的 folder_id 为准
				const flags = { archived: r.archived, pinned: r.pinned, folder_id: knowsFolders && r.folderKnown ? r.folder_id : undefined };
				for (const [fid, name] of storeChat(chat, flags)) fileRefs.set(fid, name);
				stats.updated++;
			} catch (e) {
				stats.failed++;
				console.error(`[sync] 对话 ${id} 拉取失败: ${e.message}`);
			}
		}

		// 4. 源站已不存在的：只做标记，永不删除本地归档
		for (const [id, l] of local) {
			if (!remote.has(id)) {
				stats.missing++;
				if (!l.missing_upstream) q.setMissing.run(id);
			}
		}
		if (Array.isArray(folders)) {
			const ids = new Set(folders.map((f) => f.id));
			for (const f of folders) q.upsertFolder.run(f.id, f.parent_id ?? null, f.name ?? '');
			for (const { id } of q.folderIds.all()) if (!ids.has(id)) q.setFolderMissing.run(id);
		}

		// 5. 附件
		if (CFG.downloadFiles && fileRefs.size) {
			let n = 0;
			for (const [fid, name] of fileRefs) {
				sync.phase = `附件 ${++n}/${fileRefs.size}`;
				await downloadFile(fid, name);
				if (q.getFile.get(fid)?.status === 'ok') stats.files++;
			}
		}

		sync.lastError = stats.failed ? `${stats.failed} 个对话拉取失败，下次同步会重试` : null;
		sync.lastOk = Math.floor(Date.now() / 1000);
		setMeta('last_sync_ok_at', sync.lastOk);
	} catch (e) {
		sync.lastError = e.status === 401 || e.status === 403 ? `认证失败（${e.message}）` : e.message || String(e);
		console.error('[sync] 失败:', sync.lastError);
	} finally {
		sync.running = false;
		sync.phase = '';
		sync.lastRun = Math.floor(Date.now() / 1000);
		sync.lastStats = stats;
		setMeta('last_sync_at', sync.lastRun);
		setMeta('last_sync_error', sync.lastError || '');
		setMeta('last_sync_stats', JSON.stringify(stats));
		console.log(`[sync] 完成: ${JSON.stringify(stats)}${sync.lastError ? ' 错误: ' + sync.lastError : ''}`);
	}
}

// ───────────────────────── 鉴权 ─────────────────────────
const COOKIE = 'owa_session';
const SESSION_DAYS = 30;
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const safeEqual = (a, b) => {
	const x = crypto.createHash('sha256').update(a).digest();
	const y = crypto.createHash('sha256').update(b).digest();
	return crypto.timingSafeEqual(x, y);
};

// 已登录时返回会话的到期时间（毫秒时间戳），否则返回 0
function isAuthed(req) {
	const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
	if (!m) return 0;
	const [exp, sig] = m[1].split('.');
	if (!exp || !sig || !(Number(exp) >= Date.now())) return 0;
	return safeEqual(sig, sign(exp)) ? Number(exp) : 0;
}

const attempts = new Map(); // ip -> { count, until }
function clientIp(req) {
	return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';
}

// ───────────────────────── HTTP ─────────────────────────
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.png': 'image/png',
	'.ico': 'image/x-icon'
};
const NM = path.join(__dirname, 'node_modules');
const STATIC_ROOTS = [
	['/vendor/marked.js', path.join(NM, 'marked/lib/marked.umd.js')],
	['/vendor/purify.js', path.join(NM, 'dompurify/dist/purify.min.js')],
	['/vendor/highlight.js', path.join(NM, '@highlightjs/cdn-assets/highlight.min.js')],
	['/vendor/hljs-light.css', path.join(NM, '@highlightjs/cdn-assets/styles/github.min.css')],
	['/vendor/hljs-dark.css', path.join(NM, '@highlightjs/cdn-assets/styles/github-dark.min.css')],
	['/vendor/katex/', path.join(NM, 'katex/dist/')],
	['/', path.join(__dirname, 'public/')]
];

const SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'no-referrer',
	'X-Robots-Tag': 'noindex, nofollow',
	'Content-Security-Policy':
		"default-src 'self'; img-src 'self' data: https: http:; media-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

// 文本类的响应按浏览器的意愿压缩：长对话的 JSON 有几 MB，压缩后只剩一两成，手机网络下差别很大
const COMPRESSIBLE = /^(?:text\/|application\/json|image\/svg)/;
const MIN_COMPRESS = 1024;
const encodingFor = (req) => {
	const accept = String(req?.headers['accept-encoding'] || '');
	return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
};
const compressor = (enc) => (enc === 'br' ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }) : zlib.createGzip({ level: 6 }));

function send(res, status, body, headers = {}) {
	const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
	const payload = isObj ? JSON.stringify(body) : (body ?? '');
	const head = {
		...SECURITY_HEADERS,
		'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
		'Cache-Control': 'no-store',
		...headers
	};
	const enc = payload.length >= MIN_COMPRESS && COMPRESSIBLE.test(head['Content-Type']) && !head['Content-Disposition'] ? encodingFor(res.req) : null;
	if (!enc) {
		res.writeHead(status, head);
		return res.end(payload);
	}
	res.writeHead(status, { ...head, 'Content-Encoding': enc, Vary: 'Accept-Encoding' });
	const z = compressor(enc);
	z.on('error', () => res.destroy());
	z.pipe(res);
	z.end(payload);
}

function serveFile(req, res, file, headers = {}) {
	fs.stat(file, (err, st) => {
		if (err || !st.isFile()) return send(res, 404, 'Not Found');
		const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
		const base = {
			...SECURITY_HEADERS,
			'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
			ETag: etag,
			'Cache-Control': 'private, no-cache',
			...headers
		};
		const enc = st.size >= MIN_COMPRESS && COMPRESSIBLE.test(base['Content-Type']) ? encodingFor(req) : null;
		if (enc) base.Vary = 'Accept-Encoding';
		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304, base);
			return res.end();
		}
		if (!enc) {
			res.writeHead(200, { ...base, 'Content-Length': st.size });
			if (req.method === 'HEAD') return res.end();
			return fs.createReadStream(file).pipe(res);
		}
		res.writeHead(200, { ...base, 'Content-Encoding': enc });
		if (req.method === 'HEAD') return res.end();
		const z = compressor(enc);
		const src = fs.createReadStream(file);
		src.on('error', () => res.destroy());
		z.on('error', () => res.destroy());
		src.pipe(z).pipe(res);
	});
}

function serveStatic(req, res, pathname) {
	if (pathname === '/') pathname = '/index.html';
	for (const [prefix, target] of STATIC_ROOTS) {
		if (prefix.endsWith('/')) {
			if (!pathname.startsWith(prefix)) continue;
			const file = path.join(target, pathname.slice(prefix.length));
			if (!file.startsWith(target)) return send(res, 403, 'Forbidden');
			return serveFile(req, res, file);
		} else if (pathname === prefix) {
			return serveFile(req, res, target);
		}
	}
	send(res, 404, 'Not Found');
}

function readBody(req, limit = 64 * 1024) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > limit) {
				reject(new Error('too large'));
				req.destroy();
			} else chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function ftsPhrase(s) {
	return '"' + s.replace(/"/g, '""') + '"';
}

const HITS_PER_CHAT = 5;
function search(query) {
	const terms = query.split(/\s+/).filter(Boolean).slice(0, 8);
	if (!terms.length) return [];
	const hits = new Map(); // chat_id -> { snippet, count }
	const useFts = terms.every((t) => [...t].length >= 3);
	let rows;
	if (useFts) {
		rows = db
			.prepare(
				`SELECT chat_id, message_id, role, snippet(msg_fts, 3, char(1), char(2), '…', 24) AS snip
				 FROM msg_fts WHERE msg_fts MATCH ? ORDER BY rank LIMIT 2000`
			)
			.all(terms.map(ftsPhrase).join(' AND '));
	} else {
		// 少于 3 个字符的词 trigram 索引无法命中，退化为子串扫描
		const esc = (t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%';
		const where = terms.map(() => "text LIKE ? ESCAPE '\\'").join(' AND ');
		rows = db
			.prepare(`SELECT chat_id, message_id, role, text FROM msg_fts WHERE ${where} LIMIT 2000`)
			.all(...terms.map(esc))
			.map((r) => {
				const i = r.text.toLowerCase().indexOf(terms[0].toLowerCase());
				const start = Math.max(0, i - 30);
				const t = terms[0].length;
				const snip =
					i < 0
						? r.text.slice(0, 90)
						: (start > 0 ? '…' : '') +
							r.text.slice(start, i) +
							'\u0001' +
							r.text.slice(i, i + t) +
							'\u0002' +
							r.text.slice(i + t, i + t + 60) +
							'…';
				return { chat_id: r.chat_id, message_id: r.message_id, role: r.role, snip };
			});
	}
	for (const r of rows) {
		const h = hits.get(r.chat_id);
		if (!h) hits.set(r.chat_id, { snippet: r.snip, message_id: r.message_id, count: 1, hits: [{ message_id: r.message_id, role: r.role, snippet: r.snip }] });
		else {
			h.count++;
			if (h.hits.length < HITS_PER_CHAT) h.hits.push({ message_id: r.message_id, role: r.role, snippet: r.snip });
		}
	}
	// 标题命中
	const titleWhere = terms.map(() => "title LIKE ? ESCAPE '\\'").join(' AND ');
	const titleRows = db
		.prepare(`SELECT id FROM chats WHERE ${titleWhere}`)
		.all(...terms.map((t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%'));
	for (const r of titleRows) if (!hits.has(r.id)) hits.set(r.id, { snippet: null, message_id: null, count: 0, hits: [] });
	return [...hits].map(([id, h]) => ({ id, ...h }));
}

function syncStatus() {
	return {
		configured: Boolean(CFG.upstream && CFG.apiKey),
		running: sync.running,
		phase: sync.phase,
		last_run: sync.lastRun,
		last_ok: sync.lastOk,
		last_error: sync.lastError,
		last_stats: sync.lastStats,
		interval_minutes: CFG.intervalMin,
		...q.counts.get()
	};
}

async function handle(req, res) {
	const url = new URL(req.url, 'http://x');
	const p = decodeURIComponent(url.pathname);
	const method = req.method;

	if (p === '/api/login' && method === 'POST') {
		const ip = clientIp(req);
		const a = attempts.get(ip);
		if (a && a.until > Date.now()) return send(res, 429, { error: '尝试次数过多，请稍后再试' });
		let password = '';
		try {
			password = JSON.parse(await readBody(req)).password ?? '';
		} catch {
			return send(res, 400, { error: '请求格式错误' });
		}
		if (typeof password !== 'string' || !safeEqual(password, CFG.password)) {
			const count = (a?.count || 0) + 1;
			attempts.set(ip, { count, until: count >= 5 ? Date.now() + Math.min(2 ** (count - 5), 60) * 60000 : 0 });
			return send(res, 401, { error: '密码错误' });
		}
		attempts.delete(ip);
		const exp = String(Date.now() + SESSION_DAYS * 86400000);
		const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
		return send(res, 200, { ok: true }, {
			'Set-Cookie': `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`
		});
	}
	if (p === '/api/logout' && method === 'POST') {
		return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
	}

	const authed = isAuthed(req);

	if (p.startsWith('/api/') || p.startsWith('/files/')) {
		if (!authed) return send(res, 401, { error: '未登录' });

		// 仅接受同源请求，防止跨站触发
		const sameOrigin = () => {
			const origin = req.headers.origin;
			if (!origin) return true;
			try {
				return new URL(origin).host === req.headers.host;
			} catch {
				return false;
			}
		};
		if (p === '/api/sync' && method === 'POST') {
			if (!sameOrigin()) return send(res, 403, { error: 'forbidden' });
			if (!sync.running) runSync();
			return send(res, 202, syncStatus());
		}
		// 收藏 / 取消收藏一条消息
		const st = /^\/api\/stars\/([^/]+)\/([^/]+)$/.exec(p);
		if (st && (method === 'PUT' || method === 'DELETE')) {
			if (!sameOrigin()) return send(res, 403, { error: 'forbidden' });
			if (method === 'DELETE') {
				q.delStar.run(st[1], st[2]);
				return send(res, 200, { ok: true });
			}
			let body;
			try {
				body = JSON.parse(await readBody(req, 4096));
			} catch {
				return send(res, 400, { error: '请求格式错误' });
			}
			const { excerpt = '', role = '' } = body || {};
			if (typeof excerpt !== 'string' || typeof role !== 'string' || st[2].length > 200) return send(res, 400, { error: '请求格式错误' });
			if (!q.hasChat.get(st[1])) return send(res, 404, { error: '对话不存在' });
			if (q.countStars.get().n >= 2000) return send(res, 409, { error: '收藏已达上限（2000 条）' });
			const t = Date.now();
			q.putStar.run(st[1], st[2], role.slice(0, 20), [...excerpt].slice(0, 200).join(''), t);
			return send(res, 200, { ok: true, t });
		}
		// 记录某个对话读到哪里。各设备的时钟不可靠，所以客户端只报告「这是多久以前读的」（age），
		// 由服务器换算成自己的时间；比现有记录更早的（比如离线几天后才补传的）不覆盖较新的记录
		const rd = /^\/api\/reading\/([^/]+)$/.exec(p);
		if (rd && method === 'PUT') {
			if (!sameOrigin()) return send(res, 403, { error: 'forbidden' });
			let body;
			try {
				body = JSON.parse(await readBody(req, 2048));
			} catch {
				return send(res, 400, { error: '请求格式错误' });
			}
			const { m, r, p: pct, age = 0 } = body || {};
			const okMsg = m == null || (typeof m === 'string' && m.length <= 200);
			if (!okMsg || !Number.isFinite(r) || r < 0 || r > 1 || !Number.isInteger(pct) || pct < 0 || pct > 100 || !Number.isFinite(age) || age < 0) {
				return send(res, 400, { error: '请求格式错误' });
			}
			if (!q.hasChat.get(rd[1])) return send(res, 404, { error: '对话不存在' });
			const t = Date.now() - Math.min(Math.floor(age), 365 * 86400000);
			const cur = q.getReading.get(rd[1]);
			if (cur && cur.t > t) return send(res, 200, { ok: true, stale: true, reading: { m: cur.message_id, r: cur.rel, p: cur.pct, t: cur.t } });
			q.putReading.run(rd[1], m ?? null, r, pct, t);
			q.pruneReading.run(READING_KEEP);
			return send(res, 200, { ok: true, t });
		}
		if (method !== 'GET' && method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });

		if (p === '/api/status') return send(res, 200, syncStatus());
		if (p === '/api/stats') return send(res, 200, archiveStats());
		if (p === '/api/stars') return send(res, 200, { stars: q.listStars.all() });
		// 整个归档导出为一个 JSON 数组（每项是 Open WebUI 的原始对话对象，可重新导入）
		if (p === '/api/export') {
			res.writeHead(200, {
				...SECURITY_HEADERS,
				'Content-Type': 'application/json; charset=utf-8',
				'Content-Disposition': `attachment; filename="owui-archive-${new Date().toISOString().slice(0, 10)}.json"`,
				'Cache-Control': 'no-store'
			});
			if (method === 'HEAD') return res.end();
			res.write('[');
			let first = true;
			for (const row of q.allChatData.iterate()) {
				if (!res.write((first ? '' : ',\n') + row.data)) await new Promise((r) => res.once('drain', r));
				first = false;
			}
			return res.end(']');
		}
		if (p === '/api/reading') {
			const reading = {};
			for (const r of q.listReading.all(READING_SEND)) reading[r.chat_id] = { m: r.message_id, r: r.rel, p: r.pct, t: r.t };
			return send(res, 200, { reading });
		}
		if (p === '/api/index') {
			const chats = q.listChats.all().map((c) => ({ ...c, tags: JSON.parse(c.tags), models: JSON.parse(c.models) }));
			// X-Session-Exp：阅读端的离线缓存只在登录有效期内可读
			return send(res, 200, { chats, folders: q.listFolders.all(), status: syncStatus() }, { 'X-Session-Exp': String(authed) });
		}
		if (p === '/api/search') {
			const query = (url.searchParams.get('q') || '').trim().slice(0, 200);
			return send(res, 200, { results: search(query) });
		}
		let m;
		if ((m = /^\/api\/chats\/([^/]+)$/.exec(p))) {
			const row = q.getChat.get(m[1]);
			if (!row) return send(res, 404, { error: '对话不存在' });
			const body = `{"archived":${row.archived},"pinned":${row.pinned},"folder_id":${JSON.stringify(row.folder_id)},"tags":${row.tags},"synced_at":${row.synced_at},"missing_upstream":${row.missing_upstream},"record":${row.data}}`;
			if (url.searchParams.has('download')) {
				return send(res, 200, Buffer.from(row.data), {
					'Content-Type': 'application/json; charset=utf-8',
					'Content-Disposition': `attachment; filename="chat-${row.id}.json"`
				});
			}
			// 这两个头给阅读端的离线缓存用：存下的那份是不是还新（与对话列表里的同名字段比对）、预存时要不要跳过特别大的对话
			const buf = Buffer.from(body);
			const rev = `${row.updated_at}-${row.archived}${row.pinned}${row.missing_upstream}-${encodeURIComponent(row.folder_id ?? '')}`;
			return send(res, 200, buf, { 'Content-Type': 'application/json; charset=utf-8', 'X-Chat-Rev': rev, 'X-Chat-Size': String(buf.length) });
		}
		if ((m = /^\/files\/([0-9a-fA-F-]{36})$/.exec(p))) {
			const f = q.getFile.get(m[1]);
			if (!f || f.status !== 'ok') return send(res, 404, '附件未归档');
			// 只有位图按原类型内联展示，其余一律作为下载，避免归档的 HTML/SVG 在本站源下执行
			const inline = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(f.content_type || '');
			const name = encodeURIComponent(f.name || f.id);
			return serveFile(req, res, path.join(CFG.dataDir, 'files', f.id), {
				'Content-Type': inline ? f.content_type : 'application/octet-stream',
				'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
				'Cache-Control': 'private, max-age=31536000, immutable'
			});
		}
		return send(res, 404, { error: 'not found' });
	}

	if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
	serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
	handle(req, res).catch((e) => {
		const bad = e instanceof URIError;
		if (!bad) console.error('[http]', e);
		if (!res.headersSent) send(res, bad ? 400 : 500, { error: bad ? '请求地址无效' : '服务器错误' });
		else res.destroy();
	});
});

server.listen(CFG.port, CFG.host, () => {
	console.log(`归档阅读站已启动: http://${CFG.host}:${CFG.port}  数据目录: ${CFG.dataDir}`);
	if (!CFG.upstream || !CFG.apiKey) {
		console.warn('未配置 OPENWEBUI_URL / OPENWEBUI_API_KEY，自动同步已停用（仍可阅读已归档内容）。');
		return;
	}
	console.log(`同步源: ${CFG.upstream}  间隔: ${CFG.intervalMin} 分钟`);
	runSync();
	setInterval(runSync, CFG.intervalMin * 60000);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		server.close();
		try {
			db.close();
		} catch {}
		process.exit(0);
	});
}
