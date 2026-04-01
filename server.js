const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;
const WORKSPACE = '/root/.openclaw/workspace';
const BOT_TOKEN = '255998580:AAFzAMk8rVhjhkSGB9qq1WjFcEP7Df3_GEw';
const ALLOWED_USER_ID = 66818492;

const HIDDEN_FILES = ['AGENTS.md','HEARTBEAT.md','IDENTITY.md','SOUL.md','TOOLS.md','USER.md','MEMORY.md','budget.md','debts.md','expenses.md'];

// Virtual combined finance list
const FINANCE_LIST = { id: 'finance', icon: '💰', title: 'Бюджет', type: 'finance', updated: '' };

const LIST_CONFIG = {
  'tasks.md':     { icon: '✅', title: 'Задачи',   type: 'generic' },
  'watchlist.md': { icon: '🎬', title: 'Watchlist', type: 'generic' },
};

const DEFAULT_CONFIG = { icon: '📄', title: '', type: 'generic' };

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Telegram auth ---
function verifyTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string' || initData.trim() === '') return null;
  let params;
  try { params = new URLSearchParams(initData); } catch { return null; }
  const hash = params.get('hash');
  if (!hash) return null;
  const entries = [];
  for (const [key, value] of params) { if (key !== 'hash') entries.push(`${key}=${value}`); }
  entries.sort();
  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  const userJson = params.get('user');
  if (!userJson) return null;
  try { return JSON.parse(userJson); } catch { return null; }
}

function authMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const initData = req.headers['x-telegram-init-data'] || req.query.initData;
  const user = verifyTelegramInitData(initData);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.id !== ALLOWED_USER_ID) return res.status(403).json({ error: 'Forbidden' });
  req.telegramUser = user;
  next();
}
app.use(authMiddleware);

// --- Parsers ---
function parseTable(lines, startIdx) {
  const rows = []; let i = startIdx;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].trim().startsWith('|')) i++;
  if (i < lines.length && /^\|[\s-|]+\|$/.test(lines[i].trim())) i++;
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
    if (cells.length >= 2) rows.push(cells);
    i++;
  }
  return { rows, nextIdx: i };
}

function parseBudget() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'budget.md'), 'utf-8');
  const lines = text.split('\n');
  const deposits = [], cards = [], cash = [], transactions = [];
  let totalBalance = null, section = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## Bank Deposits')) section = 'deposits';
    else if (line.startsWith('## Cards')) section = 'cards';
    else if (line.startsWith('## Cash')) section = 'cash';
    else if (line.includes('TOTAL BALANCE')) section = 'total';
    else if (line.includes('Transaction Log')) section = 'transactions';
    else if (line.startsWith('##')) section = '';
    else if (line.startsWith('|')) {
      const parsed = parseTable(lines, i);
      if (parsed.rows.length > 0) {
        if (section === 'deposits') parsed.rows.forEach(r => deposits.push({ bank: r[0], balance: r[1] }));
        else if (section === 'cards') parsed.rows.forEach(r => cards.push({ card: r[0], balance: r[1] }));
        else if (section === 'cash') parsed.rows.forEach(r => cash.push({ note: r[0], amount: r[1] }));
        else if (section === 'total') {
          totalBalance = {};
          parsed.rows.forEach(r => { totalBalance[r[0].replace(/\*\*/g,'').trim()] = r[1].replace(/\*\*/g,'').trim(); });
        }
        else if (section === 'transactions') parsed.rows.forEach(r => transactions.push({
          date:r[0], type:r[1], fromTo:r[2], description:r[3], amount:r[4], balanceAfter:r[5]
        }));
      }
      i = parsed.nextIdx - 1;
    }
  }
  return { deposits, cards, cash, totalBalance, transactions };
}

function parseDebts() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'debts.md'), 'utf-8');
  const lines = text.split('\n');
  const debtors = []; let cur = null, totals = null, inTotals = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if ((line.startsWith('## 💰') && line.includes('ИТОГО')) || line.startsWith('## ИТОГО')) {
      if (cur) debtors.push(cur); cur = null; inTotals = true; totals = [];
      const p = parseTable(lines, i + 1);
      if (p.rows.length > 0) p.rows.forEach(r => totals.push({ currency: r[0], amount: r[1] }));
      i = p.nextIdx - 1; continue;
    }
    if (inTotals) continue;
    if (line.startsWith('## ') && !line.includes('ИТОГО')) {
      if (cur) debtors.push(cur);
      cur = { name: line.replace('## ',''), entries: [], total: '' };
    }
    if (line.startsWith('**Total:**') && cur) cur.total = line.replace('**Total:**','').trim();
    if (line.startsWith('|') && cur && !inTotals) {
      const p = parseTable(lines, i);
      if (p.rows.length > 0) {
        const h = lines[i].split('|').slice(1,-1).map(c => c.trim().toLowerCase());
        p.rows.forEach(r => { const e = {}; h.forEach((k,idx) => e[k] = r[idx]||''); cur.entries.push(e); });
      }
      i = p.nextIdx - 1;
    }
  }
  if (cur && !inTotals) debtors.push(cur);
  return { debtors, totals };
}

function parseExpenses() {
  const text = fs.readFileSync(path.join(WORKSPACE, 'expenses.md'), 'utf-8');
  const lines = text.split('\n');
  const months = []; let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ') && line.match(/\d{4}/)) {
      if (cur) months.push(cur);
      cur = { name: line.replace('## ',''), expenses: [], total: '' };
    }
    if (line.startsWith('**Total:**') && cur) cur.total = line.replace('**Total:**','').trim();
    if (line.startsWith('|') && cur && !line.match(/^\|[-\s|]+\|$/)) {
      const p = parseTable(lines, i);
      if (p.rows.length > 0) p.rows.forEach(r => cur.expenses.push({ date:r[0], category:r[1], description:r[2], amount:r[3] }));
      i = p.nextIdx - 1;
    }
  }
  if (cur) months.push(cur);
  return { months };
}

function parseGenericMarkdown(text) {
  const lines = text.split('\n'); const sections = []; let cur = null;
  function ensure(t) { if (!cur) { cur = { title:t||'', items:[], tables:[] }; sections.push(cur); } }
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) continue;
    if (trimmed.startsWith('## ')) { cur = { title: trimmed.replace('## ','').replace(/[^\w\sа-яА-ЯёЁ0-9()/-]/g,'').trim(), items:[], tables:[] }; sections.push(cur); continue; }
    if (trimmed.startsWith('|')) {
      ensure(''); const p = parseTable(lines, i);
      if (p.rows.length > 0) {
        const h = lines[i].trim().split('|').slice(1,-1).map(c => c.trim().toLowerCase().replace(/[^\wа-яё]/g,''));
        cur.tables.push({ headers: h, rows: p.rows.map(r => { const o = {}; h.forEach((k,idx) => o[k||'col'+idx] = r[idx]||''); return o; }) });
      }
      i = p.nextIdx - 1; continue;
    }
    const lm = trimmed.match(/^(\d+[.)]\s*|[-*]\s+)/);
    if (lm) {
      ensure(''); const c = trimmed.replace(lm[0],'').trim();
      const ch = c.startsWith('[x]')||c.startsWith('[X]'); const un = c.startsWith('[ ]');
      cur.items.push({ text: c.replace(/^\[[ xX]\]\s*/,'').replace(/\*\*(.*?)\*\*/g,'$1'), checked: ch, hasCheckbox: ch||un, number: lm[1].match(/\d+/)?parseInt(lm[1]):null });
      continue;
    }
    if (trimmed.startsWith('**') && trimmed.includes('**')) { ensure(''); cur.items.push({ text: trimmed.replace(/\*\*/g,''), bold: true }); continue; }
    if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('_Updated')) { ensure(''); cur.items.push({ text: trimmed }); }
  }
  return sections.filter(s => s.title || s.items.length || s.tables.length);
}

// --- API ---

app.get('/api/lists', (req, res) => {
  try {
    const stat = fs.statSync(path.join(WORKSPACE, 'budget.md'));
    const financeList = { ...FINANCE_LIST, updated: stat.mtime.toISOString().split('T')[0] };
    const files = fs.readdirSync(WORKSPACE).filter(f => f.endsWith('.md') && !HIDDEN_FILES.includes(f) && !f.startsWith('.'));
    const lists = [financeList];
    files.forEach(f => {
      const cfg = LIST_CONFIG[f] || { ...DEFAULT_CONFIG, title: f.replace('.md','') };
      const s = fs.statSync(path.join(WORKSPACE, f));
      lists.push({ id: f.replace('.md',''), filename: f, icon: cfg.icon, title: cfg.title, type: cfg.type, updated: s.mtime.toISOString().split('T')[0] });
    });
    res.json({ lists });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/list/:id', (req, res) => {
  try {
    if (req.params.id === 'finance') {
      const budget = parseBudget(); const debts = parseDebts(); const expenses = parseExpenses();
      const bm = fs.statSync(path.join(WORKSPACE,'budget.md')).mtime.toISOString().split('T')[0];
      return res.json({ type: 'finance', icon: '💰', title: 'Бюджет', updated: bm, data: { budget, debts, expenses } });
    }
    const filename = req.params.id + '.md';
    if (HIDDEN_FILES.includes(filename)) return res.status(403).json({ error: 'Hidden' });
    const filePath = path.join(WORKSPACE, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const cfg = LIST_CONFIG[filename] || { ...DEFAULT_CONFIG, title: req.params.id };
    const text = fs.readFileSync(filePath, 'utf-8');
    const sections = parseGenericMarkdown(text);
    res.json({ type: 'generic', ...cfg, data: { sections } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', (req, res) => res.json({ user: req.telegramUser, allowed: true }));

app.listen(PORT, '0.0.0.0', () => console.log(`Workspace WebApp on http://0.0.0.0:${PORT}`));
