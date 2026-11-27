/* 离线可读：缓存页面外壳和读过的对话。只处理 GET；写入（阅读位置、收藏、登录）一律直连网络 */
'use strict';
const STATIC = 'owa-static-v1';
const DATA = 'owa-data-v1'; // 登录后才能拿到的内容，退出登录 / 会话失效时整个删掉
const SHELL = ['/', '/theme-init.js', '/app.js', '/style.css', '/favicon.svg', '/vendor/marked.js', '/vendor/purify.js', '/vendor/highlight.js', '/vendor/hljs-light.css', '/vendor/hljs-dark.css', '/vendor/katex/katex.min.css', '/vendor/katex/katex.min.js'];
const INDEX = '/api/index';
const KEEP = new Set([INDEX, '/api/stars', '/api/stats']); // 不参与淘汰
const MAX_ENTRIES = 1000;
const MAX_BYTES = 300 * 1024 * 1024;
const SLOW = 3000; // 网络这么久没有回音、手里又有存货，就先用存货
const WARM_MAX = 1024 * 1024; // 后台预存时跳过比这更大的对话
const IMG_MAX = 5 * 1024 * 1024;

self.addEventListener('install', (e) => {
	e.waitUntil(
		(async () => {
			const cache = await caches.open(STATIC);
			await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
			// 公式字体平时按需加载，离线时就来不及了，这里一次备齐
			try {
				const css = await (await cache.match('/vendor/katex/katex.min.css')).text();
				const fonts = [...new Set([...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => '/vendor/katex/' + m[1]))];
				await Promise.all(fonts.map((u) => cache.add(u).catch(() => {})));
			} catch {}
			await self.skipWaiting();
		})()
	);
});
self.addEventListener('activate', (e) => {
	e.waitUntil(
		(async () => {
			for (const k of await caches.keys()) if (k !== STATIC && k !== DATA) await caches.delete(k);
			await self.clients.claim();
		})()
	);
});

// 退出登录 / 会话失效后加一：在那之前发出去的请求，回来了也不再往缓存里放
let epoch = 0;
self.addEventListener('message', (e) => {
	if (e.data !== 'logout') return;
	epoch++;
	e.waitUntil(caches.delete(DATA));
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 连不上服务器、又拿不出存货时的回答。带上标记，页面据此知道这不是服务器说的
const unavailable = (url) => {
	const p = url.pathname;
	const headers = { 'X-OWA-Cached': '1', 'Cache-Control': 'no-store' };
	// 附件可能是在新标签页里直接打开的，给一句人能看的话
	if (p.startsWith('/files/')) return new Response('连不上服务器，这个附件没有缓存', { status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
	const error = p === INDEX ? '连不上服务器，也没有可用的缓存' : '连不上服务器，这部分内容还没有缓存';
	return new Response(JSON.stringify({ error }), { status: 503, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
};

// 登录后的内容里值得存的：对话列表、收藏、统计、对话正文、图片附件。
// 阅读位置不存（离线时以本机记录为准）；同步状态、搜索、导出只有在线才有意义
const cacheable = (url) => {
	const p = url.pathname;
	return !url.search && (KEEP.has(p) || /^\/api\/chats\/[^/]+$/.test(p) || /^\/files\/[^/]+$/.test(p));
};
// 接口只存 JSON；附件只存图片（其余类型是点了才下载的文件）
const storable = (url, res) => {
	const type = res.headers.get('Content-Type') || '';
	if (url.pathname.startsWith('/api/')) return type.includes('json');
	return type.startsWith('image/') && !(Number(res.headers.get('Content-Length')) > IMG_MAX);
};

let puts = 0;
// 条目数或总大小超出上限时，从最久没更新的删起（缓存按存入的先后排列）
async function trim(cache, extra = 0) {
	const all = (await cache.matchAll()).filter((r) => r.url && !KEEP.has(new URL(r.url).pathname));
	let cut = Math.min(all.length, Math.max(0, all.length - MAX_ENTRIES) + extra);
	let bytes = 0;
	for (let i = all.length - 1; i >= cut; i--) {
		bytes += Number(all[i].headers.get('X-Chat-Size') || all[i].headers.get('Content-Length')) || 0;
		if (bytes > MAX_BYTES) cut = i + 1;
	}
	for (const r of all.slice(0, cut)) await cache.delete(r.url);
}
// born：发请求时的 epoch。会话在这期间结束了的话，这一条不留
async function remember(url, res, born) {
	const cache = await caches.open(DATA);
	if (born !== epoch) return;
	try {
		await cache.put(url.href, res);
	} catch (e) {
		// 空间不够：腾掉最旧的一批，下次就存得进去了。其他失败（多半是传到一半断了）不动已有的内容
		if (e?.name === 'QuotaExceededError') await trim(cache, 50);
		return;
	}
	if (born !== epoch) return void (await cache.delete(url.href));
	if (puts++ % 20 === 0) await trim(cache);
}
// 存货只在登录有效期内可读：对话列表的响应头里带着这次登录的到期时间
async function stored(href) {
	if (!(await caches.has(DATA))) return null;
	const cache = await caches.open(DATA);
	const exp = Number((await cache.match(INDEX))?.headers.get('X-Session-Exp')) || 0;
	if (exp <= Date.now()) {
		if (exp) await caches.delete(DATA);
		return null;
	}
	const hit = await cache.match(href);
	if (!hit) return null;
	const headers = new Headers(hit.headers);
	headers.set('X-OWA-Cached', '1');
	return new Response(hit.body, { status: 200, headers });
}

// 网络优先。连不上（断网、网关报错）时用存货；网络没断但迟迟没有回音、而手里有存货时，也先用存货
// —— 请求照常跑完，回来的结果存起来下次用。fallback(failed)：failed 为假时拿不出存货就返回 null
let slowUntil = 0; // 刚有请求等超时了：接下来一小段时间，别的请求不必各等一遍
async function answer(net, fallback, patient) {
	let res;
	try {
		res = await (patient ? net : Promise.race([net, wait(Date.now() < slowUntil ? 400 : SLOW)]));
	} catch {
		return fallback(true);
	}
	if (res) slowUntil = 0;
	else slowUntil = Date.now() + 20000;
	if (res && res.status < 502) return res;
	return (await fallback(false)) || res || net.catch(() => fallback(true));
}
function data(e, url) {
	const req = e.request;
	const born = epoch;
	const warm = req.headers.has('X-OWA-Warm'); // 后台预存（见 app.js 的 warmCache）
	let saving = null;
	// 对话正文：手里存着一份的话把它的版本报给服务器，没变就只回一个 304，不必把几 MB 的正文再传一遍
	const conditional = async () => {
		if (!/^\/api\/chats\/[^/]+$/.test(url.pathname) || !(await caches.has(DATA))) return fetch(req);
		const have = await (await caches.open(DATA)).match(url.href);
		const rev = have?.headers.get('X-Chat-Rev');
		if (!rev) return fetch(req);
		const headers = new Headers(req.headers);
		headers.set('If-None-Match', `"${rev}"`);
		const res = await fetch(new Request(req, { headers }));
		// 服务器确认过了，这一份就是最新的（不带「来自缓存」的标记）
		return res.status === 304 && born === epoch ? new Response(have.body, { status: 200, headers: have.headers }) : res;
	};
	const net = conditional().then(async (res) => {
		if (res.status === 401) {
			epoch++;
			await caches.delete(DATA);
		} else if (res.status === 200) {
			const ok = storable(url, res);
			// 接口返回的不是 JSON：多半是被中间的什么东西（比如要登录的 Wi-Fi）换掉了，当作没连上
			if (!ok && url.pathname.startsWith('/api/')) throw new Error('unexpected response');
			if (ok && res.url && !(warm && Number(res.headers.get('X-Chat-Size')) > WARM_MAX)) saving = remember(url, res.clone(), born).catch(() => {});
		}
		return res;
	});
	e.waitUntil(net.then(() => saving, () => {}));
	// 统计可能要算上好一会儿，后台刷新列表时也宁可多等：这两种情况不因为慢就改用存货
	e.respondWith(answer(net, async (failed) => (await stored(url.href)) || (failed ? unavailable(url) : null), url.pathname === '/api/stats' || req.headers.has('X-OWA-Patient')));
}
function shell(e) {
	const req = e.request;
	const cache = caches.open(STATIC);
	let saving = null;
	const net = fetch(req).then((res) => {
		if (res.status === 200) {
			const copy = res.clone();
			// 内容没变（ETag 相同）就不重写一遍
			saving = cache
				.then(async (c) => {
					const tag = copy.headers.get('ETag');
					if (tag && (await c.match(req))?.headers.get('ETag') === tag) return copy.body?.cancel();
					await c.put(req, copy);
				})
				.catch(() => {});
		}
		return res;
	});
	e.waitUntil(net.then(() => saving, () => {}));
	e.respondWith(
		answer(net, async (failed) => {
			const c = await cache;
			return (await c.match(req)) || (req.mode === 'navigate' && (await c.match('/'))) || (failed ? Response.error() : null);
		})
	);
}
self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) {
		if (cacheable(url) && !req.headers.has('range')) data(e, url);
	} else shell(e);
});
