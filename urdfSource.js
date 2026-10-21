// Full-file URDF reading view. The viewer never changes the model document.
export function createSourceView({ onSelect }) {
  const $ = id => document.getElementById(id);
  let blocks = [], lines = [], currentMatch = -1, matches = [];
  let fullText = '';
  const escapeAttribute = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const opening = node => `<${node.tagName}${[...node.attributes].map(a => ` ${a.name}="${escapeAttribute(a.value)}"`).join('')}`;
  function pretty(node, depth) {
    const indent = '  '.repeat(depth);
    if (node.nodeType === 8) return (indent + `<!--${node.nodeValue}-->`).split('\n');
    if (node.nodeType !== 1) return [];
    const children = [...node.childNodes].filter(n => n.nodeType === 1 || n.nodeType === 8 || (n.nodeType === 3 && n.textContent.trim()));
    if (!children.length) return [indent + opening(node) + ' />'];
    if (children.every(n => n.nodeType === 3)) return [indent + new XMLSerializer().serializeToString(node)];
    return [indent + opening(node) + '>', ...children.flatMap(n => pretty(n, depth + 1)), indent + `</${node.tagName}>`];
  }
  function highlight(text, target) {
    const pattern = /<!--.*?-->|<\/?[\w:.-]+|[\w:.-]+(?=\s*=)|"[^"]*"|'[^']*'/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      target.append(document.createTextNode(text.slice(offset, match.index)));
      const token = document.createElement('span');
      token.className = match[0].startsWith('<!--') ? 'token-comment' : match[0].startsWith('<') ? 'token-tag' : /^["']/.test(match[0]) ? 'token-string' : 'token-attribute';
      token.textContent = match[0];
      target.append(token);
      offset = match.index + match[0].length;
    }
    target.append(document.createTextNode(text.slice(offset)));
  }
  function render(documentXML, filename) {
    $('source-code').replaceChildren();
    blocks = []; lines = [];
    const root = documentXML.documentElement;
    const fragments = [{ text: ['<?xml version="1.0" encoding="utf-8"?>'] }];
    for (const n of documentXML.childNodes) if (n.nodeType === 8) fragments.push({ text: pretty(n, 0) });
    fragments.push({ text: [opening(root) + '>'] });
    for (const node of root.childNodes) {
      if (node.nodeType !== 1 && node.nodeType !== 8) continue;
      fragments.push({ text: pretty(node, 1), kind: ['link', 'joint'].includes(node.nodeName) ? node.nodeName : null, name: node.getAttribute?.('name') });
    }
    fragments.push({ text: ['</robot>'] });
    let lineNumber = 0;
    for (const fragment of fragments) {
      const block = document.createElement('div');
      block.className = 'code-block';
      if (fragment.kind) {
        block.dataset.kind = fragment.kind;
        block.dataset.name = fragment.name;
        block.tabIndex = 0;
        block.setAttribute('role', 'button');
        block.setAttribute('aria-label', `${fragment.kind} ${fragment.name} 代码块`);
        const choose = () => onSelect(fragment.kind, fragment.name);
        block.onclick = choose;
        block.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } };
        blocks.push({ kind: fragment.kind, name: fragment.name, element: block });
      }
      for (const text of fragment.text) {
        const row = document.createElement('div');
        row.className = 'code-line';
        const number = document.createElement('span');
        number.className = 'line-no'; number.textContent = ++lineNumber; number.setAttribute('aria-hidden', 'true');
        const code = document.createElement('span'); code.className = 'code-text'; highlight(text, code);
        row.append(number, code); block.append(row); lines.push({ text, element: row });
      }
      $('source-code').append(block);
    }
    fullText = lines.map(l => l.text).join('\n') + '\n';
    $('source-filename').textContent = filename;
    $('source-stats').textContent = `${lineNumber} 行 · ${root.querySelectorAll(':scope > link').length} links · ${root.querySelectorAll(':scope > joint').length} joints`;
    $('source-code').scrollTop = 0;
    search(false);
  }
  function reveal(element) {
    // Scroll only the code pane; never move the whole classroom workspace.
    const pane = $('source-code');
    const y = element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    pane.scrollTo({ top: Math.max(y - 30, 0), behavior: 'instant' });
  }
  function select(kind, name, scroll = false) {
    for (const block of blocks) {
      const active = block.kind === kind && block.name === name;
      block.element.classList.toggle('selected', active);
      block.element.setAttribute('aria-pressed', String(active));
      if (active && scroll) reveal(block.element);
    }
  }
  function search(scroll = true) {
    const query = $('source-search').value.trim().toLowerCase();
    matches = [];
    for (const line of lines) {
      const match = Boolean(query) && line.text.toLowerCase().includes(query);
      line.element.classList.toggle('search-match', match);
      line.element.classList.remove('current-match');
      if (match) matches.push(line);
    }
    currentMatch = matches.length ? 0 : -1;
    updateMatch(scroll);
  }
  function updateMatch(scroll) {
    matches.forEach((m, i) => m.element.classList.toggle('current-match', i === currentMatch));
    $('search-result').textContent = $('source-search').value.trim() ? matches.length ? `${currentMatch + 1}/${matches.length}` : '无结果' : '';
    $('search-next').disabled = !matches.length;
    if (scroll && matches[currentMatch]) reveal(matches[currentMatch].element);
  }
  $('source-search').oninput = () => search();
  $('search-next').onclick = () => { currentMatch = (currentMatch + 1) % matches.length; updateMatch(true); };
  $('source-search').onkeydown = event => { if (event.key === 'Enter' && matches.length) $('search-next').click(); };
  $('source-top').onclick = () => { $('source-code').scrollTo({ top:0, left:0 }); };
  return { render, select, text: () => fullText };
}
