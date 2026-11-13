// 端到端测试：起一个假的 Open WebUI 上游，跑真实的 server.js，验证同步与只读 API
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const TMP = path.join(__dirname, '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const FILE_ID = '11111111-2222-3333-4444-555555555555';
const KEY = 'sk-test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const mkChat = (id, title, updated, extra = {}, messages = null) => ({
	id,
	user_id: 'u1',
	title,
	created_at: 1700000000,
	updated_at: updated,
	archived: false,
	pinned: false,
	folder_id: null,
	meta: {},
	...extra,
	chat: {
		title,
		history: {
			currentId: 'a2',
			messages: messages || {
				u1: { id: 'u1', parentId: null, childrenIds: ['a1', 'a2'], role: 'user', content: `关于${title}的问题`, timestamp: 1700000000 },
				a1: { id: 'a1', parentId: 'u1', childrenIds: [], role: 'assistant', model: 'gpt-x', content: '第一版回答：量子纠缠', timestamp: 1700000001 },
				a2: { id: 'a2', parentId: 'u1', childrenIds: [], role: 'assistant', model: 'gpt-x', content: '第二版回答 with pineapple $E=mc^2$', timestamp: 1700000002 }
			}
		}
	}
});

// 上游状态（测试中途会改动）
const up = {
	chats: new Map(),
	folders: [{ id: 'f1', parent_id: null, name: '工作', user_id: 'u1', created_at: 1, updated_at: 1 }],
	detailHits: 0
};
for (let i = 0; i < 130; i++) up.chats.set(`plain-${i}`, mkChat(`plain-${i}`, `普通对话${i}`, 1700001000 + i));
for (let i = 0; i < 12; i++) up.chats.set(`fold-${i}`, mkChat(`fold-${i}`, `文件夹对话${i}`, 1700002000 + i, { folder_id: 'f1' }));
for (let i = 0; i < 3; i++) up.chats.set(`arch-${i}`, mkChat(`arch-${i}`, `归档对话${i}`, 1700003000 + i, { archived: true }));
up.chats.set('pin-0', mkChat('pin-0', '置顶对话', 1700004000, { pinned: true }));
// 0.10.x：文件夹里的置顶 / 已归档对话不出现在文件夹列表里，只能从置顶 / 归档列表拿到
up.chats.set('pin-f', mkChat('pin-f', '文件夹里的置顶', 1700004100, { pinned: true, folder_id: 'f1' }));
up.chats.set('arch-f', mkChat('arch-f', '文件夹里的归档', 1700004200, { archived: true, folder_id: 'f1' }));
up.chats.set(
	'files-0',
	mkChat('files-0', '带附件', 1700005000, { meta: { tags: ['图片'] } }, {
		u1: { id: 'u1', parentId: null, childrenIds: ['a1'], role: 'user', content: '看图', files: [{ type: 'image', url: FILE_ID }], timestamp: 1700000000 },
		a1: {
			id: 'a1',
			parentId: 'u1',
			childrenIds: [],
			role: 'assistant',
			model: 'gpt-x',
			content: '',
			output: [
				{ type: 'reasoning', summary: [{ type: 'summary_text', text: '秘密思考内容zebra' }], duration: 3 },
				{ type: 'function_call', call_id: 'c1', name: 'search', arguments: '{"q":"x"}' },
				{ type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'result' }] },
				{ type: 'message', content: [{ type: 'output_text', text: '这是一张图' }] }
			],
			timestamp: 1700000001
		}
	})
);

const brief = (c) => ({ id: c.id, title: c.title, updated_at: c.updated_at, created_at: c.created_at });
const sorted = (f) => [...up.chats.values()].filter(f).sort((a, b) => b.updated_at - a.updated_at);
const page = (list, p, size) => list.slice((p - 1) * size, p * size).map(brief);

const upstream = http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x');
	const json = (code, body) => {
		res.writeHead(code, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(body));
	};
	if (req.headers.authorization !== `Bearer ${KEY}`) return json(401, { detail: 'unauthorized' });
	const p = u.pathname;
	const pg = Number(u.searchParams.get('page') || 1);
	let m;
	if (p === '/api/v1/folders/') return json(200, up.folders);
	if (p === '/api/v1/chats/') {
		const incPinned = u.searchParams.get('include_pinned') === 'true';
		return json(200, page(sorted((c) => !c.archived && !c.folder_id && (incPinned || !c.pinned)), pg, 60));
	}
	if ((m = /^\/api\/v1\/chats\/folder\/([^/]+)\/list$/.exec(p))) return json(200, page(sorted((c) => c.folder_id === m[1] && !c.archived && !c.pinned), pg, 10).map(({ id, title, updated_at }) => ({ id, title, updated_at })));
	if (p === '/api/v1/chats/archived') return json(200, page(sorted((c) => c.archived), pg, 60));
	if (p === '/api/v1/chats/pinned') return json(200, sorted((c) => c.pinned && !c.archived).map(brief));
	if ((m = /^\/api\/v1\/chats\/([^/]+)$/.exec(p))) {
		up.detailHits++;
		const c = up.chats.get(m[1]);
		return c ? json(200, c) : json(401, { detail: 'not found' });
	}
	if (p === `/api/v1/files/${FILE_ID}/content`) {
		res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length, 'Content-Disposition': `inline; filename*=UTF-8''pic.png` });
		return res.end(PNG);
	}
	json(404, { detail: 'nope' });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
	await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
	const upPort = upstream.address().port;
	const PORT = 18000 + Math.floor(Math.random() * 1000);
	const base = `http://127.0.0.1:${PORT}`;
	const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
		env: {
			PATH: process.env.PATH,
			PORT: String(PORT),
			DATA_DIR: TMP,
			OPENWEBUI_URL: `http://127.0.0.1:${upPort}/`,
			OPENWEBUI_API_KEY: KEY,
			ARCHIVE_PASSWORD: 'pw-正确',
			SYNC_INTERVAL_MINUTES: '999'
		},
		stdio: ['ignore', 'inherit', 'inherit']
	});
	let cookie = '';
	const get = (p, opts = {}) => fetch(base + p, { ...opts, headers: { Cookie: cookie, ...(opts.headers || {}) } });
	const waitSync = async () => {
		for (let i = 0; i < 200; i++) {
			const s = await (await get('/api/status')).json();
			if (!s.running && s.last_run) return s;
			await sleep(50);
		}
		throw new Error('sync timeout');
	};
	const resync = async () => {
		const before = (await (await get('/api/status')).json()).last_stats;
		const r = await get('/api/sync', { method: 'POST' });
		assert.equal(r.status, 202);
		for (let i = 0; i < 200; i++) {
			await sleep(50);
			const s = await (await get('/api/status')).json();
			if (!s.running && s.last_stats !== before && JSON.stringify(s.last_stats) !== '__') return s;
		}
	};

	try {
		for (let i = 0; i < 100; i++) {
			try {
				await fetch(base + '/');
				break;
			} catch {
				await sleep(50);
			}
		}

		// ── 鉴权 ──
		assert.equal((await fetch(base + '/api/index')).status, 401, '未登录应 401');
		assert.equal((await fetch(base + `/files/${FILE_ID}`)).status, 401);
		assert.equal((await fetch(base + '/api/chats/plain-0')).status, 401);
		assert.equal((await fetch(base + '/api/sync', { method: 'POST' })).status, 401);
		let r = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
		assert.equal(r.status, 401);
		assert.equal((await fetch(base + '/api/index', { headers: { Cookie: 'owa_session=9999999999999.deadbeef' } })).status, 401, '伪造 cookie');
		r = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-正确' }) });
		assert.equal(r.status, 200);
		cookie = r.headers.get('set-cookie').split(';')[0];
		assert.match(r.headers.get('set-cookie'), /HttpOnly/);

		// ── 静态资源 ──
		for (const p of ['/', '/app.js', '/style.css', '/vendor/marked.js', '/vendor/purify.js', '/vendor/highlight.js', '/vendor/katex/katex.min.js', '/vendor/katex/katex.min.css', '/vendor/hljs-dark.css']) {
			assert.equal((await fetch(base + p)).status, 200, p);
		}
		const css = await (await fetch(base + '/vendor/katex/katex.min.css')).text();
		const font = /url\(([^)]+\.woff2)\)/.exec(css)[1];
		assert.equal((await fetch(base + '/vendor/katex/' + font)).status, 200, 'katex 字体');
		assert.notEqual((await fetch(base + '/..%2fserver.js')).status, 200, '路径穿越');
		assert.notEqual((await fetch(base + '/vendor/katex/..%2f..%2f..%2f.env.example')).status, 200, '路径穿越');
		assert.equal((await fetch(base + '/%E0%A4%A')).status, 400, '非法编码');

		// ── 首次同步 ──
		let s = await waitSync();
		assert.equal(s.last_error, null);
		const total = up.chats.size;
		assert.equal(s.chats, total, '全部对话都应归档（含分页、文件夹、已归档、置顶）');
		assert.equal(s.last_stats.updated, total);
		let idx = await (await get('/api/index')).json();
		const by = (id) => idx.chats.find((c) => c.id === id);
		assert.equal(by('fold-3').folder_id, 'f1');
		assert.equal(by('arch-1').archived, 1);
		assert.equal(by('pin-0').pinned, 1);
		assert.equal(by('pin-0').folder_id, null);
		assert.equal(by('pin-f').pinned, 1);
		assert.equal(by('pin-f').folder_id, 'f1', '文件夹里的置顶对话不能丢归属');
		assert.equal(by('arch-f').archived, 1);
		assert.equal(by('arch-f').folder_id, 'f1', '文件夹里的归档对话不能丢归属');
		assert.equal(by('plain-0').archived, 0);
		assert.deepEqual(by('files-0').tags, ['图片']);
		assert.deepEqual(by('plain-0').models, ['gpt-x']);
		assert.equal(by('plain-0').msg_count, 3);
		assert.equal(idx.folders[0].name, '工作');
		assert.ok(!('data' in idx.chats[0]), '列表不应带全文');

		// ── 对话详情 ──
		const chat = await (await get('/api/chats/plain-5')).json();
		assert.equal(chat.record.chat.history.messages.a1.content, '第一版回答：量子纠缠', '非当前分支也要保留');
		assert.equal(chat.record.chat.history.currentId, 'a2');
		assert.equal((await get('/api/chats/nope')).status, 404);
		r = await get('/api/chats/plain-5?download');
		assert.match(r.headers.get('content-disposition'), /attachment/);
		assert.equal((await r.json()).id, 'plain-5');

		// ── 附件 ──
		r = await get(`/files/${FILE_ID}`);
		assert.equal(r.status, 200);
		assert.equal(r.headers.get('content-type'), 'image/png');
		assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
		assert.equal((await get('/files/00000000-0000-0000-0000-000000000000')).status, 404);

		// ── 搜索 ──
		const find = async (qs) => (await (await get('/api/search?q=' + encodeURIComponent(qs))).json()).results;
		assert.equal((await find('pineapple')).length, total - 1, '英文全文');
		assert.equal((await find('量子纠缠')).length, total - 1, '中文全文（含非当前分支）');
		assert.equal((await find('纠缠')).length, total - 1, '两字中文走子串');
		assert.deepEqual((await find('zebra')).map((x) => x.id), ['files-0'], '思考内容可搜');
		assert.deepEqual((await find('置顶对话')).map((x) => x.id), ['pin-0'], '标题');
		assert.equal((await find('普通对话12')).length, 11);
		assert.match((await find('pineapple'))[0].snippet, /\u0001pineapple\u0002/);
		assert.equal((await find('"; DROP TABLE chats; --')).length, 0);
		assert.equal((await find('a" OR "b')).length, 0);
		assert.equal((await find('100%_x')).length, 0);
		assert.equal((await find('')).length, 0);

		// ── 增量同步：无变化时不应重新拉取任何对话 ──
		up.detailHits = 0;
		s = await resync();
		assert.equal(up.detailHits, 0, '无变化不应拉取详情');
		assert.equal(s.last_stats.updated, 0);

		// ── 变化：修改、新增、挪文件夹、归档、源站删除 ──
		const c7 = up.chats.get('plain-7');
		c7.title = '改过的标题';
		c7.updated_at += 100;
		c7.chat.history.messages.a2.content = '全新内容 watermelon';
		up.chats.set('new-0', mkChat('new-0', '新对话', 1700009000));
		up.chats.get('plain-8').folder_id = 'f1'; // updated_at 不变
		up.chats.get('plain-9').archived = true;
		up.chats.delete('plain-10');
		up.detailHits = 0;
		s = await resync();
		assert.equal(up.detailHits, 2, '只拉取变化的两个对话');
		assert.equal(s.last_stats.missing, 1);
		idx = await (await get('/api/index')).json();
		assert.equal(idx.chats.length, total + 1, '源站删除的对话必须保留');
		assert.equal(by('plain-7').title, '改过的标题');
		assert.equal(by('plain-8').folder_id, 'f1');
		assert.equal(by('pin-f').folder_id, 'f1', '未变化的置顶对话归属保持');
		assert.equal(by('arch-f').folder_id, 'f1');
		assert.equal(by('plain-9').archived, 1);
		assert.equal(by('plain-10').missing_upstream, 1);
		assert.equal(by('new-0').missing_upstream, 0);
		assert.equal((await get('/api/chats/plain-10')).status, 200, '已删除的仍可阅读');
		assert.deepEqual((await find('watermelon')).map((x) => x.id), ['plain-7']);
		assert.equal((await find('pineapple')).length, total - 1, '旧内容的索引被替换');

		// ── 上游整体不可用：不能把所有对话标成已删除 ──
		upstream.close();
		upstream.closeAllConnections();
		s = await resync();
		assert.ok(s.last_error, '应报告错误');
		idx = await (await get('/api/index')).json();
		assert.equal(idx.chats.filter((c) => c.missing_upstream).length, 1, '同步失败不应误标删除');
		assert.equal(idx.chats.length, total + 1);

		// ── 只读：没有任何写接口 ──
		for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			assert.ok([404, 405].includes((await get('/api/chats/plain-0', { method: m })).status), m);
		}
		assert.equal((await get('/api/sync', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403, '跨站触发');

		// ── 退出登录 ──
		r = await get('/api/logout', { method: 'POST' });
		assert.match(r.headers.get('set-cookie'), /Max-Age=0/);

		console.log('\n全部通过 ✔');
	} catch (e) {
		console.error('\n测试失败:', e);
		process.exitCode = 1;
	} finally {
		child.kill();
		upstream.close();
		upstream.closeAllConnections?.();
		fs.rmSync(TMP, { recursive: true, force: true });
	}
})();
