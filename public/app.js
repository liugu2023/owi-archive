/* 对话归档阅读站前端：只读浏览、搜索、分支切换、导出 */
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
		archive: icon('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>', 26)
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

	const copyBtn = (getText, label = '复制') => {
		const btn = h('button', { class: 'icon-btn', title: label, 'aria-label': label, html: I.copy });
		btn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(getText());
				btn.innerHTML = I.check;
				btn.classList.add('ok');
				setTimeout(() => {
					btn.innerHTML = I.copy;
					btn.classList.remove('ok');
				}, 1200);
			} catch {}
		});
		return btn;
	};

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
		d.addEventListener('toggle', () => {
			if (d.open && !filled) {
				filled = true;
				d.append(h('div', { class: 'fold-body' }, bodyFn()));
			}
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
		const img = h('img', { class: 'attach-img', src, loading: 'lazy', alt: '图片', referrerpolicy: 'no-referrer' });
		img.addEventListener('click', () => window.open(src, '_blank', 'noopener'));
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
		focusMessage: null
	};

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
		document.body.classList.remove('nav-open', 'home');
		$app.replaceChildren(h('div', { class: 'login-wrap' }, form));
		input.focus();
	}

	// ───────────── 布局 ─────────────
	let $list, $main, $status, $search, $tabs;

	function renderShell() {
		$search = h('input', { type: 'search', placeholder: '搜索标题和内容…', 'aria-label': '搜索', value: state.query });
		let timer;
		$search.addEventListener('input', () => {
			clearTimeout(timer);
			timer = setTimeout(() => doSearch($search.value), 250);
		});
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
				h('button', { class: 'icon-btn side-close', title: '关闭对话列表', 'aria-label': '关闭对话列表', html: I.close, onclick: closeNav })
			),
			h('label', { class: 'search' }, h('span', { html: I.search }), $search, h('kbd', { class: 'kbd', title: '按 / 聚焦搜索', 'aria-hidden': 'true' }, '/')),
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

	const openNav = () => document.body.classList.add('nav-open');
	const closeNav = () => document.body.classList.remove('nav-open');

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

	const chatItem = (c, hit) => {
		const a = h(
			'a',
			{
				class: 'chat-item' + (c.id === state.currentId ? ' active' : ''),
				href: `#/c/${c.id}`,
				dataset: { id: c.id },
				onclick: () => {
					state.focusMessage = hit?.message_id || null;
					closeNav();
				}
			},
			h('div', { class: 'chat-title' }, h('span', { class: 'chat-title-text' }, c.title), c.missing_upstream ? h('span', { class: 'dot', title: '源站已删除，仅存于归档' }) : null),
			hit?.snippet ? snippetNode(hit.snippet) : null,
			hit ? h('div', { class: 'chat-meta' }, fmtDate(c.updated_at, false), hit.count > 1 ? ` · ${hit.count} 处匹配` : '') : null
		);
		return a;
	};

	function renderSidebar() {
		const archivedCount = state.chats.filter((c) => c.archived).length;
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

		const frag = document.createDocumentFragment();
		if (state.results) {
			const hits = state.chats.filter((c) => state.results.has(c.id));
			frag.append(h('div', { class: 'group-title' }, `找到 ${hits.length} 个对话`));
			for (const c of hits) frag.append(chatItem(c, state.results.get(c.id)));
			if (!hits.length) frag.append(h('div', { class: 'empty' }, '没有匹配的内容'));
			$list.replaceChildren(frag);
			return;
		}

		let chats = state.chats.filter((c) => (state.view === 'archived' ? c.archived : !c.archived));
		if (state.tag) chats = chats.filter((c) => c.tags.includes(state.tag));
		if (!chats.length) {
			$list.replaceChildren(
				h('div', { class: 'empty' }, state.chats.length ? '这里没有对话' : state.status?.configured ? '尚未同步到任何对话' : '尚未配置同步源')
			);
			return;
		}

		const flat = state.view === 'archived' || state.tag;
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
		return h(
			'article',
			{ class: `msg ${role}`, id: `m-${m.id}`, dataset: { id: m.id } },
			h(
				'header',
				{ class: 'msg-head' },
				role === 'assistant' ? h('span', { class: 'avatar', 'aria-hidden': 'true', html: I.spark }) : null,
				h('span', { class: 'who' }, who),
				ts ? h('time', { title: fmtDate(ts) }, fmtDate(ts)) : null
			),
			body,
			h('footer', { class: 'msg-foot' }, branchNav(entry), copyBtn(() => messageText(m), '复制消息'))
		);
	};

	let $messages;
	function renderMessages() {
		const path = state.current.tree.path();
		$messages.replaceChildren(...path.map(renderMessage));
		if (!path.length) $messages.append(h('div', { class: 'empty' }, '这个对话没有消息'));
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

	async function openChat(id) {
		state.currentId = id;
		for (const el of $list.querySelectorAll('.chat-item')) el.classList.toggle('active', el.dataset.id === id);
		if (!id) {
			state.current = null;
			document.title = '对话归档';
			setHome(true);
			const s = state.status;
			const stat = (n, label) => h('div', { class: 'stat' }, h('div', { class: 'stat-num' }, n), h('div', { class: 'stat-label' }, label));
			$main.replaceChildren(
				topbar(''),
				h(
					'div',
					{ class: 'welcome' },
					h('div', { class: 'welcome-mark', html: I.archive }),
					h('h1', {}, '对话归档'),
					s ? h('div', { class: 'stats' }, stat(s.chats, '个对话'), stat(s.messages, '条消息')) : null,
					h('p', { class: 'dim' }, '从左侧选择一个对话开始阅读，或直接搜索全文。')
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
				$main.replaceChildren(topbar(''), h('div', { class: 'welcome' }, h('h1', {}, '无法打开'), h('p', {}, e.message)));
			}
			return;
		}
		if (state.currentId !== id) return;
		setHome(false);
		const record = data.record;
		const tree = buildTree(record.chat);
		state.current = { meta: data, record, tree };
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
		$messages = h('div', { class: 'messages' });
		const actions = h(
			'div',
			{ class: 'actions' },
			h('button', { class: 'btn', onclick: () => download(`${safeName(record.title)}.md`, toMarkdown(), 'text/markdown;charset=utf-8') }, h('span', { html: I.download }), 'Markdown'),
			h('a', { class: 'btn', href: `/api/chats/${encodeURIComponent(id)}?download`, download: `${safeName(record.title)}.json` }, h('span', { html: I.download }), 'JSON'),
			h('button', { class: 'btn', onclick: () => window.print() }, h('span', { html: I.print }), '打印')
		);
		$main.replaceChildren(
			topbar(record.title),
			h(
				'div',
				{ class: 'reader' },
				h('header', { class: 'chat-head' }, h('h1', {}, record.title), h('div', { class: 'chat-info' }, info.map((t) => h('span', {}, t))), h('div', { class: 'chat-tags' }, badges, tags), actions),
				$messages,
				h('footer', { class: 'reader-foot' }, `最后同步于 ${fmtDate(data.synced_at)} · 只读归档`)
			)
		);
		renderMessages();
		const target = state.focusMessage && document.getElementById(`m-${state.focusMessage}`);
		state.focusMessage = null;
		if (target) {
			target.scrollIntoView({ block: 'start' });
			target.classList.add('flash');
		} else window.scrollTo(0, 0);
	}

	const topbar = (title) =>
		h('div', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '打开对话列表', html: I.menu, onclick: openNav }), h('span', { class: 'topbar-title' }, title || '对话归档'));

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
			await openChat(state.currentId);
			window.scrollTo(0, y);
		}
	}
	const route = () => {
		const m = /^#\/c\/(.+)$/.exec(location.hash);
		const id = m ? decodeURIComponent(m[1]) : null;
		if (id !== state.currentId || !state.current) openChat(id);
	};
	async function boot() {
		renderShell();
		try {
			await loadIndex();
		} catch {
			return;
		}
		state.currentId = undefined;
		route();
		pollStatus(state.status?.running ? 1500 : 30000);
	}
	window.addEventListener('hashchange', route);
	document.addEventListener('keydown', (e) => {
		if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '') && $search) {
			e.preventDefault();
			openNav();
			$search.focus();
		} else if (e.key === 'Escape') closeNav();
	});
	boot();
})();
