(() => {
  'use strict';
  const OWNER = 'j4hongir';
  const REPO = 'tech-talks';
  const BRANCH = 'main';
  const SKIP = new Set(['assets', 'vendor', '.github', '.git']);
  const encodePath = path => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const api = path => `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodePath(path)}?ref=${BRANCH}`;
  const gh = path => `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/${encodePath(path)}`;
  const tree = path => `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/${encodePath(path)}`;
  const raw = path => `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${encodePath(path)}`;
  const list = document.getElementById('list');
  const listView = document.getElementById('list-view');
  const detail = document.getElementById('detail');
  const readme = document.getElementById('d-readme');
  const actions = document.getElementById('d-actions');
  const text = (tag, className, value) => { const el = document.createElement(tag); el.className = className; el.textContent = value; return el; };
  const label = value => value.replace(/[-_]/g, ' ').replace(/^\w/, ch => ch.toUpperCase());
  const dateLabel = value => {
    const date = new Date(`${String(value).slice(0, 7)}-01T12:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru', {month: 'short', year: 'numeric'});
  };
  let talks = [];
  let opener = null;
  let listScroll = 0;
  let requestId = 0;
  async function request(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {headers: {Accept: 'application/vnd.github.v3+json'}, signal: controller.signal});
      if (!response.ok) throw new Error(String(response.status));
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  const get = path => request(api(path));
  function action(href, title, primary = false) {
    const link = text('a', 'action-link' + (primary ? ' primary' : ''), title); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }
  function renderList() {
    list.replaceChildren();
    if (!talks.length) { list.append(text('p', 'state', 'Выступления скоро появятся.')); return; }
    for (const talk of talks) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'collection-row'; button.dataset.id = talk.id;
      const body = text('span', 'collection-body', ''); body.append(text('span', 'collection-title', talk.title));
      if (talk.desc) body.append(text('span', 'collection-description', talk.desc));
      if (talk.tags.length) { const tags = text('span', 'collection-tags', ''); talk.tags.forEach(tag => tags.append(text('span', '', tag))); body.append(tags); }
      const arrow = text('span', 'collection-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
      button.append(text('span', 'collection-category', talk.date ? dateLabel(talk.date) : 'Материалы'), body, text('span', 'file-type', 'README'), arrow);
      button.addEventListener('click', () => { opener = button; listScroll = window.scrollY; history.pushState({eacTalk: true}, '', '#' + encodeURIComponent(talk.id)); openDetail(talk); });
      list.append(button);
    }
  }
  async function load() {
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = '<div class="state" role="status"><span class="loading-line" aria-hidden="true"></span>Загружаю выступления…</div>';
    try {
      const dirs = (await get('')).filter(file => file.type === 'dir' && !SKIP.has(file.name) && !file.name.startsWith('.'));
      talks = await Promise.all(dirs.map(async dir => {
        let meta = {};
        try { meta = await request(raw(`${dir.name}/meta.json`)); } catch (_) { /* metadata is optional */ }
        return {id: dir.name, title: typeof meta.title === 'string' ? meta.title : label(dir.name), desc: typeof meta.desc === 'string' ? meta.desc : '', tags: Array.isArray(meta.tags) ? meta.tags.filter(tag => typeof tag === 'string') : [], date: typeof meta.date === 'string' ? meta.date : null};
      }));
      talks.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      renderList(); document.getElementById('collection-count').textContent = String(talks.length);
      navigate();
    } catch (_) {
      const state = text('div', 'state', ''); state.setAttribute('role', 'status');
      state.append(text('p', '', 'GitHub временно не отвечает или достигнут лимит запросов. Материалы доступны в репозитории.'));
      const retry = text('button', 'retry-button', 'Повторить'); retry.type = 'button'; retry.addEventListener('click', load);
      const links = text('div', 'detail-actions', ''); links.append(retry, action(tree(''), 'Открыть репозиторий ↗')); state.append(links); list.replaceChildren(state);
    } finally { list.setAttribute('aria-busy', 'false'); }
  }
  async function openDetail(talk) {
    const current = ++requestId;
    document.getElementById('d-date').textContent = talk.date ? dateLabel(talk.date) : 'Доклад / Материалы';
    document.getElementById('d-title').textContent = talk.title;
    document.getElementById('d-desc').textContent = talk.desc;
    document.getElementById('d-tags').replaceChildren(...talk.tags.map(tag => text('span', '', tag)));
    actions.replaceChildren(action(tree(talk.id), 'Исходный код ↗', true));
    readme.innerHTML = '<div class="state" role="status"><span class="loading-line" aria-hidden="true"></span>Загружаю README…</div>';
    readme.setAttribute('aria-busy', 'true'); listView.hidden = true; detail.hidden = false;
    window.scrollTo({top: 0, behavior: 'instant'}); document.getElementById('d-title').focus({preventScroll: true});
    try {
      const files = await get(talk.id);
      if (current !== requestId) return;
      let pdf = files.find(file => file.type === 'file' && /\.pdf$/i.test(file.name));
      let pdfPath = pdf ? `${talk.id}/${pdf.name}` : null;
      if (!pdfPath) {
        for (const dir of files.filter(file => file.type === 'dir')) {
          try {
            pdf = (await get(`${talk.id}/${dir.name}`)).find(file => file.type === 'file' && /\.pdf$/i.test(file.name));
            if (pdf) { pdfPath = `${talk.id}/${dir.name}/${pdf.name}`; break; }
          } catch (_) { /* the source link remains available */ }
          if (current !== requestId) return;
        }
      }
      if (current !== requestId) return;
      if (pdfPath) actions.append(action(gh(pdfPath), 'Слайды · PDF ↗'));
      const file = files.find(file => file.type === 'file' && file.name.toLowerCase() === 'readme.md');
      if (!file) { readme.replaceChildren(text('p', 'state', 'README пока нет. Исходники доступны по ссылке выше.')); return; }
      const data = await get(`${talk.id}/${file.name}`);
      if (current !== requestId) return;
      const markdown = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), ch => ch.charCodeAt(0)));
      const fragment = DOMPurify.sanitize(marked.parse(markdown), {RETURN_DOM_FRAGMENT: true});
      fragment.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (!href.startsWith('#')) {
          link.href = new URL(href, tree(talk.id) + '/').href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        }
      });
      fragment.querySelectorAll('img').forEach(img => { const src = img.getAttribute('src'); if (src) img.src = new URL(src, raw(talk.id) + '/').href; img.loading = 'lazy'; });
      readme.replaceChildren(fragment);
      document.dispatchEvent(new CustomEvent('eac:content', {detail: {root: readme}}));
    } catch (_) {
      if (current !== requestId) return;
      readme.replaceChildren(text('p', 'state', 'README не загрузился. Откройте исходники на GitHub или попробуйте ещё раз.'));
      const retry = text('button', 'retry-button', 'Повторить'); retry.type = 'button'; retry.addEventListener('click', () => openDetail(talk)); readme.append(retry);
    } finally { if (current === requestId) readme.setAttribute('aria-busy', 'false'); }
  }
  function closeDetail() {
    ++requestId; detail.hidden = true; listView.hidden = false;
    window.scrollTo({top: listScroll, behavior: 'instant'});
    if (opener?.isConnected) opener.focus({preventScroll: true});
  }
  function navigate() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { id = ''; }
    const talk = talks.find(item => item.id === id);
    if (talk) openDetail(talk); else if (!detail.hidden) closeDetail();
  }
  function back() { if (history.state?.eacTalk) history.back(); else { history.replaceState(null, '', location.pathname + location.search); closeDetail(); } }
  document.getElementById('back').addEventListener('click', back);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !detail.hidden) back(); });
  window.addEventListener('popstate', navigate);
  load();
})();
