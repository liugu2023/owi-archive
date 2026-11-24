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
	'stats-0',
	mkChat('stats-0', '统计用', 1700006000, {}, {
		// 独立的系统消息：不计入统计，只为让全文搜索的既有断言照常命中这个对话
		s0: { id: 's0', parentId: null, childrenIds: [], role: 'system', content: 'pineapple 量子纠缠', timestamp: 1699999999 },
		u1: { id: 'u1', parentId: null, childrenIds: ['a1', 'a2', 'a3'], role: 'user', content: '你好，world 2024！请写一个 hello-world。', timestamp: 1700000000 },
		a1: { id: 'a1', parentId: 'u1', childrenIds: [], role: 'assistant', model: 'claude-x', content: '好的，这是答案 answer。', usage: { prompt_tokens: 321, completion_tokens: 123, total_tokens: 444 }, timestamp: 1700000001 },
		a2: { id: 'a2', parentId: 'u1', childrenIds: [], role: 'assistant', model: 'gpt-4o-mini', content: '第二个版本', timestamp: 1700000002 },
		a3: { id: 'a3', parentId: 'u1', childrenIds: [], role: 'assistant', model: 'deepseek-chat', content: '第三个版本', usage: { eval_count: 50 }, timestamp: 1700000003 }
	})
);
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
		for (const p of ['/', '/app.js', '/sw.js', '/style.css', '/vendor/marked.js', '/vendor/purify.js', '/vendor/highlight.js', '/vendor/katex/katex.min.js', '/vendor/katex/katex.min.css', '/vendor/hljs-dark.css']) {
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

		// ── 归档内容只读：对话没有任何写接口（唯一的写入是下面的阅读位置） ──
		for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			assert.ok([404, 405].includes((await get('/api/chats/plain-0', { method: m })).status), m);
		}
		assert.equal((await get('/api/sync', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403, '跨站触发');

		// ── 阅读位置（跨设备续读） ──
		const putReading = (id, body, headers = {}) => get(`/api/reading/${id}`, { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
		assert.equal((await fetch(base + '/api/reading')).status, 401, '未登录不能读阅读位置');
		assert.equal((await fetch(base + '/api/reading/plain-0', { method: 'PUT', body: '{"m":"a1","r":0.5,"p":40}' })).status, 401, '未登录不能写阅读位置');
		assert.deepEqual((await (await get('/api/reading')).json()).reading, {}, '一开始没有记录');
		r = await putReading('plain-0', { m: 'a1', r: 0.5, p: 40 });
		assert.equal(r.status, 200);
		const t1 = (await r.json()).t;
		assert.ok(Math.abs(t1 - Date.now()) < 5000, '时间由服务器给出');
		await putReading('plain-1', { m: null, r: 0, p: 100 });
		let rd = (await (await get('/api/reading')).json()).reading;
		assert.deepEqual(rd['plain-0'], { m: 'a1', r: 0.5, p: 40, t: t1 });
		assert.deepEqual(Object.keys(rd), ['plain-1', 'plain-0'], '最近读的在前');
		await sleep(5);
		r = await putReading('plain-0', { m: 'a2', r: 0.25, p: 60, t: 1 });
		const t2 = (await r.json()).t;
		rd = (await (await get('/api/reading')).json()).reading;
		assert.ok(t2 > t1 && rd['plain-0'].m === 'a2' && rd['plain-0'].p === 60 && rd['plain-0'].t === t2, '后到的写入覆盖，客户端自带的时间不被采信');
		// 离线设备补传的旧位置（一小时前读的）不覆盖较新的记录，并拿回当前记录
		r = await (await putReading('plain-0', { m: 'a1', r: 0.1, p: 10, age: 3600000 })).json();
		assert.ok(r.stale && r.reading.m === 'a2' && r.reading.p === 60 && r.reading.t === t2, '较旧的位置不覆盖');
		assert.equal((await (await get('/api/reading')).json()).reading['plain-0'].p, 60);
		// 没有记录时，补传的旧位置照常写入，时间按 age 往前推
		r = await (await putReading('plain-2', { m: 'a1', r: 0.1, p: 10, age: 3600000 })).json();
		assert.ok(!r.stale && Math.abs(Date.now() - 3600000 - r.t) < 5000);
		assert.equal((await putReading('plain-0', { m: 'a1', r: 0.1, p: 10, age: -5 })).status, 400);
		assert.equal((await putReading('no-such-chat', { m: 'a1', r: 0, p: 1 })).status, 404, '不存在的对话');
		for (const bad of ['not json', '{}', '{"m":"a","r":2,"p":10}', '{"m":"a","r":0.5,"p":101}', '{"m":"a","r":0.5,"p":1.5}', '{"m":5,"r":0.5,"p":1}', '{"m":"a","r":"0.5","p":1}', JSON.stringify({ m: 'x'.repeat(201), r: 0, p: 1 })]) {
			assert.equal((await putReading('plain-0', bad)).status, 400, bad.slice(0, 30));
		}
		assert.notEqual((await putReading('plain-0', JSON.stringify({ m: 'x'.repeat(5000), r: 0, p: 1 })).catch(() => ({ status: 0 }))).status, 200, '过大的请求体');
		assert.equal((await putReading('plain-0', { m: 'a1', r: 0, p: 1 }, { Origin: 'https://evil.example' })).status, 403, '跨站写入');
		assert.equal((await (await get('/api/reading')).json()).reading['plain-0'].p, 60, '被拒绝的写入不改变记录');
		for (const m of ['POST', 'DELETE', 'PATCH']) assert.equal((await get('/api/reading/plain-0', { method: m })).status, 405, m);
		assert.equal((await get('/api/reading', { method: 'PUT', body: '{}' })).status, 405);

		// ── 收藏 ──
		const star = (path, method, body, headers = {}) => get(`/api/stars/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers });
		assert.equal((await fetch(base + '/api/stars')).status, 401);
		assert.equal((await fetch(base + '/api/stars/plain-0/a1', { method: 'PUT', body: '{}' })).status, 401);
		assert.deepEqual((await (await get('/api/stars')).json()).stars, []);
		assert.equal((await star('plain-0/a1', 'PUT', { excerpt: '第一版回答', role: 'assistant' })).status, 200);
		await sleep(3);
		assert.equal((await star('plain-1/u1', 'PUT', { excerpt: '长'.repeat(500), role: 'user' })).status, 200);
		let stars = (await (await get('/api/stars')).json()).stars;
		assert.deepEqual(stars.map((x) => `${x.chat_id}/${x.message_id}`), ['plain-1/u1', 'plain-0/a1'], '最近收藏的在前');
		assert.equal([...stars[0].excerpt].length, 200, '摘录截断到 200 字');
		const firstT = stars[1].t;
		await star('plain-0/a1', 'PUT', { excerpt: '改过的摘录', role: 'assistant' });
		stars = (await (await get('/api/stars')).json()).stars;
		assert.ok(stars.length === 2 && stars[1].excerpt === '改过的摘录' && stars[1].t === firstT, '重复收藏不产生新记录，也不改变收藏时间');
		assert.equal((await star('nope/a1', 'PUT', { excerpt: 'x' })).status, 404);
		assert.equal((await star('plain-0/a1', 'PUT', { excerpt: 5 })).status, 400);
		assert.equal((await get('/api/stars/plain-0/a1', { method: 'PUT', body: 'nope' })).status, 400);
		assert.equal((await star('plain-0/a2', 'PUT', { excerpt: 'x' }, { Origin: 'https://evil.example' })).status, 403);
		assert.equal((await star('plain-0/a1', 'DELETE', undefined, { Origin: 'https://evil.example' })).status, 403);
		assert.equal((await star('plain-0/a1', 'DELETE')).status, 200);
		assert.equal((await star('plain-0/a1', 'DELETE')).status, 200, '重复取消不报错');
		assert.equal((await (await get('/api/stars')).json()).stars.length, 1);
		assert.equal((await get('/api/stars/plain-0/a1', { method: 'POST' })).status, 405);

		// ── 搜索：每个对话返回多处命中 ──
		r = (await (await get('/api/search?q=' + encodeURIComponent('pineapple'))).json()).results.find((x) => x.id === 'plain-5');
		assert.ok(r.hits.length === 1 && r.hits[0].message_id === r.message_id && r.hits[0].role === 'assistant' && r.hits[0].snippet === r.snippet);
		r = (await (await get('/api/search?q=' + encodeURIComponent('回答'))).json()).results.find((x) => x.id === 'plain-0');
		assert.ok(r.count === 2 && r.hits.length === 2 && new Set(r.hits.map((x) => x.message_id)).size === 2, '一个对话里的两处命中分别列出');

		// ── 统计：字数与 token ──
		assert.equal((await fetch(base + '/api/stats')).status, 401);
		const stats = await (await get('/api/stats')).json();
		const sm = Object.fromEntries(stats.models.map((x) => [x.name, x]));
		// stats-0：用户「你好，world 2024！请写一个 hello-world。」= 6 个汉字 + world / 2024 / hello-world 3 个词
		// claude-x 回答「好的，这是答案 answer。」= 6 字 + 1 词，上游报了用量；gpt-4o 回答（另一分支）「第二个版本」= 5 字，没有用量
		assert.equal(sm['claude-x'].chars, 7);
		assert.deepEqual([sm['claude-x'].input, sm['claude-x'].output, sm['claude-x'].reported, sm['claude-x'].messages, sm['claude-x'].chats], [321, 123, 1, 1, 1], '上游报了用量就原样采用');
		assert.equal(sm['gpt-4o-mini'].chars, 5);
		assert.equal(sm['gpt-4o-mini'].reported, 0);
		assert.equal(sm['gpt-4o-mini'].output, Math.round(5 * 0.8), '没有用量时按模型家族估算输出');
		// 输入 = 上文（那条用户消息）：6 个汉字 + 其余部分折成的字符
		const restLen = '你好，world 2024！请写一个 hello-world。'.replace(/[\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').length;
		assert.equal(sm['gpt-4o-mini'].input, Math.round(6 * 0.8 + restLen * 0.25), '输入按上文估算');
		// 只报了输出、没报输入：输出用上游的，输入估算，仍算作有上报
		assert.deepEqual([sm['deepseek-chat'].output, sm['deepseek-chat'].reported], [50, 1]);
		assert.equal(sm['deepseek-chat'].input, Math.round(6 * 0.6 + restLen * 0.3));
		// 用户字数：stats-0 那条是 6 字 + 3 词 = 9；其余每个对话的提问「关于<标题>的问题」全是汉字和数字
		const one = (await (await get('/api/chats/stats-0')).json()).record;
		assert.ok(one.chat.history.messages.u1);
		const userChars = stats.user.chars;
		assert.equal((await (await get('/api/stats')).json()).user.chars, userChars, '重复请求结果一致（走缓存）');
		assert.ok(userChars >= 10 && stats.user.messages >= idx.chats.length);

		// 统计存在数据库里，重启服务不必重算
		assert.equal(new (require('node:sqlite').DatabaseSync)(path.join(TMP, 'archive.db'), { readOnly: true }).prepare('SELECT COUNT(*) AS n FROM chat_stats').get().n, idx.chats.length, '每个对话的统计在同步时就存下了');

		// ── 对话正文：版本没变时回 304 ──
		r = await get('/api/chats/stats-0');
		const rev = r.headers.get('x-chat-rev');
		await r.text();
		r = await get('/api/chats/stats-0', { headers: { 'If-None-Match': `"${rev}"` } });
		assert.equal(r.status, 304);
		assert.equal((await r.text()).length, 0);
		assert.equal((await get('/api/chats/stats-0', { headers: { 'If-None-Match': '"旧的"'.replace('旧的', 'old') } })).status, 200, '版本对不上就照常返回');
		assert.equal((await get('/api/chats/stats-0?download', { headers: { 'If-None-Match': `"${rev}"` } })).status, 200, '下载不走 304');
		assert.equal((await get('/api/chats/no-such', { headers: { 'If-None-Match': `"${rev}"` } })).status, 404);

		// ── 登录限速：认反向代理写的地址（X-Forwarded-For 最右一段），伪造的头绕不过去 ──
		const bad = (headers) => fetch(base + '/api/login', { method: 'POST', headers, body: JSON.stringify({ password: 'x' }) }).then((x) => x.status);
		for (let i = 0; i < 5; i++) assert.equal(await bad({ 'X-Forwarded-For': `10.0.0.${i}, 203.0.113.7`, 'CF-Connecting-IP': `10.1.1.${i}` }), 401);
		assert.equal(await bad({ 'X-Forwarded-For': '10.9.9.9, 203.0.113.7', 'CF-Connecting-IP': '10.2.2.2' }), 429, '换着花样伪造左边的地址和 CF 头也照样被限');
		assert.equal(await bad({ 'X-Forwarded-For': '203.0.113.8' }), 401, '别的访问者不受牵连');

		// ── 导出整个归档 ──
		assert.equal((await fetch(base + '/api/export')).status, 401);
		r = await get('/api/export');
		assert.match(r.headers.get('content-disposition'), /attachment; filename="owui-archive-\d{4}-\d\d-\d\d\.json"/);
		const all = await r.json();
		assert.equal(all.length, idx.chats.length, '导出包含全部对话（含源站已删除的）');
		assert.ok(all.every((c) => c.id && c.chat?.history?.messages), '每项是完整的原始对话对象');

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
