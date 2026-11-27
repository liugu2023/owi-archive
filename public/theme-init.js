/* 在首屏绘制前决定主题，避免深色模式下刷新时短暂白屏 */
(() => {
	try {
		const pref = localStorage.getItem('theme') || 'auto';
		const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.dataset.theme = dark ? 'dark' : 'light';
		const ld = document.getElementById('hljs-dark');
		const ll = document.getElementById('hljs-light');
		if (ld) ld.disabled = !dark;
		if (ll) ll.disabled = dark;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181817' : '#fcfbf9');
	} catch {}
})();
