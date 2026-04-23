const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const settingsBtn = document.getElementById('settings-btn');
const settings = document.getElementById('settings');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key');
const clearBtn = document.getElementById('clear-btn');
const langBtn = document.getElementById('lang-btn');

const I18N = {
  zh: {
    btn_clear: 'Clear',
    btn_settings: 'Settings',
    btn_save: 'Save',
    btn_send: 'Send',
    label_api_key: 'OpenAI API Key:',
    placeholder_input: '综合分析 / 买入方案 / 画支撑阻力...',
    tooltip_lang: '切换语言',
    tooltip_clear: '清空对话',
    empty_state: '打开 TradingView 图表页，问我任何关于行情/交易的事<br>例如：「综合分析当前图表给我一套做多方案」',
    thinking: '思考中...',
    confirm_clear: '清空对话历史？',
    api_key_saved: '✅ API Key 已保存',
    tool_exec_prefix: '执行',
    tool_exec_sep: '工具 · ',
  },
  en: {
    btn_clear: 'Clear',
    btn_settings: 'Settings',
    btn_save: 'Save',
    btn_send: 'Send',
    label_api_key: 'OpenAI API Key:',
    placeholder_input: 'Analyze chart / propose a long setup / draw S/R levels...',
    tooltip_lang: 'Switch language',
    tooltip_clear: 'Clear conversation',
    empty_state: 'Open a TradingView chart and ask me anything about the market or a trade<br>e.g., "Give me a long setup based on the current chart"',
    thinking: 'Thinking...',
    confirm_clear: 'Clear conversation history?',
    api_key_saved: '✅ API key saved',
    tool_exec_prefix: 'Executed',
    tool_exec_sep: 'tools · ',
  },
};

let lang = 'zh';
const t = (key) => (I18N[lang] && I18N[lang][key]) ?? key;

function applyI18n() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  langBtn.textContent = lang === 'zh' ? 'EN' : '中';
  const empty = chat.querySelector('.empty-state');
  if (empty) empty.innerHTML = t('empty_state');
}

let conversationHistory = [];
const MAX_HISTORY_TURNS = 10;

chrome.storage.local.get(['apiKey', 'history', 'lang'], ({ apiKey, history, lang: savedLang }) => {
  if (savedLang === 'en' || savedLang === 'zh') lang = savedLang;
  applyI18n();
  if (apiKey) apiKeyInput.value = apiKey;
  if (Array.isArray(history) && history.length) {
    conversationHistory = history;
    replayHistory();
  } else {
    showEmpty();
  }
});

function saveHistory() {
  chrome.storage.local.set({ history: conversationHistory });
}

function replayHistory() {
  chat.innerHTML = '';
  for (const m of conversationHistory) {
    if (m.role === 'user') addMsg('user', m.content);
    else if (m.role === 'assistant' && m.content) addMsg('assistant', m.content);
  }
}

function showEmpty() {
  chat.innerHTML = `<div class="empty-state">${t('empty_state')}</div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMd(text) {
  if (!text) return '';
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    codeBlocks.push('<pre><code>' + escapeHtml(code) + '</code></pre>');
    return `§§CB${codeBlocks.length - 1}§§`;
  });
  text = escapeHtml(text);
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  text = text.replace(/^---+$/gm, '<hr>');
  text = text.replace(/((?:^\|.*\|\s*$\n?){2,})/gm, (tbl) => {
    const rows = tbl.trim().split('\n').map(r => r.trim());
    if (rows.length < 2) return tbl;
    if (!rows[1].match(/^\|[\s:|\-]+\|$/)) return tbl;
    const hd = rows[0].slice(1, -1).split('|').map(c => `<th>${c.trim()}</th>`).join('');
    const body = rows.slice(2).map(r => `<tr>${r.slice(1, -1).split('|').map(c => `<td>${c.trim()}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table><thead><tr>${hd}</tr></thead><tbody>${body}</tbody></table></div>\n`;
  });
  text = text.replace(/^(?:\s*[-*]\s+.+\n?)+/gm, (block) => {
    const items = block.trim().split(/\n/).map(l => `<li>${l.replace(/^\s*[-*]\s+/, '')}</li>`).join('');
    return `<ul>${items}</ul>\n`;
  });
  text = text.replace(/^(?:\s*\d+\.\s+.+\n?)+/gm, (block) => {
    const items = block.trim().split(/\n/).map(l => `<li>${l.replace(/^\s*\d+\.\s+/, '')}</li>`).join('');
    return `<ol>${items}</ol>\n`;
  });
  text = text.replace(/^&gt;\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?):])/g, '$1<em>$2</em>');
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.split(/\n{2,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    if (/^<(h[1-6]|ul|ol|table|pre|blockquote|hr|div)/.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  text = text.replace(/§§CB(\d+)§§/g, (_, i) => codeBlocks[+i]);
  return text;
}

function addMsg(role, text, opts = {}) {
  const empty = chat.querySelector('.empty-state');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = 'msg ' + role + (opts.isError ? ' error' : '');
  if (role === 'assistant') {
    div.innerHTML = renderMd(text);
  } else {
    div.textContent = text;
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function addToolStatus(text) {
  const empty = chat.querySelector('.empty-state');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'tool-status';
  div.innerHTML = `<span class="spinner"></span><span class="txt">${escapeHtml(text)}</span>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function updateToolStatus(el, text) {
  if (el) el.querySelector('.txt').textContent = text;
}

function finalizeToolStatus(el, results) {
  if (!el) return;
  const ok = results.filter(r => r.success).length;
  const fail = results.length - ok;
  const names = results.map(r => `${r.success ? '✓' : '✗'} ${r.action}`).join('  ');
  el.innerHTML = `<span class="tool-done">${t('tool_exec_prefix')} <span class="ok">${ok}</span> / <span class="fail">${fail}</span> ${t('tool_exec_sep')}${escapeHtml(names)}</span>`;
  el.classList.remove('tool-status');
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  addMsg('user', text);
  conversationHistory.push({ role: 'user', content: text });
  input.value = '';
  sendBtn.disabled = true;

  const toolEl = addToolStatus(t('thinking'));

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT',
      history: conversationHistory.slice(-MAX_HISTORY_TURNS * 2),
      lang
    });

    if (response.error) {
      toolEl.remove();
      addMsg('assistant', response.error, { isError: true });
    } else {
      if (response.toolRounds?.length) {
        const allResults = response.toolRounds.flatMap(r => r.results);
        finalizeToolStatus(toolEl, allResults);
      } else {
        toolEl.remove();
      }
      if (response.reply) {
        addMsg('assistant', response.reply);
        conversationHistory.push({ role: 'assistant', content: response.reply });
        saveHistory();
      }
    }
  } catch (e) {
    toolEl.remove();
    addMsg('assistant', 'Error: ' + e.message, { isError: true });
  }

  sendBtn.disabled = false;
  input.focus();
}

sendBtn.onclick = send;
input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

settingsBtn.onclick = () => settings.classList.toggle('show');
saveKeyBtn.onclick = () => {
  chrome.storage.local.set({ apiKey: apiKeyInput.value }, () => {
    settings.classList.remove('show');
    addMsg('assistant', t('api_key_saved'));
  });
};

clearBtn.onclick = () => {
  if (!conversationHistory.length) return;
  if (!confirm(t('confirm_clear'))) return;
  conversationHistory = [];
  saveHistory();
  showEmpty();
};

langBtn.onclick = () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  chrome.storage.local.set({ lang });
  applyI18n();
};
