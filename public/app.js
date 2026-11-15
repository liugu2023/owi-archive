/* 对话归档阅读站前端：只读浏览、搜索、分支切换、导出，以及查找 / 目录 / 续读等阅读工具 */
(() => {
	'use strict';

	// ───────────── 小工具 ─────────────
	const $app = document.getElementById('app');
	const h = (tag, props = {}, ...children) => {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(props || {})) {
			if (v == null || v === false) continue;
			if (k === 'class') el.className = v;
			else if (k === 'html') el.innerHTML = v; // 仅用于已净化的内容或内置图标
			else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
			else if (k === 'dataset') Object.assign(el.dataset, v);
			else el.setAttribute(k, v === true ? '' : v);
		}
		for (const c of children.flat(Infinity)) {
			if (c == null || c === false) continue;
			el.append(c.nodeType ? c : document.createTextNode(String(c)));
		}
		return el;
	};
	const icon = (d, size = 16) =>
		`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	const I = {
		search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
		menu: icon('<path d="M4 6h16M4 12h16M4 18h16"/>', 20),
		sync: icon('<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M5 3v5h5M19 21v-5h-5"/>'),
		folder: icon('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
		chevron: icon('<path d="m9 6 6 6-6 6"/>', 14),
		left: icon('<path d="m15 6-6 6 6 6"/>', 14),
		copy: icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 14),
		check: icon('<path d="m5 12 5 5 9-10"/>', 14),
		theme: icon('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
		sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
		download: icon('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
		logout: icon('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'),
		file: icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
		x: icon('<path d="M6 6l12 12M18 6 6 18"/>', 14),
		close: icon('<path d="M6 6l12 12M18 6 6 18"/>', 20),
		print: icon('<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>'),
		think: icon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>', 14),
		tool: icon('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>', 14),
		spark: icon('<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>', 14),
		archive: icon('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>', 26),
		find: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18),
		list: icon('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', 18),
		type: icon('<path d="M3 18 8.5 5h1L15 18M5.2 13.5h7.6M17 18v-5.5a2.5 2.5 0 0 1 5 0V18M22 15.5h-5"/>', 18),
		up: icon('<path d="m6 15 6-6 6 6"/>', 18),
		down: icon('<path d="m6 9 6 6 6-6"/>', 18),
		toTop: icon('<path d="M12 20V8m0 0-5 5m5-5 5 5M5 4h14"/>', 18),
		toBottom: icon('<path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/>', 18),
		external: icon('<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
		clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 14),
		link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 14),
		prev: icon('<path d="m15 6-6 6 6 6"/>', 20),
		next: icon('<path d="m9 6 6 6-6 6"/>', 20),
		panel: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
		star: icon('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>', 14),
		filter: icon('<path d="M4 6h16M7 12h10M10 18h4"/>')
	};
	const logo = (size) =>
		h('span', {
			class: 'logo',
			html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M9 11h14M9 16h14M9 21h9" stroke-width="2.4" stroke-linecap="round"/></svg>`
		});

	const api = async (url, opts) => {
		const res = await fetch(url, { credentials: 'same-origin', ...opts });
		if (res.status === 401 && url !== '/api/login') {
			showLogin();
			throw new Error('unauthorized');
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
		return data;
	};

	const pad = (n) => String(n).padStart(2, '0');
	const fmtDate = (sec, withTime = true) => {
		if (!sec) return '';
		const d = new Date(sec * 1000);
		const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
	};
	const ago = (sec) => {
		if (!sec) return '从未';
		const s = Math.max(0, Date.now() / 1000 - sec);
		if (s < 60) return '刚刚';
		if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
		if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
		return `${Math.floor(s / 86400)} 天前`;
	};
	// Open WebUI 的消息时间戳是秒，个别旧数据是毫秒/纳秒
	const normTs = (t) => {
		t = Number(t) || 0;
		while (t > 1e11) t = Math.floor(t / 1000);
		return t;
	};

	// ───────────── 主题 ─────────────
	const applyTheme = () => {
		const pref = localStorage.getItem('theme') || 'auto';
		const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		document.getElementById('hljs-dark').disabled = !dark;
		document.getElementById('hljs-light').disabled = dark;
		const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
		if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
	};
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
	applyTheme();
	const toggleTheme = () => {
		localStorage.setItem('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
		applyTheme();
	};

	// ───────────── 阅读偏好与阅读记录（仅存在本机浏览器里） ─────────────
	const store = {
		get(key, fallback) {
			try {
				const v = JSON.parse(localStorage.getItem(key));
				return v ?? fallback;
			} catch {
				return fallback;
			}
		},
		set(key, value) {
			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch {}
		}
	};
	const FONT_STEPS = [0.9, 1, 1.1, 1.2, 1.35];
	const prefs = { font: 1, wide: false, wrap: false, hideSide: false, ...store.get('reader', {}) };
	if (!(prefs.font >= 0 && prefs.font < FONT_STEPS.length)) prefs.font = 1;
	const applyPrefs = () => {
		document.documentElement.style.setProperty('--fs', FONT_STEPS[prefs.font]);
		document.documentElement.classList.toggle('wide', !!prefs.wide);
		document.documentElement.classList.toggle('code-wrap', !!prefs.wrap);
		document.documentElement.classList.toggle('side-off', !!prefs.hideSide);
		store.set('reader', prefs);
	};
	applyPrefs();

	if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
	let restoreOnLoad = ['reload', 'back_forward'].includes(performance.getEntriesByType?.('navigation')[0]?.type);

	// 每个对话读到哪里：{ [chatId]: { m: 消息 id, r: 该消息内的相对位置, p: 整体进度 0-100, t: 时间戳, s: 是否已同步到服务器 } }
	// 本机先记在 localStorage 里（离线也能用），再同步到服务器，别的设备打开时就能接着读
	const READ_MAX = 200;
	const reading = store.get('reading', {});
	const unfinished = (id) => reading[id]?.p >= 3 && reading[id].p <= 97;
	const saveReading = (id, pos) => {
		reading[id] = { ...pos, t: Date.now() };
		const ids = Object.keys(reading);
		if (ids.length > READ_MAX) {
			ids.sort((a, b) => reading[a].t - reading[b].t);
			for (const old of ids.slice(0, ids.length - READ_MAX)) delete reading[old];
		}
		store.set('reading', reading);
		clearTimeout(pushTimer);
		pushTimer = setTimeout(pushReading, 1500);
	};
	let pushTimer = 0;
	let lastPull = 0;
	const inflight = new Set();
	const pushOne = async (id, keepalive) => {
		const rec = reading[id];
		if (!rec || rec.s || inflight.has(id)) return;
		inflight.add(id);
		const stamp = rec.t;
		try {
			const res = await fetch(`/api/reading/${encodeURIComponent(id)}`, {
				method: 'PUT',
				credentials: 'same-origin',
				keepalive,
				headers: { 'Content-Type': 'application/json' },
				// 各设备的时钟不一定准，只告诉服务器「这是多久以前读的」
				body: JSON.stringify({ m: rec.m ?? null, r: rec.r || 0, p: rec.p || 0, age: Math.max(0, Date.now() - stamp) })
			});
			const same = reading[id]?.t === stamp; // 等回应的这会儿又往下读了的话，下一轮再传
			if (res.status === 404 || res.status === 400) {
				if (same) delete reading[id]; // 对话已经不在归档里了
			} else if (res.ok && same) {
				const d = await res.json();
				// stale：别的设备上有更新的位置，以它为准
				reading[id] = d.stale ? { ...d.reading, s: 1 } : { ...rec, t: d.t, s: 1 };
				if (d.stale) refreshRecents();
			}
			store.set('reading', reading);
		} catch {
			// 离线或请求失败：记录留着，下次再传
		} finally {
			inflight.delete(id);
		}
	};
	const pushReading = (keepalive = false) => {
		clearTimeout(pushTimer);
		return Promise.all(
			Object.keys(reading)
				.filter((id) => !reading[id].s)
				.slice(0, 20)
				.map((id) => pushOne(id, keepalive === true))
		);
	};
	// 取回服务器上的阅读位置；返回被别的设备更新过的对话 id
	const pullReading = async () => {
		const changed = [];
		try {
			const res = await fetch('/api/reading', { credentials: 'same-origin' });
			if (!res.ok) return changed;
			const remote = (await res.json()).reading || {};
			lastPull = Date.now();
			for (const [id, r] of Object.entries(remote)) {
				const cur = reading[id];
				if (cur && !cur.s) continue; // 本机有还没传上去的位置，等上传时由服务器裁决新旧
				if (!cur || cur.t !== r.t) {
					reading[id] = { ...r, s: 1 };
					changed.push(id);
				}
			}
			if (changed.length) store.set('reading', reading);
		} catch {}
		pushReading();
		return changed;
	};

	// ───────────── 收藏的消息（存在服务器上，各设备共用） ─────────────
	const stars = new Map(); // `${chatId}/${messageId}` -> { chat_id, message_id, role, excerpt, t }
	const starKey = (chatId, mid) => `${chatId}/${mid}`;
	const loadStars = async () => {
		try {
			const res = await fetch('/api/stars', { credentials: 'same-origin' });
			if (!res.ok) return;
			stars.clear();
			for (const x of (await res.json()).stars) stars.set(starKey(x.chat_id, x.message_id), x);
		} catch {}
	};
	// 先改界面再发请求，失败了改回去
	const toggleStar = async (chatId, m) => {
		const key = starKey(chatId, m.id);
		const had = stars.get(key);
		const url = `/api/stars/${encodeURIComponent(chatId)}/${encodeURIComponent(m.id)}`;
		const paint = () => {
			renderSidebar();
			if (state.current?.id !== chatId) return;
			const el = document.getElementById(`m-${m.id}`);
			const on = stars.has(key);
			el?.classList.toggle('starred', on);
			const btn = el?.querySelector('.star-btn');
			btn?.setAttribute('aria-pressed', String(on));
			btn?.setAttribute('title', on ? '取消收藏' : '收藏这条消息');
			btn?.setAttribute('aria-label', on ? '取消收藏' : '收藏这条消息');
		};
		const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system';
		const excerpt = messageText(m).replace(/\s+/g, ' ').trim().slice(0, 200);
		if (had) stars.delete(key);
		else stars.set(key, { chat_id: chatId, message_id: String(m.id), role, excerpt, t: Date.now() });
		paint();
		try {
			await api(url, had ? { method: 'DELETE' } : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ excerpt, role }) });
		} catch {
			if (had) stars.set(key, had);
			else stars.delete(key);
			paint();
		}
	};

	// ───────────── Markdown 渲染 ─────────────
	const mathExt = (name, level, startRe, re, display) => ({
		name,
		level,
		start: (src) => src.match(startRe)?.index,
		tokenizer(src) {
			const m = re.exec(src);
			if (m) return { type: name, raw: m[0], text: m[1].trim(), display };
		},
		// 先输出占位符，净化之后再交给 KaTeX 渲染（KaTeX 依赖内联 style，而正文里的 style 一律禁用）
		renderer(tok) {
			const tag = tok.display ? 'div' : 'span';
			return `<${tag} class="${tok.display ? 'math-block' : 'math-inline'}" data-tex="${escapeHtml(tok.text)}">${escapeHtml(tok.raw)}</${tag}>`;
		}
	});
	const escapeHtml = (s) =>
		String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
	const unescapeHtml = (s) => {
		const t = document.createElement('textarea');
		t.innerHTML = s;
		return t.value;
	};

	marked.use({
		gfm: true,
		breaks: true,
		extensions: [
			mathExt('mathBlockDollar', 'block', /\$\$/, /^\$\$([\s\S]+?)\$\$(?:\n|$)/, true),
			mathExt('mathBlockBracket', 'block', /\\\[/, /^\\\[([\s\S]+?)\\\](?:\n|$)/, true),
			mathExt('mathInlineDD', 'inline', /\$\$/, /^\$\$([^\n]+?)\$\$/, true),
			mathExt('mathInlineBracket', 'inline', /\\\[/, /^\\\[([\s\S]+?)\\\]/, true),
			mathExt('mathInlineParen', 'inline', /\\\(/, /^\\\(([\s\S]+?)\\\)/, false),
			// $…$：两侧不能是空白，结尾后不能紧跟数字（避免把金额当公式）
			mathExt('mathInlineDollar', 'inline', /\$/, /^\$(?!\s)((?:\\.|[^\\\n$])+?)(?<!\s)\$(?!\d)/, false)
		]
	});

	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName === 'A' && node.hasAttribute('href')) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
		if (node.tagName === 'IMG') {
			node.setAttribute('loading', 'lazy');
			node.setAttribute('referrerpolicy', 'no-referrer');
		}
	});

	// 源站的文件地址 → 本地已归档的附件
	const FILE_URL = /(?:https?:\/\/[^\s"'()<>]+)?\/api\/v1\/files\/([0-9a-fA-F-]{36})(?:\/content(?:\/[^\s"'()<>]*)?)?/g;
	const localizeFiles = (s) => s.replace(FILE_URL, '/files/$1');
	const UUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
	const fileUrl = (u) => {
		if (!u || typeof u !== 'string') return null;
		if (UUID.test(u)) return `/files/${u}`;
		if (u.startsWith('data:image/') || /^https?:\/\//.test(u) || u.startsWith('/')) return localizeFiles(u);
		return null;
	};

	const md = (text) => {
		const html = marked.parse(localizeFiles(String(text ?? '')));
		return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'], FORBID_ATTR: ['style'] });
	};

	const copyBtn = (getText, label = '复制', ico = I.copy) => {
		const btn = h('button', { class: 'icon-btn', title: label, 'aria-label': label, html: ico });
		btn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(getText());
				btn.innerHTML = I.check;
				btn.classList.add('ok');
				setTimeout(() => {
					btn.innerHTML = ico;
					btn.classList.remove('ok');
				}, 1200);
			} catch {}
		});
		return btn;
	};

	const CODE_FOLD = 40; // 超过这么多行的代码块默认只显示开头
	const mdNode = (text, cls = 'md') => {
		const el = h('div', { class: cls, html: md(text) });
		for (const node of el.querySelectorAll('[data-tex]')) {
			try {
				katex.render(node.dataset.tex, node, { displayMode: node.classList.contains('math-block'), throwOnError: false, output: 'html' });
			} catch {}
		}
		for (const pre of el.querySelectorAll('pre')) {
			const code = pre.querySelector('code');
			if (!code) continue;
			const lang = (/language-([\w+#.-]+)/.exec(code.className) || [])[1] || '';
			if (lang && hljs.getLanguage(lang)) {
				try {
					hljs.highlightElement(code);
				} catch {}
			}
			const wrap = h(
				'div',
				{ class: 'code-block' },
				h('div', { class: 'code-head' }, h('span', {}, lang || 'text'), copyBtn(() => code.textContent, '复制代码'))
			);
			pre.replaceWith(wrap);
			wrap.append(pre);
			const lines = code.textContent.replace(/\n$/, '').split('\n').length;
			if (lines > CODE_FOLD) {
				wrap.classList.add('long');
				const more = h('button', { class: 'code-more', 'aria-expanded': 'false' });
				wrap._setOpen = (open) => {
					wrap.classList.toggle('open', open);
					more.setAttribute('aria-expanded', String(open));
					more.textContent = open ? '收起代码' : `展开全部 ${lines} 行`;
				};
				more.addEventListener('click', () => {
					const open = !wrap.classList.contains('open');
					wrap._setOpen(open);
					// 收起时按钮在代码块底部，别让页面一下子跳走
					if (!open && wrap.getBoundingClientRect().top < topOffset()) scrollToEl(wrap);
				});
				wrap._setOpen(false);
				wrap.append(more);
			}
		}
		for (const table of el.querySelectorAll('table')) {
			const wrap = h('div', { class: 'table-wrap' });
			table.replaceWith(wrap);
			wrap.append(table);
		}
		return el;
	};

	// ───────────── 消息内容解析 ─────────────
	const partsText = (parts) => {
		if (typeof parts === 'string') return parts;
		if (!Array.isArray(parts)) return '';
		return parts
			.map((p) => (typeof p === 'string' ? p : (p?.text ?? '')))
			.filter(Boolean)
			.join('\n\n');
	};
	const asText = (v) => {
		if (v == null) return '';
		if (typeof v === 'string') return v;
		if (Array.isArray(v) && v.every((p) => p && typeof p === 'object' && 'text' in p)) return partsText(v);
		try {
			return JSON.stringify(v, null, 2);
		} catch {
			return String(v);
		}
	};
	const prettyJson = (s) => {
		if (typeof s !== 'string') return asText(s);
		try {
			const v = JSON.parse(s);
			return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
		} catch {
			return s;
		}
	};
	const codeBox = (label, text) =>
		h('div', { class: 'kv' }, h('div', { class: 'kv-label' }, label), h('pre', { class: 'plain' }, text));

	const collapsible = (title, bodyFn, kind = '') => {
		const d = h(
			'details',
			{ class: `fold ${kind}` },
			h(
				'summary',
				{},
				h('span', { class: 'fold-caret', html: I.chevron }),
				kind ? h('span', { class: 'fold-icon', html: kind === 'reasoning' ? I.think : I.tool }) : null,
				h('span', { class: 'fold-title' }, title)
			)
		);
		let filled = false;
		d._fill = () => {
			if (filled) return;
			filled = true;
			d.append(h('div', { class: 'fold-body' }, bodyFn()));
		};
		d.addEventListener('toggle', () => {
			if (d.open) d._fill();
		});
		return d;
	};
	const durText = (d) => (d !== '' && d != null && !isNaN(Number(d)) ? `（${Number(d)} 秒）` : '');
	const reasoningNode = (text, duration) => collapsible(`思考过程${durText(duration)}`, () => mdNode(text, 'md muted'), 'reasoning');
	const toolNode = (name, args, result) =>
		collapsible(
			`工具调用：${name || '未知工具'}`,
			() => [args ? codeBox('参数', prettyJson(args)) : null, result ? codeBox('结果', prettyJson(result)) : null],
			'tool'
		);

	// 把旧格式 content 里的 <details type="…"> 块拆出来单独渲染
	const splitDetails = (content) => {
		const segs = [];
		const openRe = /<details\b([^>]*)>/g;
		let pos = 0;
		let m;
		while ((m = openRe.exec(content))) {
			// 找到与之配对的 </details>（考虑嵌套）
			const tagRe = /<details\b[^>]*>|<\/details>/g;
			tagRe.lastIndex = openRe.lastIndex;
			let depth = 1;
			let t;
			let end = -1;
			while ((t = tagRe.exec(content))) {
				depth += t[0][1] === '/' ? -1 : 1;
				if (depth === 0) {
					end = t.index;
					break;
				}
			}
			const attrs = {};
			for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = unescapeHtml(a[2]);
			if (!attrs.type) {
				// 普通 details 交给 markdown
				continue;
			}
			if (m.index > pos) segs.push({ text: content.slice(pos, m.index) });
			const inner = end < 0 ? content.slice(openRe.lastIndex) : content.slice(openRe.lastIndex, end);
			segs.push({ attrs, inner });
			pos = end < 0 ? content.length : end + '</details>'.length;
			openRe.lastIndex = pos;
			if (end < 0) break;
		}
		if (pos < content.length) segs.push({ text: content.slice(pos) });
		return segs;
	};

	const renderContentString = (content) => {
		const nodes = [];
		for (const seg of splitDetails(content)) {
			if (seg.text !== undefined) {
				if (seg.text.trim()) nodes.push(mdNode(seg.text));
				continue;
			}
			const { attrs } = seg;
			const body = seg.inner
				.replace(/<summary>[\s\S]*?<\/summary>/, '')
				.trim();
			if (attrs.type === 'reasoning') {
				const text = body.replace(/^> ?/gm, '');
				nodes.push(reasoningNode(text, attrs.duration));
			} else if (attrs.type === 'tool_calls') {
				nodes.push(toolNode(attrs.name, attrs.arguments, attrs.result));
				// 工具返回的图片等文件
				try {
					for (const f of JSON.parse(attrs.files || '[]')) {
						const u = fileUrl(typeof f === 'string' ? f : f?.url);
						if (u) nodes.push(imageNode(u));
					}
				} catch {}
			} else if (attrs.type === 'code_interpreter') {
				nodes.push(collapsible('代码执行', () => renderContentStringOrMd(body), 'tool'));
			} else {
				const title = (/<summary>([\s\S]*?)<\/summary>/.exec(seg.inner) || [])[1] || attrs.type;
				nodes.push(collapsible(unescapeHtml(title.replace(/<[^>]+>/g, '')), () => mdNode(body)));
			}
		}
		return nodes;
	};
	const renderContentStringOrMd = (s) => mdNode(s);

	const imageNode = (src) => {
		const img = h('img', { class: 'attach-img', src, loading: 'lazy', alt: '图片', referrerpolicy: 'no-referrer', tabindex: '0', role: 'button', 'aria-label': '查看图片' });
		img.addEventListener('click', () => openLightbox(src, img));
		img.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter' && e.key !== ' ') return;
			e.preventDefault();
			openLightbox(src, img);
		});
		img.addEventListener('error', () => img.replaceWith(h('div', { class: 'chip dim' }, '图片未归档')));
		return img;
	};

	// 新格式：结构化 output 列表（OpenAI Responses 风格）
	const renderOutput = (output) => {
		const nodes = [];
		const outputs = new Map();
		for (const it of output) if (it?.type === 'function_call_output' && it.call_id) outputs.set(it.call_id, it);
		const used = new Set();
		for (const it of output) {
			if (!it || typeof it !== 'object') continue;
			switch (it.type) {
				case 'message': {
					const text = partsText(it.content);
					if (text.trim()) nodes.push(...renderContentString(text));
					break;
				}
				case 'reasoning': {
					const text = partsText(it.summary?.length ? it.summary : it.content);
					if (text.trim()) nodes.push(reasoningNode(text, it.duration));
					break;
				}
				case 'function_call': {
					const out = outputs.get(it.call_id ?? it.id);
					if (out) used.add(out);
					nodes.push(toolNode(it.name, it.arguments, out ? asText(out.output) : ''));
					break;
				}
				case 'function_call_output':
					if (!used.has(it) && ![...output].some((c) => c?.type === 'function_call' && (c.call_id ?? c.id) === it.call_id)) {
						nodes.push(toolNode('', '', asText(it.output)));
					}
					break;
				case 'open_webui:code_interpreter':
					nodes.push(
						collapsible(
							'代码执行',
							() => [
								it.code ? mdNode('```' + (it.lang || 'python') + '\n' + it.code + '\n```') : null,
								it.output != null ? codeBox('输出', asText(it.output)) : null
							],
							'tool'
						)
					);
					break;
				case 'image_generation_call':
					if (typeof it.result === 'string' && it.result) {
						nodes.push(imageNode(it.result.startsWith('data:') ? it.result : `data:image/${it.output_format || 'png'};base64,${it.result}`));
					}
					break;
				case 'open_webui:context_compaction':
					nodes.push(collapsible('上下文已压缩', () => mdNode(typeof it.summary === 'string' ? it.summary : ''), 'reasoning'));
					break;
				default:
					nodes.push(collapsible(String(it.type || '其他输出'), () => codeBox('原始数据', asText(it)), 'tool'));
			}
		}
		return nodes;
	};

	const messageText = (m) => {
		if (m.role === 'assistant' && Array.isArray(m.output) && m.output.length) {
			const t = m.output
				.filter((it) => it?.type === 'message')
				.map((it) => partsText(it.content))
				.join('\n\n');
			if (t.trim()) return t;
		}
		const c = partsText(m.content);
		return splitDetails(c)
			.filter((s) => s.text !== undefined)
			.map((s) => s.text)
			.join('')
			.trim();
	};

	// ───────────── 消息树 ─────────────
	const buildTree = (chatBody) => {
		let map = chatBody?.history?.messages;
		let currentId = chatBody?.history?.currentId ?? null;
		if (!map || !Object.keys(map).length) {
			// 旧格式：线性 messages 列表
			map = {};
			let prev = null;
			for (const [i, m] of (chatBody?.messages || []).entries()) {
				const id = String(m.id ?? `m${i}`);
				map[id] = { ...m, id, parentId: m.parentId !== undefined ? m.parentId : prev };
				prev = id;
			}
			currentId = prev;
		}
		const children = new Map(); // parentId|null -> [id]
		const push = (p, id) => (children.get(p) || children.set(p, []).get(p)).push(id);
		const ids = Object.keys(map);
		for (const id of ids) {
			const m = map[id];
			if (m.id == null) m.id = id;
			const parent = m.parentId != null && map[m.parentId] ? m.parentId : null;
			m._parent = parent;
			push(parent, id);
		}
		// 尽量沿用源数据里的 childrenIds 顺序，其余按时间
		for (const [p, list] of children) {
			const order = p != null && Array.isArray(map[p].childrenIds) ? map[p].childrenIds : null;
			list.sort((a, b) => {
				if (order) {
					const ia = order.indexOf(a);
					const ib = order.indexOf(b);
					if (ia >= 0 && ib >= 0) return ia - ib;
				}
				return normTs(map[a].timestamp) - normTs(map[b].timestamp);
			});
		}
		const choice = new Map(); // parentId|null -> 选中的子消息
		const selectPathTo = (id) => {
			const seen = new Set();
			while (id != null && map[id] && !seen.has(id)) {
				seen.add(id);
				choice.set(map[id]._parent, id);
				id = map[id]._parent;
			}
		};
		if (currentId != null && map[currentId]) selectPathTo(currentId);
		const path = () => {
			const out = [];
			const seen = new Set();
			let parent = null;
			for (;;) {
				const sibs = children.get(parent);
				if (!sibs?.length) break;
				let id = choice.get(parent);
				if (id == null || !sibs.includes(id)) id = sibs[sibs.length - 1];
				if (seen.has(id)) break;
				seen.add(id);
				out.push({ msg: map[id], siblings: sibs, index: sibs.indexOf(id), parent });
				parent = id;
			}
			return out;
		};
		return { map, children, choice, path, selectPathTo, total: ids.length };
	};

	// ───────────── 状态 ─────────────
	const state = {
		chats: [],
		byId: new Map(),
		folders: [],
		status: null,
		query: '',
		results: null, // Map id -> {snippet, message_id, count}
		view: 'active', // active | archived
		tag: null,
		openFolders: new Set(JSON.parse(localStorage.getItem('openFolders') || '[]')),
		currentId: null,
		current: null, // { meta, record, tree }
		focusMessage: null,
		findQuery: null, // 从搜索结果点进来时，在对话里高亮这个词
		resume: false, // 从「继续阅读」点进来时，直接回到上次的位置
		filter: { model: '', days: 0 }, // 列表 / 搜索结果的筛选
		filterOpen: false
	};
	const filterOn = () => !!(state.filter.model || state.filter.days);
	const passFilter = (c) => (!state.filter.model || c.models.includes(state.filter.model)) && (!state.filter.days || c.updated_at >= Date.now() / 1000 - state.filter.days * 86400);

	// ───────────── 登录 ─────────────
	function showLogin() {
		if (document.querySelector('.login')) return;
		const err = h('div', { class: 'login-err', role: 'alert' });
		const input = h('input', { type: 'password', placeholder: '访问密码', autocomplete: 'current-password', required: true, 'aria-label': '访问密码' });
		const form = h(
			'form',
			{ class: 'login' },
			logo(44),
			h('h1', {}, '对话归档'),
			h('p', {}, '请输入访问密码'),
			input,
			h('button', { type: 'submit', class: 'btn primary' }, '进入'),
			err
		);
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			err.textContent = '';
			try {
				await api('/api/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ password: input.value })
				});
				boot();
			} catch (e2) {
				err.textContent = e2.message;
				input.select();
			}
		});
		closeLightbox();
		closePop();
		hideToast();
		state.current = null;
		$find = null;
		document.body.classList.remove('nav-open', 'home', 'scrolled', 'can-top', 'can-bottom', 'reading');
		$app.replaceChildren(h('div', { class: 'login-wrap' }, form));
		input.focus();
	}

	// ───────────── 布局 ─────────────
	let $list, $main, $status, $search, $tabs, $filterBtn, $filters;

	function renderShell() {
		$search = h('input', { type: 'search', placeholder: '搜索标题和内容…', 'aria-label': '搜索', value: state.query });
		let timer;
		$search.addEventListener('input', () => {
			clearTimeout(timer);
			timer = setTimeout(() => doSearch($search.value), 250);
		});
		$filterBtn = h('button', { class: 'icon-btn filter-btn', title: '筛选', 'aria-label': '筛选', 'aria-expanded': 'false', html: I.filter });
		$filterBtn.addEventListener('click', () => {
			state.filterOpen = !state.filterOpen;
			renderSidebar();
		});
		$filters = h('div', { class: 'filters', hidden: true });
		$tabs = h('div', { class: 'tabs', role: 'tablist' });
		$list = h('nav', { class: 'chat-list', 'aria-label': '对话列表' });
		$status = h('div', { class: 'sync' });
		$main = h('main', { class: 'main' });
		const sidebar = h(
			'aside',
			{ class: 'sidebar' },
			h(
				'div',
				{ class: 'side-head' },
				h('a', { class: 'brand', href: '#/' }, logo(26), '对话归档'),
				h(
					'button',
					{ class: 'icon-btn', title: '切换深浅色', 'aria-label': '切换深浅色', onclick: toggleTheme },
					h('span', { class: 'when-light', html: I.theme }),
					h('span', { class: 'when-dark', html: I.sun })
				),
				h('button', {
					class: 'icon-btn',
					title: '退出登录',
					'aria-label': '退出登录',
					html: I.logout,
					onclick: async () => {
						await fetch('/api/logout', { method: 'POST' });
						showLogin();
					}
				}),
				h('button', { class: 'icon-btn side-hide', title: '收起侧栏', 'aria-label': '收起侧栏', html: I.panel, onclick: () => setSide(false) }),
				h('button', { class: 'icon-btn side-close', title: '关闭对话列表', 'aria-label': '关闭对话列表', html: I.close, onclick: closeNav })
			),
			h('div', { class: 'search-row' }, h('label', { class: 'search' }, h('span', { html: I.search }), $search, h('kbd', { class: 'kbd', title: '按 / 聚焦搜索', 'aria-hidden': 'true' }, '/')), $filterBtn),
			$filters,
			$tabs,
			$list,
			$status
		);
		// 手机端：在抽屉上向左滑动即可收起
		let swipe = null;
		sidebar.addEventListener(
			'touchstart',
			(e) => {
				const t = e.touches[0];
				swipe = e.touches.length === 1 && !e.target.closest('input') ? { x: t.clientX, y: t.clientY } : null;
			},
			{ passive: true }
		);
		sidebar.addEventListener(
			'touchend',
			(e) => {
				if (!swipe) return;
				const dx = e.changedTouches[0].clientX - swipe.x;
				const dy = e.changedTouches[0].clientY - swipe.y;
				swipe = null;
				if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) closeNav();
			},
			{ passive: true }
		);
		const scrim = h('div', { class: 'scrim', onclick: closeNav });
		$app.replaceChildren(sidebar, scrim, $main);
		setHome(!/^#\/c\/.+/.test(location.hash));
	}

	// 窄屏下没有打开对话时，对话列表直接铺满屏幕（见 style.css 的 .home）；切换是瞬时的，不走抽屉的滑动动画
	const setHome = (on) => {
		const cl = document.body.classList;
		if (cl.contains('home') === on) return;
		cl.add('no-anim');
		cl.toggle('home', on);
		void document.body.offsetWidth;
		cl.remove('no-anim');
	};

	const isDesktop = () => matchMedia('(min-width: 861px)').matches;
	// 桌面端阅读时可以把侧栏收起来，专心看正文
	const setSide = (show) => {
		if (!prefs.hideSide === show) return;
		prefs.hideSide = !show;
		keepPos(applyPrefs);
		if (!show) document.querySelector('.menu-btn')?.focus({ preventScroll: true });
	};
	const openNav = () => {
		closePop();
		if (isDesktop()) setSide(true);
		refreshRecents();
		document.body.classList.add('nav-open');
	};
	// 侧栏顶部的「继续阅读」：最近读到一半的对话
	const recentChats = () =>
		state.results || state.view !== 'active' || state.tag || filterOn()
			? []
			: state.chats
					.filter((c) => !c.archived && unfinished(c.id))
					.sort((a, b) => reading[b.id].t - reading[a.id].t)
					.slice(0, 3);
	const sigOf = (list) => list.map((c) => `${c.id}:${reading[c.id].p}`).join('|');
	let recentSig = '';
	const refreshRecents = () => {
		if (!$list || sigOf(recentChats()) === recentSig) return;
		// 列表已经往下滚过时，重排后让眼前的条目留在原地，变化发生在上方
		const rows = () => [...$list.querySelectorAll('.chat-item:not(.recent)')];
		const edge = $list.getBoundingClientRect().top;
		const anchor = $list.scrollTop > 0 ? rows().find((el) => el.getBoundingClientRect().bottom > edge) : null;
		const before = anchor?.getBoundingClientRect().top;
		renderSidebar();
		const after = anchor && rows().find((el) => el.dataset.id === anchor.dataset.id);
		if (after) $list.scrollTop += after.getBoundingClientRect().top - before;
	};
	const closeNav = () => document.body.classList.remove('nav-open');
	// 桌面端侧栏常驻，nav-open 只在窄屏下才表示「抽屉盖在正文上」
	const navShowing = () => document.body.classList.contains('nav-open') && matchMedia('(max-width: 860px)').matches;

	// ───────────── 侧栏 ─────────────
	const timeGroup = (sec) => {
		const now = new Date();
		const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
		if (sec >= startToday) return '今天';
		if (sec >= startToday - 86400) return '昨天';
		if (sec >= startToday - 7 * 86400) return '过去 7 天';
		if (sec >= startToday - 30 * 86400) return '过去 30 天';
		const d = new Date(sec * 1000);
		return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1} 月` : `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
	};

	const snippetNode = (snip) => {
		const el = h('div', { class: 'snippet' });
		for (const part of String(snip).replace(/\s+/g, ' ').split(/(\u0001[^\u0002]*\u0002)/)) {
			if (part.startsWith('\u0001')) el.append(h('mark', {}, part.slice(1, -1)));
			else if (part) el.append(part);
		}
		return el;
	};

	const chatItem = (c, hit, pct) => {
		const a = h(
			'a',
			{
				class: 'chat-item' + (c.id === state.currentId ? ' active' : '') + (pct != null ? ' recent' : ''),
				href: `#/c/${c.id}`,
				dataset: { id: c.id },
				onclick: (e) => {
					state.focusMessage = hit?.message_id || null;
					closeNav();
					if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // 在新标签页 / 新窗口打开
					state.findQuery = hit?.message_id ? state.query.split(/\s+/)[0] : null;
					state.resume = pct != null;
					if (c.id !== state.currentId || state.current?.id !== c.id) return;
					// 已经打开着的对话：地址不变，不会触发路由
					if (hit?.message_id) jumpToHit();
					else if (pct != null && unfinished(c.id)) resumeTo({ ...reading[c.id] });
					state.resume = false;
				}
			},
			h('div', { class: 'chat-title' }, h('span', { class: 'chat-title-text' }, c.title), c.missing_upstream ? h('span', { class: 'dot', title: '源站已删除，仅存于归档' }) : null, pct != null ? h('span', { class: 'read-pct', title: '上次读到这里' }, `${pct}%`) : null),
			hit?.snippet ? snippetNode(hit.snippet) : null,
			hit ? h('div', { class: 'chat-meta' }, fmtDate(c.updated_at, false), hit.count > 1 ? ` · ${hit.count} 处匹配` : '') : null
		);
		return a;
	};

	// 搜索结果里某一处命中：点击直接跳到那条消息
	const hitRow = (c, x) =>
		h(
			'a',
			{
				class: 'hit-row',
				href: `#/c/${encodeURIComponent(c.id)}/m/${encodeURIComponent(x.message_id)}`,
				onclick: (e) => {
					closeNav();
					if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
					e.preventDefault();
					state.focusMessage = x.message_id;
					state.findQuery = state.query.split(/\s+/)[0];
					if (c.id === state.currentId && state.current?.id === c.id) jumpToHit();
					else location.hash = `#/c/${encodeURIComponent(c.id)}`;
				}
			},
			snippetNode(x.snippet)
		);

	function renderFilters() {
		$filterBtn.setAttribute('aria-expanded', String(state.filterOpen));
		$filterBtn.classList.toggle('on', filterOn());
		$filters.hidden = !state.filterOpen;
		if (!state.filterOpen) return;
		// 模型按出现的对话数排序；当前选中的模型即使已经不在归档里也保留在列表中
		const freq = new Map();
		for (const c of state.chats) for (const m of c.models) freq.set(m, (freq.get(m) || 0) + 1);
		if (state.filter.model && !freq.has(state.filter.model)) freq.set(state.filter.model, 0);
		const select = (label, value, options, onchange) => {
			const el = h('select', { 'aria-label': label }, options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
			el.addEventListener('change', () => {
				onchange(el.value);
				renderSidebar();
			});
			return el;
		};
		$filters.replaceChildren(
			select('按模型筛选', state.filter.model, [['', '全部模型'], ...[...freq].sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, `${m}（${n}）`])], (v) => (state.filter.model = v)),
			select('按时间筛选', state.filter.days, [[0, '全部时间'], [7, '近 7 天'], [30, '近 30 天'], [90, '近 3 个月'], [365, '近一年']], (v) => (state.filter.days = Number(v))),
			filterOn()
				? h(
						'button',
						{
							class: 'icon-btn',
							title: '清除筛选',
							'aria-label': '清除筛选',
							html: I.x,
							onclick: () => {
								state.filter = { model: '', days: 0 };
								renderSidebar();
							}
						}
					)
				: null
		);
	}

	function renderSidebar() {
		const recent = recentChats();
		recentSig = sigOf(recent);
		const archivedCount = state.chats.filter((c) => c.archived).length;
		const missingCount = state.chats.filter((c) => c.missing_upstream).length;
		if (state.view === 'missing' && !missingCount) state.view = 'active';
		const starList = [...stars.values()].filter((x) => state.byId.has(x.chat_id)).sort((a, b) => b.t - a.t);
		if (state.view === 'starred' && !starList.length) state.view = 'active';
		const tab = (key, label, count) =>
			h(
				'button',
				{
					class: 'tab' + (state.view === key ? ' on' : ''),
					role: 'tab',
					'aria-selected': String(state.view === key),
					onclick: () => {
						state.view = key;
						renderSidebar();
					}
				},
				label,
				' ',
				h('span', { class: 'tab-count' }, count)
			);
		$tabs.replaceChildren(
			...[
			tab('active', '对话', state.chats.length - archivedCount),
			tab('archived', '已归档', archivedCount),
			starList.length ? tab('starred', '收藏', starList.length) : null,
			// 只存在于归档里的对话：源站已经删掉了
			missingCount ? tab('missing', '源站已删除', missingCount) : null,
			state.tag
				? h(
						'button',
						{
							class: 'tab tag-filter on',
							title: '清除标签筛选',
							onclick: () => {
								state.tag = null;
								renderSidebar();
							}
						},
						h('span', { class: 'tab-label' }, `#${state.tag}`),
						h('span', { html: I.x })
					)
				: null
			].filter(Boolean)
		);
		$tabs.hidden = !!state.results;
		renderFilters();

		const frag = document.createDocumentFragment();
		if (state.results) {
			const all = state.chats.filter((c) => state.results.has(c.id));
			const hits = all.filter(passFilter);
			frag.append(h('div', { class: 'group-title' }, `找到 ${hits.length} 个对话` + (hits.length < all.length ? `（另有 ${all.length - hits.length} 个被筛选条件排除）` : '')));
			for (const c of hits) {
				const hit = state.results.get(c.id);
				frag.append(chatItem(c, hit));
				// 同一个对话里的其余命中
				const more = (hit.hits || []).slice(1);
				if (more.length) frag.append(h('div', { class: 'hit-list' }, more.map((x) => hitRow(c, x))));
			}
			if (!hits.length) frag.append(h('div', { class: 'empty' }, all.length ? '没有符合筛选条件的结果' : '没有匹配的内容'));
			$list.replaceChildren(frag);
			return;
		}

		if (state.view === 'starred') {
			for (const x of starList) {
				const c = state.byId.get(x.chat_id);
				frag.append(
					h(
						'a',
						{
							class: 'chat-item star-item' + (x.chat_id === state.currentId ? ' active' : ''),
							href: `#/c/${encodeURIComponent(x.chat_id)}/m/${encodeURIComponent(x.message_id)}`,
							dataset: { id: x.chat_id },
							onclick: (e) => {
								closeNav();
								if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
								if (state.current?.id !== x.chat_id || state.currentId !== x.chat_id) return;
								// 已经打开着这个对话：地址可能没变，直接跳过去
								e.preventDefault();
								state.focusMessage = x.message_id;
								jumpToHit();
							}
						},
						h('div', { class: 'snippet' }, x.excerpt || '（图片 / 附件）'),
						h('div', { class: 'chat-meta' }, `${x.role === 'user' ? '你' : x.role === 'assistant' ? '回答' : '系统'} · ${c.title}`)
					)
				);
			}
			$list.replaceChildren(frag);
			return;
		}

		let chats = state.chats.filter((c) => (state.view === 'missing' ? c.missing_upstream : state.view === 'archived' ? c.archived : !c.archived));
		if (state.tag) chats = chats.filter((c) => c.tags.includes(state.tag));
		if (filterOn()) chats = chats.filter(passFilter);
		if (!chats.length) {
			$list.replaceChildren(
				h('div', { class: 'empty' }, filterOn() ? '没有符合筛选条件的对话' : state.chats.length ? '这里没有对话' : state.status?.configured ? '尚未同步到任何对话' : '尚未配置同步源')
			);
			return;
		}

		const flat = state.view !== 'active' || state.tag || filterOn();
		if (recent.length) {
			frag.append(h('div', { class: 'group-title' }, '继续阅读'));
			for (const c of recent) frag.append(chatItem(c, null, reading[c.id].p));
		}
		const pinned = flat ? [] : chats.filter((c) => c.pinned);
		if (pinned.length) {
			frag.append(h('div', { class: 'group-title' }, '置顶'));
			for (const c of pinned) frag.append(chatItem(c));
		}

		const folderIds = new Set(state.folders.map((f) => f.id));
		const inFolder = new Map();
		if (!flat) {
			for (const c of chats) {
				if (c.folder_id && folderIds.has(c.folder_id) && !c.pinned) (inFolder.get(c.folder_id) || inFolder.set(c.folder_id, []).get(c.folder_id)).push(c);
			}
			const kids = new Map();
			for (const f of state.folders) {
				const p = f.parent_id && folderIds.has(f.parent_id) ? f.parent_id : null;
				(kids.get(p) || kids.set(p, []).get(p)).push(f);
			}
			const countDeep = (f) => (inFolder.get(f.id)?.length || 0) + (kids.get(f.id) || []).reduce((n, k) => n + countDeep(k), 0);
			const renderFolder = (f) => {
				const total = countDeep(f);
				if (!total) return null; // 空文件夹对归档阅读没有意义
				const open = state.openFolders.has(f.id);
				const head = h(
					'button',
					{
						class: 'folder' + (open ? ' open' : ''),
						'aria-expanded': String(open),
						onclick: () => {
							open ? state.openFolders.delete(f.id) : state.openFolders.add(f.id);
							localStorage.setItem('openFolders', JSON.stringify([...state.openFolders]));
							renderSidebar();
						}
					},
					h('span', { class: 'fold-caret', html: I.chevron }),
					h('span', { html: I.folder }),
					h('span', { class: 'folder-name' }, f.name),
					h('span', { class: 'count' }, total)
				);
				const box = h('div', { class: 'folder-box' }, head);
				if (open) {
					const inner = h('div', { class: 'folder-items' });
					for (const k of kids.get(f.id) || []) {
						const n = renderFolder(k);
						if (n) inner.append(n);
					}
					for (const c of inFolder.get(f.id) || []) inner.append(chatItem(c));
					box.append(inner);
				}
				return box;
			};
			const roots = (kids.get(null) || []).map((f) => renderFolder(f)).filter(Boolean);
			if (roots.length) {
				frag.append(h('div', { class: 'group-title' }, '文件夹'));
				frag.append(...roots);
			}
		}

		let lastGroup = null;
		for (const c of chats) {
			if (!flat && (c.pinned || (c.folder_id && folderIds.has(c.folder_id)))) continue;
			const g = timeGroup(c.updated_at);
			if (g !== lastGroup) {
				frag.append(h('div', { class: 'group-title' }, g));
				lastGroup = g;
			}
			frag.append(chatItem(c));
		}
		$list.replaceChildren(frag);
	}

	async function doSearch(value) {
		const qv = value.trim();
		state.query = qv;
		if (!qv) {
			state.results = null;
			renderSidebar();
			return;
		}
		try {
			const { results } = await api(`/api/search?q=${encodeURIComponent(qv)}`);
			if (state.query !== qv) return;
			state.results = new Map(results.map((r) => [r.id, r]));
			renderSidebar();
		} catch {}
	}

	// ───────────── 同步状态 ─────────────
	let statusTimer;
	function renderStatus() {
		const s = state.status;
		if (!s) return;
		const btn = h('button', { class: 'icon-btn' + (s.running ? ' spin' : ''), title: '立即同步', 'aria-label': '立即同步', html: I.sync, disabled: s.running || !s.configured });
		btn.addEventListener('click', async () => {
			try {
				state.status = await api('/api/sync', { method: 'POST' });
				renderStatus();
				pollStatus(1500);
			} catch {}
		});
		let line;
		if (!s.configured) line = '未配置同步源';
		else if (s.running) line = `正在同步${s.phase ? ' · ' + s.phase : ''}`;
		else line = `${ago(s.last_ok)}同步 · 每 ${s.interval_minutes} 分钟`;
		const tone = !s.configured ? 'off' : s.running ? 'run' : s.last_error ? 'err' : 'ok';
		$status.replaceChildren(
			h('span', { class: `sync-dot ${tone}`, 'aria-hidden': 'true' }),
			h(
				'div',
				{ class: 'sync-text' },
				h('div', {}, line),
				h('div', { class: 'sync-sub' + (s.last_error && !s.running ? ' err' : '') , title: s.last_error || '' },
					s.last_error && !s.running ? `同步出错：${s.last_error}` : `${s.chats} 个对话 · ${s.messages} 条消息`)
			),
			s.chats ? h('a', { class: 'icon-btn export-all', href: '/api/export', download: '', title: '导出全部对话（JSON，可重新导入 Open WebUI）', 'aria-label': '导出全部对话', html: I.download }) : null,
			btn
		);
	}
	function pollStatus(delay = 30000) {
		clearTimeout(statusTimer);
		statusTimer = setTimeout(async () => {
			if (document.hidden) return pollStatus();
			try {
				const prev = state.status;
				const s = await api('/api/status');
				state.status = s;
				renderStatus();
				if (prev && (prev.running !== s.running || prev.last_run !== s.last_run) && !s.running) await loadIndex();
				pollStatus(s.running ? 1500 : 30000);
			} catch {
				pollStatus();
			}
		}, delay);
	}

	// ───────────── 阅读区 ─────────────
	const fileChip = (f) => {
		const name = f?.name || f?.file?.filename || f?.file?.meta?.name || f?.type || '附件';
		const id = [f?.id, f?.file?.id].find((x) => typeof x === 'string' && UUID.test(x));
		const url = id ? `/files/${id}` : /^https?:\/\//.test(f?.url || '') ? f.url : null;
		return h(url ? 'a' : 'span', { class: 'chip', href: url, target: url ? '_blank' : null, rel: 'noopener noreferrer' }, h('span', { html: I.file }), name);
	};
	const isImageFile = (f) => f?.type === 'image' || /^image\/(?!svg)/.test(f?.content_type || f?.file?.meta?.content_type || '');
	const filesNode = (files) => {
		if (!Array.isArray(files) || !files.length) return null;
		const box = h('div', { class: 'attachments' });
		for (const f of files) {
			if (isImageFile(f)) {
				const u = fileUrl(f.url) || fileUrl(f.id) || fileUrl(f.file?.id);
				if (u) {
					box.append(imageNode(u));
					continue;
				}
			}
			box.append(fileChip(f));
		}
		return box;
	};

	const sourcesNode = (sources) => {
		if (!Array.isArray(sources) || !sources.length) return null;
		const seen = new Set();
		const chips = [];
		for (const s of sources) {
			const metas = Array.isArray(s?.metadata) && s.metadata.length ? s.metadata : [{}];
			for (const meta of metas) {
				const src = meta?.source || s?.source?.url || s?.source?.name || meta?.name || s?.source?.id;
				const name = meta?.title || meta?.name || s?.source?.name || src;
				if (!name || seen.has(String(src || name))) continue;
				seen.add(String(src || name));
				const url = /^https?:\/\//.test(String(src)) ? String(src) : null;
				chips.push(h(url ? 'a' : 'span', { class: 'chip', href: url, target: url ? '_blank' : null, rel: 'noopener noreferrer', title: url || '' }, String(name).slice(0, 80)));
			}
		}
		if (!chips.length) return null;
		return h('div', { class: 'sources' }, h('span', { class: 'sources-label' }, `引用来源 ${chips.length}`), chips);
	};

	const branchNav = (entry) => {
		if (entry.siblings.length < 2) return null;
		const go = (delta) => {
			const tree = state.current.tree;
			const next = entry.siblings[entry.index + delta];
			if (next == null) return;
			tree.choice.set(entry.parent, next);
			const y = window.scrollY;
			renderMessages();
			window.scrollTo(0, y);
		};
		return h(
			'span',
			{ class: 'branch' },
			h('button', { class: 'icon-btn', 'aria-label': '上一个版本', html: I.left, disabled: entry.index === 0, onclick: () => go(-1) }),
			h('span', {}, `${entry.index + 1} / ${entry.siblings.length}`),
			h('button', { class: 'icon-btn', 'aria-label': '下一个版本', html: I.chevron, disabled: entry.index === entry.siblings.length - 1, onclick: () => go(1) })
		);
	};

	const renderMessage = (entry) => {
		const m = entry.msg;
		const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system';
		const body = h('div', { class: 'msg-body' });
		if (role === 'assistant') {
			const hasOutput = Array.isArray(m.output) && m.output.length;
			let nodes = hasOutput ? renderOutput(m.output) : [];
			if (!nodes.length) nodes = renderContentString(partsText(m.content));
			const files = filesNode((m.files || []).filter((f) => ['image', 'file'].includes(f?.type) || f?.url));
			if (files) body.append(files);
			body.append(...nodes);
			const err = m.error && (typeof m.error === 'object' ? m.error.content || m.error.message || m.error.detail : m.error === true ? null : m.error);
			if (err) body.append(h('div', { class: 'error-box' }, String(err)));
			else if (!nodes.length && !files) body.append(h('div', { class: 'dim' }, '（空回复）'));
			const src = sourcesNode(m.sources || m.citations);
			if (src) body.append(src);
		} else {
			const files = filesNode(m.files);
			if (files) body.append(files);
			// 多模态 content 里的图片
			if (Array.isArray(m.content)) {
				for (const p of m.content) {
					const u = fileUrl(p?.image_url?.url);
					if (u) body.append(imageNode(u));
				}
			}
			const text = partsText(m.content);
			if (text.trim()) body.append(role === 'user' ? h('div', { class: 'bubble' }, mdNode(text)) : mdNode(text));
		}
		const who = role === 'user' ? '你' : role === 'assistant' ? m.modelName || m.model || '助手' : '系统';
		const ts = normTs(m.timestamp);
		const chatId = state.current.id;
		const starred = stars.has(starKey(chatId, m.id));
		const starBtn = h('button', {
			class: 'icon-btn star-btn',
			title: starred ? '取消收藏' : '收藏这条消息',
			'aria-label': starred ? '取消收藏' : '收藏这条消息',
			'aria-pressed': String(starred),
			html: I.star,
			onclick: () => toggleStar(chatId, m)
		});
		return h(
			'article',
			{ class: `msg ${role}` + (starred ? ' starred' : ''), id: `m-${m.id}`, dataset: { id: m.id } },
			h(
				'header',
				{ class: 'msg-head' },
				role === 'assistant' ? h('span', { class: 'avatar', 'aria-hidden': 'true', html: I.spark }) : null,
				h('span', { class: 'who' }, who),
				ts ? h('time', { title: fmtDate(ts) }, fmtDate(ts)) : null
			),
			body,
			h('footer', { class: 'msg-foot' }, branchNav(entry), copyBtn(() => messageText(m), '复制消息'), copyBtn(() => msgLink(m.id), '复制这条消息的链接', I.link), starBtn)
		);
	};

	let $messages;
	function renderMessages() {
		const path = state.current.tree.path();
		const nodes = [];
		let lastDay = null;
		for (const entry of path) {
			const ts = normTs(entry.msg.timestamp);
			const day = ts ? fmtDate(ts, false) : null;
			if (day && lastDay && day !== lastDay) nodes.push(h('div', { class: 'day-sep' }, h('span', {}, `${day} 周${'日一二三四五六'[new Date(ts * 1000).getDay()]}`)));
			if (day) lastDay = day;
			nodes.push(renderMessage(entry));
		}
		$messages.replaceChildren(...nodes);
		if (!path.length) $messages.append(h('div', { class: 'empty' }, '这个对话没有消息'));
		// 切换分支后重新标出查找结果
		if ($find && !$find.bar.hidden && find.q) {
			runFind();
			gotoHit(0, false);
		}
	}

	const download = (name, text, type) => {
		const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
		document.body.append(a);
		a.click();
		setTimeout(() => {
			URL.revokeObjectURL(a.href);
			a.remove();
		}, 1000);
	};
	// 首页概览：近 12 个月新建的对话数、各模型参与的对话数。两张图都只有一个系列，用同一种颜色表示数量
	const overview = () => {
		if (state.chats.length < 2) return null;
		const now = new Date();
		const months = Array.from({ length: 12 }, (_, i) => {
			const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
			return { y: d.getFullYear(), m: d.getMonth() + 1, n: 0 };
		});
		const slot = new Map(months.map((x) => [`${x.y}-${x.m}`, x]));
		const freq = new Map();
		for (const c of state.chats) {
			const d = new Date(c.created_at * 1000);
			const x = slot.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
			if (x) x.n++;
			for (const m of c.models) freq.set(m, (freq.get(m) || 0) + 1);
		}
		const peak = Math.max(1, ...months.map((x) => x.n));
		const peakAt = months.findIndex((x) => x.n === peak);
		const monthly = h(
			'section',
			{ class: 'viz' },
			h('h2', {}, '近 12 个月新建的对话'),
			h(
				'div',
				{ class: 'bars', role: 'img', 'aria-label': months.map((x) => `${x.y} 年 ${x.m} 月 ${x.n} 个`).join('，') },
				months.map((x, i) =>
					h(
						'div',
						{ class: 'bar-col', title: `${x.y} 年 ${x.m} 月：${x.n} 个对话` },
						// 只给最高的一根标数值，其余悬停查看
						// 柱子单独占一个绘图区，高度才是相对同一个基准的百分比
						h('span', { class: 'bar-plot' }, i === peakAt && x.n ? h('span', { class: 'bar-val' }, x.n) : null, h('i', { class: x.n ? '' : 'zero', style: `height:${x.n ? Math.max(2, (x.n / peak) * 100) : 0}%` })),
						h('span', { class: 'bar-x' }, i === 0 || x.m === 1 ? `${String(x.y).slice(2)}/${x.m}` : x.m)
					)
				)
			)
		);
		const ranked = [...freq].sort((a, b) => b[1] - a[1]);
		const top = ranked.slice(0, 6);
		const rest = ranked.slice(6);
		const max = top[0]?.[1] || 1;
		const models = top.length
			? h(
					'section',
					{ class: 'viz' },
					h('h2', {}, '各模型参与的对话'),
					h(
						'div',
						{ class: 'hbars' },
						top.map(([name, n]) =>
							h(
								'button',
								{
									class: 'hbar',
									title: `只看 ${name} 的对话`,
									onclick: () => {
										state.filter.model = name;
										state.filterOpen = true;
										state.view = 'active';
										renderSidebar();
										openNav();
									}
								},
								h('span', { class: 'hbar-name' }, name),
								h('span', { class: 'hbar-track' }, h('i', { style: `width:${Math.max(1, (n / max) * 100)}%` })),
								h('span', { class: 'hbar-val' }, n)
							)
						)
					),
					rest.length ? h('p', { class: 'viz-note' }, `另有 ${rest.length} 个模型，共参与 ${rest.reduce((a, x) => a + x[1], 0)} 个对话`) : null
				)
			: null;
		return h('div', { class: 'overview' }, monthly, models, statsSection());
	};
	const sizeText = (n) => (n < 500 ? null : n < 10000 ? `约 ${Math.round(n / 100) * 100} 字` : `约 ${(n / 10000).toFixed(1)} 万字`);
	// 字数按中文习惯：每个汉字算 1 个字，一串连续的字母 / 数字算 1 个词，标点和空白不计（与服务端 measure 一致）
	const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu;
	const countChars = (text) => {
		const cjk = (text.match(CJK_RE) || []).length;
		return cjk + (text.replace(CJK_RE, ' ').match(/[\p{L}\p{N}]+(?:['’._-][\p{L}\p{N}]+)*/gu) || []).length;
	};
	const big = (n) => (n < 10000 ? String(Math.round(n)) : n < 1e8 ? `${(n / 1e4).toFixed(n < 1e5 ? 2 : 1)} 万` : `${(n / 1e8).toFixed(2)} 亿`);
	// 字数与 token 统计：服务端算，首页异步填进来
	const statsSection = () => {
		const box = h('section', { class: 'viz usage', hidden: true });
		api('/api/stats')
			.then((st) => {
				if (!st.models.length) return;
				const chars = st.user.chars + st.models.reduce((n, m) => n + m.chars, 0);
				const tile = document.querySelector('.stat-chars .stat-num');
				if (tile) tile.textContent = big(chars);
				const anyEst = st.models.some((m) => m.reported < m.messages);
				const tok = (m, k) => h('td', { title: m.reported < m.messages ? `${m.messages} 条回答里有 ${m.messages - m.reported} 条上游没有返回用量，按模型估算` : '上游返回的用量' }, (m.reported < m.messages ? '≈ ' : '') + big(m[k]));
				const sum = (k) => st.models.reduce((n, m) => n + m[k], 0);
				box.replaceChildren(
					h('h2', {}, '字数与 token 用量'),
					h(
						'div',
						{ class: 'table-wrap usage-wrap' },
						h(
							'table',
							{},
							h('thead', {}, h('tr', {}, ['模型', '回答', '字数', '输入 token', '输出 token'].map((t) => h('th', {}, t)))),
							h(
								'tbody',
								{},
								st.models.map((m) => h('tr', {}, h('th', { title: m.name }, m.name), h('td', {}, m.messages), h('td', {}, big(m.chars)), tok(m, 'input'), tok(m, 'output')))
							),
							h(
								'tfoot',
								{},
								h('tr', {}, h('th', {}, '你的提问'), h('td', {}, st.user.messages), h('td', {}, big(st.user.chars)), h('td', {}, '—'), h('td', {}, '—')),
								h('tr', {}, h('th', {}, '合计'), h('td', {}, sum('messages') + st.user.messages), h('td', {}, big(chars)), h('td', {}, (anyEst ? '≈ ' : '') + big(sum('input'))), h('td', {}, (anyEst ? '≈ ' : '') + big(sum('output'))))
							)
						)
					),
					h('p', { class: 'viz-note' }, '字数：每个汉字算 1 字，连续的字母或数字算 1 词，不计标点；所有分支都算在内。' + (anyEst ? '带 ≈ 的 token 数含估算：上游没有返回用量的回答，按模型所属的分词器家族由文本折算，输入按当时的全部上文计。' : 'token 数均为上游返回的用量。'))
				);
				box.hidden = false;
			})
			.catch(() => {});
		return box;
	};
	const safeName = (s) => String(s).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'chat';
	const toMarkdown = () => {
		const { record, tree } = state.current;
		const lines = [`# ${record.title}`, '', `> 创建于 ${fmtDate(record.created_at)}，更新于 ${fmtDate(record.updated_at)}`, ''];
		for (const { msg } of tree.path()) {
			const who = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? msg.modelName || msg.model || '助手' : '系统';
			lines.push(`## ${who}`, '', messageText(msg), '');
		}
		return lines.join('\n');
	};

	// ───────────── 阅读工具：定位 / 查找 / 目录 / 设置 / 进度 ─────────────
	const topOffset = () => {
		const tb = document.querySelector('.topbar');
		return (tb ? tb.getBoundingClientRect().height : 0) + 12;
	};
	const scrollToEl = (el) => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - topOffset()));
	const msgEls = () => [...($messages?.children || [])].filter((el) => el.classList.contains('msg'));
	// 当前正在读的消息：第一条还没完全滚出顶栏的
	const currentMsg = () => {
		const off = topOffset();
		const els = msgEls();
		return els.find((el) => el.getBoundingClientRect().bottom > off + 1) || els[els.length - 1] || null;
	};
	const readPos = () => {
		const el = currentMsg();
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { m: el.dataset.id, r: Math.round(Math.min(1, Math.max(0, (topOffset() - r.top) / Math.max(1, r.height))) * 1000) / 1000 };
	};
	const restorePos = (pos) => {
		if (!pos?.m || !state.current) return false;
		const { tree } = state.current;
		if (!document.getElementById(`m-${pos.m}`) && tree.map[pos.m]) {
			tree.selectPathTo(pos.m);
			renderMessages();
		}
		const el = document.getElementById(`m-${pos.m}`);
		if (!el) return false;
		const r = el.getBoundingClientRect();
		window.scrollTo(0, Math.max(0, r.top + window.scrollY + (pos.r || 0) * r.height - topOffset()));
		return true;
	};
	// 版式变化（字号、宽度、展开折叠）前后，保持正在读的那一段不动
	const keepPos = (fn) => {
		const pos = window.scrollY > 4 ? readPos() : null;
		fn();
		if (pos) restorePos(pos);
	};
	const flashMsg = (mid) => {
		const el = document.getElementById(`m-${mid}`);
		if (!el) return null;
		scrollToEl(el);
		el.classList.remove('flash');
		void el.offsetWidth;
		el.classList.add('flash');
		return el;
	};
	const stepMsg = (dir) => {
		const els = msgEls();
		const cur = currentMsg();
		if (!cur) return;
		const i = els.indexOf(cur);
		const into = topOffset() - cur.getBoundingClientRect().top;
		const target = dir > 0 ? (into < -8 ? cur : els[i + 1]) : into > 8 ? cur : els[i - 1];
		if (target) scrollToEl(target);
		else window.scrollTo(0, dir > 0 ? document.documentElement.scrollHeight : 0);
	};
	const setFolds = (open) =>
		keepPos(() => {
			// 展开时内层的折叠块才会生成，多走几遍
			for (let pass = 0; pass < 3; pass++) {
				for (const d of $messages.querySelectorAll('details')) {
					if (open) d._fill?.();
					d.open = open;
				}
			}
			for (const c of $messages.querySelectorAll('.code-block.long')) c._setOpen(open);
		});
	const toggleFolds = () => setFolds(!!$messages.querySelector('details:not([open]), .code-block.long:not(.open)'));

	// ── 图片查看 ──
	let $lightbox = null;
	let lbReturn = null;
	let lbStep = null;
	const closeLightbox = () => {
		if (!$lightbox) return false;
		$lightbox.remove();
		$lightbox = null;
		lbStep = null;
		document.body.classList.remove('lb-open');
		if (lbReturn?.isConnected) lbReturn.focus({ preventScroll: true });
		lbReturn = null;
		return true;
	};
	// 当前对话里所有能看的图片（附件、正文、工具返回），按出现顺序
	const galleryOf = (el) => {
		const all = [...($messages?.querySelectorAll('.attach-img, .md img') || [])].filter((im) => !(im.matches('.md img') && im.closest('a')) && !(im.complete && !im.naturalWidth));
		return all.includes(el) ? all : null;
	};
	const openLightbox = (src, el) => {
		closeLightbox();
		lbReturn = document.activeElement;
		const list = (el && galleryOf(el)) || null;
		const n = list ? list.length : 1;
		let i = list ? list.indexOf(el) : 0;
		const img = h('img', { alt: '图片', referrerpolicy: 'no-referrer' });
		img.addEventListener('click', (e) => {
			e.stopPropagation();
			$lightbox.classList.toggle('zoomed');
		});
		const count = h('span', { class: 'lightbox-count', role: 'status' });
		const link = h('a', { class: 'icon-btn', target: '_blank', rel: 'noopener noreferrer', title: '在新标签页打开', 'aria-label': '在新标签页打开', html: I.external });
		const show = (k) => {
			i = ((k % n) + n) % n;
			const cur = list ? list[i].getAttribute('src') : src;
			img.setAttribute('src', cur);
			$lightbox.classList.remove('zoomed');
			count.textContent = n > 1 ? `${i + 1} / ${n}` : '';
			// 浏览器不允许在新标签页直接打开 data: 地址
			link.hidden = cur.startsWith('data:');
			link.setAttribute('href', cur);
		};
		const close = h('button', { class: 'icon-btn', title: '关闭', 'aria-label': '关闭', html: I.close, onclick: closeLightbox });
		const stage = h('div', { class: 'lightbox-stage' }, img);
		$lightbox = h(
			'div',
			{ class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '查看图片', onclick: closeLightbox },
			h(
				'div',
				{ class: 'lightbox-bar', onclick: (e) => e.stopPropagation() },
				count,
				n > 1 ? h('button', { class: 'icon-btn', title: '上一张 (←)', 'aria-label': '上一张', html: I.prev, onclick: () => show(i - 1) }) : null,
				n > 1 ? h('button', { class: 'icon-btn', title: '下一张 (→)', 'aria-label': '下一张', html: I.next, onclick: () => show(i + 1) }) : null,
				link,
				close
			),
			stage
		);
		if (n > 1) {
			lbStep = (d) => show(i + d);
			// 手机上左右滑动翻页（放大查看原图时滑动用来拖动图片）
			let from = null;
			stage.addEventListener('touchstart', (e) => (from = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null), { passive: true });
			stage.addEventListener(
				'touchend',
				(e) => {
					if (!from || $lightbox.classList.contains('zoomed')) return;
					const dx = e.changedTouches[0].clientX - from.x;
					const dy = e.changedTouches[0].clientY - from.y;
					from = null;
					if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(i + (dx < 0 ? 1 : -1));
				},
				{ passive: true }
			);
		}
		show(i);
		document.body.append($lightbox);
		document.body.classList.add('lb-open');
		close.focus();
	};

	// ── 对话内查找（包括还没展开的思考过程和工具结果） ──
	const find = { q: '', hits: [], idx: -1, origin: 0 };
	let $find = null; // { bar, input, count, prev, next }
	const FIND_MAX = 1000;
	const FIND_SKIP = '.katex, .msg-head, .msg-foot, .code-head, .code-more, .sources-label, .day-sep';
	const FIND_BLOCK = 'p, li, pre, td, th, h1, h2, h3, h4, h5, h6, blockquote, summary, .kv-label, .error-box, .chip';
	const clearMarks = () => {
		const parents = new Set();
		for (const mk of document.querySelectorAll('mark.hit')) {
			parents.add(mk.parentNode);
			mk.replaceWith(document.createTextNode(mk.textContent));
		}
		for (const p of parents) p.normalize();
		find.hits = [];
		find.idx = -1;
	};
	const showCount = () => {
		if (!$find) return;
		const n = find.hits.length;
		$find.count.textContent = !find.q ? '' : !n ? '无结果' : `${find.idx + 1} / ${n >= FIND_MAX ? FIND_MAX + '+' : n}`;
		$find.bar.classList.toggle('none', !!find.q && !n);
		$find.prev.disabled = $find.next.disabled = n < 2;
	};
	const gotoHit = (i, scroll = true) => {
		const n = find.hits.length;
		if (!n) return showCount();
		for (const mk of find.hits[find.idx] || []) mk.classList.remove('cur');
		find.idx = ((i % n) + n) % n;
		const hit = find.hits[find.idx];
		for (const mk of hit) mk.classList.add('cur');
		if (scroll) {
			for (let d = hit[0].closest('details'); d; d = d.parentElement.closest('details')) {
				if (!d.querySelector(':scope > summary')?.contains(hit[0])) d.open = true;
			}
			hit[0].closest('.code-block.long')?._setOpen(true);
			hit[0].scrollIntoView({ block: 'center', inline: 'nearest' });
		}
		showCount();
	};
	// 命中在页面上的纵向位置；收起的折叠块里的命中按折叠块的位置算
	const hitY = (hit) => {
		let el = hit[0];
		for (let d = el.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) el = d;
		return el.getBoundingClientRect().top + window.scrollY;
	};
	const nearestHit = (fromY) => Math.max(0, find.hits.findIndex((hit) => hitY(hit) >= fromY + topOffset() - 1));
	const runFind = () => {
		clearMarks();
		const q = find.q.toLowerCase();
		if (!q || !$messages) return showCount();
		for (let pass = 0; pass < 3; pass++) for (const d of $messages.querySelectorAll('details.fold')) d._fill?.();
		// 同一个段落里相邻的文本节点拼起来再找，这样跨越加粗、代码高亮等标签的词也能命中
		const groups = [];
		let lastKey = null;
		const walker = document.createTreeWalker($messages, NodeFilter.SHOW_TEXT);
		for (let n; (n = walker.nextNode()); ) {
			const pe = n.parentElement;
			if (!pe || pe.closest(FIND_SKIP)) continue;
			const key = pe.closest(FIND_BLOCK) || pe;
			if (key !== lastKey) {
				groups.push([]);
				lastKey = key;
			}
			groups[groups.length - 1].push(n);
		}
		const hits = [];
		for (const nodes of groups) {
			if (hits.length >= FIND_MAX) break;
			const starts = [];
			let text = '';
			for (const n of nodes) {
				starts.push(text.length);
				text += n.nodeValue;
			}
			const low = text.toLowerCase();
			const hay = low.length === text.length ? low : text; // 个别字符转小写后长度会变
			const segs = nodes.map(() => []);
			let any = false;
			for (let at = hay.indexOf(q); at >= 0 && hits.length < FIND_MAX; at = hay.indexOf(q, at + q.length)) {
				const hit = [];
				hits.push(hit);
				any = true;
				const end = at + q.length;
				for (let k = 0; k < nodes.length && starts[k] < end; k++) {
					const s = Math.max(at, starts[k]);
					const e = Math.min(end, starts[k] + nodes[k].nodeValue.length);
					if (s < e) segs[k].push({ s: s - starts[k], e: e - starts[k], hit });
				}
			}
			if (!any) continue;
			nodes.forEach((n, k) => {
				const made = [];
				for (const sg of segs[k].reverse()) {
					const mid = n.splitText(sg.s);
					mid.splitText(sg.e - sg.s);
					const mk = h('mark', { class: 'hit' });
					mid.replaceWith(mk);
					mk.append(mid);
					made.push([sg.hit, mk]);
				}
				for (const [hit, mk] of made.reverse()) hit.push(mk);
			});
		}
		find.hits = hits;
		showCount();
	};
	const openFind = (q, { focus = true, scroll = true } = {}) => {
		if (!$find) return;
		closePop();
		$find.bar.hidden = false;
		document.querySelector('[data-tool="find"]')?.setAttribute('aria-pressed', 'true');
		if (q != null) $find.input.value = q;
		find.q = $find.input.value.trim();
		find.origin = window.scrollY;
		runFind();
		// 从当前阅读位置往下的第一处开始
		if (find.hits.length) gotoHit(nearestHit(find.origin), scroll);
		if (focus) {
			$find.input.focus();
			$find.input.select();
		}
	};
	const closeFind = () => {
		if (!$find || $find.bar.hidden) return false;
		$find.input.blur(); // 否则焦点会在隐藏的输入框里多停一帧，紧接着按的快捷键会被当成打字
		$find.bar.hidden = true;
		document.querySelector('[data-tool="find"]')?.setAttribute('aria-pressed', 'false');
		find.q = '';
		clearMarks();
		return true;
	};
	const findBar = () => {
		const input = h('input', { type: 'search', placeholder: '在对话中查找…', 'aria-label': '在对话中查找', enterkeyhint: 'search', autocomplete: 'off' });
		const count = h('span', { class: 'find-count', role: 'status' });
		const prev = h('button', { class: 'icon-btn', title: '上一处 (Shift+Enter)', 'aria-label': '上一处', html: I.up, onclick: () => gotoHit(find.idx - 1) });
		const next = h('button', { class: 'icon-btn', title: '下一处 (Enter)', 'aria-label': '下一处', html: I.down, onclick: () => gotoHit(find.idx + 1) });
		const bar = h('div', { class: 'findbar', hidden: true }, h('label', { class: 'find-field' }, h('span', { html: I.search }), input, count), prev, next, h('button', { class: 'icon-btn', title: '关闭查找 (Esc)', 'aria-label': '关闭查找', html: I.close, onclick: closeFind }));
		let timer;
		input.addEventListener('input', () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				find.q = input.value.trim();
				if (!find.q) find.origin = window.scrollY;
				runFind();
				gotoHit(nearestHit(find.origin));
			}, 160);
		});
		input.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			e.preventDefault();
			gotoHit(find.idx + (e.shiftKey ? -1 : 1));
		});
		$find = { bar, input, count, prev, next };
		return bar;
	};

	// ── 弹出面板：目录 / 阅读设置 ──
	let $pop = null;
	let popKind = null;
	const closePop = () => {
		if (!$pop) return false;
		$pop.remove();
		$pop = null;
		popKind = null;
		for (const b of document.querySelectorAll('.tools [aria-expanded]')) b.setAttribute('aria-expanded', 'false');
		return true;
	};
	const togglePop = (kind) => {
		const same = popKind === kind;
		closePop();
		const bar = document.querySelector('.topbar');
		if (same || !bar || !state.current) return;
		$pop = h('div', { class: `pop pop-${kind}`, role: 'dialog', 'aria-label': kind === 'outline' ? '目录' : '阅读设置' }, kind === 'outline' ? buildOutline() : buildSettings());
		popKind = kind;
		bar.append($pop);
		document.querySelector(`[data-tool="${kind}"]`)?.setAttribute('aria-expanded', 'true');
		const on = [...$pop.querySelectorAll('.outline-item.on')].pop();
		if (on) on.parentElement.scrollTop = on.offsetTop - on.parentElement.clientHeight / 2;
	};
	document.addEventListener('pointerdown', (e) => {
		if ($pop && !e.target.closest?.('.pop, .tools')) closePop();
	});

	const buildOutline = () => {
		const path = state.current.tree.path();
		if (!path.length) return h('div', { class: 'empty' }, '这个对话没有消息');
		const asked = path.filter((e) => e.msg.role === 'user');
		const items = asked.length ? asked : path;
		const order = path.map((e) => String(e.msg.id));
		const at = order.indexOf(currentMsg()?.dataset.id);
		let active = null;
		for (const e of items) if (order.indexOf(String(e.msg.id)) <= at) active = e;
		// 每个提问后面、下一个提问之前的回答里的标题（不含折叠块里的）
		const headings = new Map();
		let owner = null;
		for (const e of path) {
			if (items.includes(e)) owner = e;
			if (!owner || e.msg.role === 'user') continue;
			const hs = [...(document.getElementById(`m-${e.msg.id}`)?.querySelectorAll('.msg-body > .md :is(h1, h2, h3)') || [])].filter((x) => x.textContent.trim());
			const top = Math.min(...hs.map((x) => +x.tagName[1]));
			const list = headings.get(owner) || headings.set(owner, []).get(owner);
			for (const x of hs) list.push({ el: x, depth: Math.min(2, +x.tagName[1] - top), text: x.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) });
		}
		// 当前位置：读到某个小标题下面时高亮小标题，否则高亮提问
		const line = topOffset() + 8;
		const sub = (headings.get(active) || []).filter((x) => x.el.getBoundingClientRect().top <= line).pop();
		const subItem = (x) =>
			h(
				'button',
				{
					class: `outline-item sub d${x.depth}` + (x === sub ? ' on' : ''),
					'aria-current': x === sub ? 'true' : null,
					onclick: () => {
						closePop();
						scrollToEl(x.el);
					}
				},
				h('span', { class: 'outline-t' }, x.text)
			);
		return [
			h('div', { class: 'pop-title' }, asked.length ? `目录 · ${items.length} 个提问` : `目录 · ${items.length} 条消息`),
			h(
				'div',
				{ class: 'outline' },
				items.map((e, i) => [
					h(
						'button',
						{
							class: 'outline-item' + (e === active && !sub ? ' on' : ''),
							'aria-current': e === active && !sub ? 'true' : null,
							onclick: () => {
								closePop();
								flashMsg(e.msg.id);
							}
						},
						h('span', { class: 'outline-n' }, i + 1),
						h('span', { class: 'outline-t' }, messageText(e.msg).replace(/\s+/g, ' ').trim().slice(0, 90) || '（图片 / 附件）')
					),
					(headings.get(e) || []).map(subItem)
				])
			)
		];
	};

	const buildSettings = () => {
		const val = h('span', { class: 'font-val' });
		const minus = h('button', { class: 'btn', 'aria-label': '减小字号', onclick: () => step(-1) }, 'A−');
		const plus = h('button', { class: 'btn', 'aria-label': '增大字号', onclick: () => step(1) }, 'A+');
		const show = () => {
			val.textContent = `${Math.round(FONT_STEPS[prefs.font] * 100)}%`;
			minus.disabled = prefs.font === 0;
			plus.disabled = prefs.font === FONT_STEPS.length - 1;
		};
		const step = (d) => {
			prefs.font = Math.min(FONT_STEPS.length - 1, Math.max(0, prefs.font + d));
			keepPos(applyPrefs);
			show();
		};
		show();
		const sw = (label, key, cls = '') => {
			const b = h(
				'button',
				{
					class: `switch ${cls}`,
					role: 'switch',
					'aria-checked': String(!!prefs[key]),
					onclick: () => {
						prefs[key] = !prefs[key];
						b.setAttribute('aria-checked', String(prefs[key]));
						keepPos(applyPrefs);
					}
				},
				h('span', {}, label),
				h('span', { class: 'switch-knob', 'aria-hidden': 'true' })
			);
			return b;
		};
		const key = (k, label) => h('div', { class: 'key-row' }, h('span', {}, label), h('span', {}, k.split(' ').map((x) => h('kbd', { class: 'kbd' }, x))));
		return [
			h('div', { class: 'pop-title' }, '阅读设置'),
			h('div', { class: 'set-row' }, h('span', {}, '正文字号'), h('span', { class: 'font-step' }, minus, val, plus)),
			sw('宽版布局', 'wide', 'only-desktop'),
			sw('代码自动换行', 'wrap'),
			h(
				'div',
				{ class: 'set-row' },
				h('span', {}, '思考过程 / 工具调用'),
				h('span', { class: 'font-step' }, h('button', { class: 'btn', onclick: () => setFolds(true) }, '全部展开'), h('button', { class: 'btn', onclick: () => setFolds(false) }, '全部收起'))
			),
			h(
				'div',
				{ class: 'keys' },
				h('div', { class: 'pop-title' }, '快捷键'),
				key('J K', '下一条 / 上一条消息'),
				key('F', '对话内查找'),
				key('O', '目录'),
				key('E', '展开 / 收起全部折叠块'),
				key('G', '回到顶部（Shift+G 到底部）'),
				key('[ ]', '较新 / 较早的对话'),
				key('/', '搜索全部对话')
			)
		];
	};

	// ── 阅读进度与续读 ──
	let $toast = null;
	let toastTimer = 0;
	const hideToast = () => {
		clearTimeout(toastTimer);
		$toast?.remove();
		$toast = null;
		document.body.classList.remove('has-toast');
	};
	const resumeTo = (pos) => {
		hideToast();
		if (!restorePos(pos)) window.scrollTo(0, ((document.documentElement.scrollHeight - window.innerHeight) * pos.p) / 100);
	};
	const showResume = (pos, label = '上次读到') => {
		hideToast();
		$toast = h(
			'div',
			{ class: 'toast', role: 'status' },
			h('span', { html: I.clock }),
			h('span', { class: 'toast-text' }, `${label} ${pos.p}%`),
			h(
				'button',
				{
					class: 'toast-btn',
					onclick: () => resumeTo(pos)
				},
				'继续阅读'
			),
			h('button', { class: 'icon-btn', title: '关闭', 'aria-label': '关闭', html: I.x, onclick: hideToast })
		);
		$main.append($toast);
		document.body.classList.add('has-toast');
		toastTimer = setTimeout(hideToast, 12000);
	};
	let scrollRaf = 0;
	let saveTimer = 0;
	let lastY = 0;
	let goingUp = false;
	const updateProgress = (save = true) => {
		const bar = document.querySelector('.progress i');
		if (!state.current || !bar) return;
		const y = window.scrollY;
		const max = document.documentElement.scrollHeight - window.innerHeight;
		const p = max > 40 ? Math.min(1, Math.max(0, y / max)) : 1;
		bar.style.transform = `scaleX(${p})`;
		const title = document.querySelector('.chat-head h1');
		const cl = document.body.classList;
		cl.toggle('scrolled', !!title && title.getBoundingClientRect().bottom < 40);
		// 往上翻时给「回到顶部」，往下读时给「跳到底部」，同一时间只出现一个
		if (Math.abs(y - lastY) > 4) goingUp = y < lastY;
		lastY = y;
		cl.toggle('can-top', goingUp && y > 600);
		cl.toggle('can-bottom', !goingUp && max - y > 600);
		if ($toast && !$toast.dataset.keep && y > 400) hideToast(); // 自己往下读了，就不再提示续读
		if (!save || $toast) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(flushReading, 400);
	};
	const flushReading = () => {
		clearTimeout(saveTimer);
		saveTimer = 0;
		if (!state.current || !document.querySelector('.progress')) return;
		const max = document.documentElement.scrollHeight - window.innerHeight;
		if (max <= 40) return; // 一屏以内的短对话没有"读到哪里"可言
		const p = Math.min(1, Math.max(0, window.scrollY / max));
		saveReading(state.current.id, { ...(readPos() || {}), p: Math.round(p * 100) });
	};
	window.addEventListener('pagehide', () => {
		if (saveTimer) flushReading();
		pushReading(true);
	});
	window.addEventListener('online', () => pushReading());
	document.addEventListener('visibilitychange', async () => {
		if (!$search?.isConnected) return; // 登录页
		if (document.hidden) {
			if (saveTimer) flushReading();
			pushReading(true);
			return;
		}
		// 回到这个标签页：看看别的设备有没有读得更远
		if (Date.now() - lastPull < 20000) return;
		const changed = await pullReading();
		if (!changed.length) return;
		refreshRecents();
		const id = state.current?.id;
		if (!id || !changed.includes(id) || !unfinished(id) || $toast || !document.querySelector('.progress')) return;
		const max = document.documentElement.scrollHeight - window.innerHeight;
		const here = max > 40 ? Math.round((window.scrollY / max) * 100) : 100;
		if (Math.abs(reading[id].p - here) >= 3) {
			showResume({ ...reading[id] }, '其他设备读到');
			$toast.dataset.keep = '1';
		}
	});
	// 跳到某条消息（必要时切到它所在的分支）；带着搜索词时定位到消息里第一处命中
	const jumpToHit = () => {
		const mid = state.focusMessage;
		const q = state.findQuery;
		state.focusMessage = state.findQuery = null;
		const { tree } = state.current;
		if (mid == null || !tree.map[mid]) return false;
		if (!document.getElementById(`m-${mid}`)) {
			tree.selectPathTo(mid);
			renderMessages();
		}
		const el = flashMsg(mid);
		if (!el) return false;
		if (q) {
			openFind(q, { focus: false, scroll: false });
			const i = find.hits.findIndex((hit) => el.contains(hit[0]));
			if (i >= 0) gotoHit(i);
			else scrollToEl(el);
		}
		hideToast();
		return true;
	};
	window.addEventListener(
		'scroll',
		() => {
			if (scrollRaf) return;
			scrollRaf = requestAnimationFrame(() => {
				scrollRaf = 0;
				updateProgress();
			});
		},
		{ passive: true }
	);
	const fab = () =>
		h(
			'div',
			{ class: 'fab' },
			h('button', { class: 'icon-btn fab-top', title: '回到顶部', 'aria-label': '回到顶部', html: I.toTop, onclick: () => window.scrollTo(0, 0) }),
			h('button', { class: 'icon-btn fab-bottom', title: '跳到底部', 'aria-label': '跳到底部', html: I.toBottom, onclick: () => window.scrollTo(0, document.documentElement.scrollHeight) })
		);
	const msgLink = (mid) => `${location.origin}${location.pathname}#/c/${encodeURIComponent(state.currentId)}/m/${encodeURIComponent(mid)}`;

	async function openChat(id, { quiet = false } = {}) {
		if (saveTimer) flushReading();
		closePop();
		if (!quiet) closeLightbox();
		hideToast();
		state.currentId = id;
		refreshRecents();
		for (const el of $list.querySelectorAll('.chat-item')) el.classList.toggle('active', el.dataset.id === id);
		if (!id) {
			state.current = null;
			$find = null;
			document.title = '对话归档';
			document.body.classList.remove('scrolled', 'can-top', 'can-bottom', 'reading');
			setHome(true);
			const s = state.status;
			const stat = (n, label, cls = '') => h('div', { class: `stat ${cls}` }, h('div', { class: 'stat-num' }, n), h('div', { class: 'stat-label' }, label));
			$main.replaceChildren(
				topbar(''),
				h(
					'div',
					{ class: 'welcome' },
					h('div', { class: 'welcome-mark', html: I.archive }),
					h('h1', {}, '对话归档'),
					s ? h('div', { class: 'stats' }, stat(s.chats, '个对话'), stat(s.messages, '条消息'), state.chats.length > 1 ? stat('…', '字', 'stat-chars') : null) : null,
					h('p', { class: 'dim' }, '从左侧选择一个对话开始阅读，或直接搜索全文。'),
					overview()
				)
			);
			return;
		}
		let data;
		try {
			data = await api(`/api/chats/${encodeURIComponent(id)}`);
		} catch (e) {
			if (state.currentId === id) {
				setHome(false);
				state.current = null;
				$find = null;
				document.body.classList.remove('scrolled', 'can-top', 'can-bottom', 'reading');
				$main.replaceChildren(topbar(''), h('div', { class: 'welcome' }, h('h1', {}, '无法打开'), h('p', {}, e.message)));
			}
			return;
		}
		if (state.currentId !== id) return;
		if (saveTimer) flushReading();
		setHome(false);
		document.body.classList.add('reading');
		const record = data.record;
		const tree = buildTree(record.chat);
		// 同步后原地刷新时，保留查找栏的内容
		const keepFind = quiet && $find && !$find.bar.hidden ? $find.input.value : null;
		state.current = { id, meta: data, record, tree };
		find.q = '';
		find.hits = [];
		find.idx = -1;
		if (state.focusMessage && tree.map[state.focusMessage]) {
			// 让搜索命中的消息所在分支可见
			tree.selectPathTo(state.focusMessage);
		}
		document.title = `${record.title} · 对话归档`;

		const pathLen = tree.path().length;
		const badges = [
			data.archived ? h('span', { class: 'badge' }, '已归档') : null,
			data.pinned ? h('span', { class: 'badge' }, '置顶') : null,
			data.missing_upstream ? h('span', { class: 'badge warn', title: '该对话在源站已被删除，这里保留着最后一次同步的副本' }, '源站已删除') : null
		];
		const folder = state.folders.find((f) => f.id === data.folder_id);
		const info = [
			fmtDate(record.created_at),
			record.updated_at !== record.created_at ? `更新于 ${fmtDate(record.updated_at)}` : null,
			`${pathLen} 条消息${tree.total > pathLen ? `（含其他分支共 ${tree.total} 条）` : ''}`,
			sizeText(tree.path().reduce((n, e) => n + countChars(messageText(e.msg)), 0)),
			folder ? `文件夹：${folder.name}` : null
		].filter(Boolean);
		const tags = (data.tags || []).map((t) =>
			h(
				'button',
				{
					class: 'tag',
					onclick: () => {
						state.tag = t;
						state.view = data.archived ? 'archived' : 'active';
						renderSidebar();
						openNav();
					}
				},
				`#${t}`
			)
		);
		// 时间线上相邻的对话（同在「对话」或同在「已归档」里）
		const peers = state.chats.filter((c) => !!c.archived === !!data.archived);
		const at = peers.findIndex((c) => c.id === id);
		const adj = { newer: at > 0 ? peers[at - 1] : null, older: at >= 0 ? peers[at + 1] || null : null };
		state.current.adj = adj;
		const adjLink = (c, label, cls) =>
			c
				? h(
						'a',
						{ class: `chat-nav-item ${cls}`, href: `#/c/${encodeURIComponent(c.id)}` },
						h('span', { class: 'chat-nav-dir' }, cls === 'newer' ? h('span', { html: I.left }) : null, label, cls === 'older' ? h('span', { html: I.chevron }) : null),
						h('span', { class: 'chat-nav-title' }, c.title)
					)
				: h('span', {});
		const chatNav = adj.newer || adj.older ? h('nav', { class: 'chat-nav', 'aria-label': '相邻对话' }, adjLink(adj.newer, '较新的对话', 'newer'), adjLink(adj.older, '较早的对话', 'older')) : null;
		$messages = h('div', { class: 'messages' });
		$messages.addEventListener('click', (e) => {
			// 正文里的图片：页内放大查看
			if (e.target.matches?.('.md img') && !e.target.closest('a') && e.target.naturalWidth) openLightbox(e.target.getAttribute('src'), e.target);
		});
		const actions = h(
			'div',
			{ class: 'actions' },
			h('button', { class: 'btn', onclick: () => download(`${safeName(record.title)}.md`, toMarkdown(), 'text/markdown;charset=utf-8') }, h('span', { html: I.download }), 'Markdown'),
			h('a', { class: 'btn', href: `/api/chats/${encodeURIComponent(id)}?download`, download: `${safeName(record.title)}.json` }, h('span', { html: I.download }), 'JSON'),
			h('button', { class: 'btn', onclick: () => window.print() }, h('span', { html: I.print }), '打印')
		);
		$main.replaceChildren(
			topbar(record.title, true),
			fab(),
			h(
				'div',
				{ class: 'reader' },
				h('header', { class: 'chat-head' }, h('h1', {}, record.title), h('div', { class: 'chat-info' }, info.map((t) => h('span', {}, t))), h('div', { class: 'chat-tags' }, badges, tags), actions),
				$messages,
				chatNav,
				h('footer', { class: 'reader-foot' }, `最后同步于 ${fmtDate(data.synced_at)} · 只读归档`)
			)
		);
		renderMessages();
		if (keepFind) openFind(keepFind, { focus: false, scroll: false });
		lastY = 0;
		goingUp = false;
		if (!jumpToHit()) {
			window.scrollTo(0, 0);
			const saved = quiet ? null : reading[id]; // 同步后的原地刷新由调用方恢复滚动位置
			if (saved && state.resume) resumeTo({ ...saved });
			else if (saved && unfinished(id)) showResume({ ...saved });
		}
		state.resume = false;
		updateProgress(false);
	}

	const topbar = (title, tools = false) => {
		const tool = (name, label, ico, onclick, attrs) => h('button', { class: 'icon-btn', title: label, 'aria-label': label, html: ico, onclick, dataset: { tool: name }, ...attrs });
		return h(
			'div',
			{ class: 'topbar' + (tools ? ' reading' : '') },
			h(
				'div',
				{ class: 'topbar-row' },
				h('button', { class: 'icon-btn menu-btn', title: '打开对话列表', 'aria-label': '打开对话列表', html: I.menu, onclick: openNav }),
				h('span', { class: 'topbar-title' }, title || '对话归档'),
				tools
					? h(
							'div',
							{ class: 'tools' },
							tool('find', '在对话中查找 (F)', I.find, () => ($find.bar.hidden ? openFind() : closeFind()), { 'aria-pressed': 'false' }),
							tool('outline', '目录 (O)', I.list, () => togglePop('outline'), { 'aria-expanded': 'false' }),
							tool('settings', '阅读设置', I.type, () => togglePop('settings'), { 'aria-expanded': 'false' })
						)
					: null
			),
			tools ? findBar() : null,
			tools ? h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i')) : null
		);
	};

	// ───────────── 启动与路由 ─────────────
	async function loadIndex() {
		const data = await api('/api/index');
		state.chats = data.chats;
		state.byId = new Map(data.chats.map((c) => [c.id, c]));
		state.folders = data.folders;
		state.status = data.status;
		renderSidebar();
		renderStatus();
		// 正在阅读的对话在这次同步里有变化时，原地刷新并保持滚动位置
		const cur = state.current;
		const c = cur && state.byId.get(state.currentId);
		if (c && (c.updated_at !== cur.record.updated_at || c.missing_upstream !== cur.meta.missing_upstream || c.archived !== cur.meta.archived || c.pinned !== cur.meta.pinned)) {
			const y = window.scrollY;
			await openChat(state.currentId, { quiet: true });
			window.scrollTo(0, y);
		}
	}
	const goAdj = (dir) => {
		const c = state.current?.adj?.[dir];
		if (c) location.hash = `#/c/${encodeURIComponent(c.id)}`;
	};
	const safeDecode = (s) => {
		try {
			return decodeURIComponent(s);
		} catch {
			return s;
		}
	};
	// #/c/<对话>  或  #/c/<对话>/m/<消息>
	const route = () => {
		const m = /^#\/c\/(.+?)(?:\/m\/([^/]+))?$/.exec(location.hash);
		const id = m ? safeDecode(m[1]) : null;
		// 刷新页面或从别的网页返回：回到刚才读到的位置
		const restore = restoreOnLoad && id != null && !!reading[id];
		restoreOnLoad = false;
		if (restore) state.resume = true;
		else if (m?.[2]) state.focusMessage = safeDecode(m[2]);
		if (id !== state.currentId || !state.current) openChat(id);
		else if (m?.[2]) jumpToHit();
	};
	async function boot() {
		renderShell();
		try {
			// 阅读位置和对话列表一起取；取不到也不影响阅读
			await Promise.all([loadIndex(), pullReading(), loadStars()]);
		} catch {
			return;
		}
		renderSidebar();
		state.currentId = undefined;
		route();
		pollStatus(state.status?.running ? 1500 : 30000);
	}
	window.addEventListener('hashchange', route);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			// 一次只关一层
			if (closeLightbox()) return;
			if (navShowing()) return closeNav();
			if (!closePop() && !closeFind()) closeNav();
			return;
		}
		if (lbStep && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault();
			lbStep(e.key === 'ArrowLeft' ? -1 : 1);
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || !$search?.isConnected) return;
		if (e.key === '/') {
			e.preventDefault();
			openNav();
			$search.focus();
			return;
		}
		if (!state.current || $lightbox || navShowing()) return;
		const run = {
			j: () => stepMsg(1),
			k: () => stepMsg(-1),
			f: () => openFind(),
			o: () => togglePop('outline'),
			e: toggleFolds,
			g: () => window.scrollTo(0, e.shiftKey ? document.documentElement.scrollHeight : 0),
			'[': () => goAdj('newer'),
			']': () => goAdj('older')
		}[e.key.length === 1 ? e.key.toLowerCase() : ''];
		if (!run) return;
		e.preventDefault();
		run();
	});
	boot();
})();
