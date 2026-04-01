/* =========================================================================
   app.js — OpenClaw WebApp  (v2)
   ========================================================================= */
'use strict';

// ---------------------------------------------------------------------------
// Telegram integration
// ---------------------------------------------------------------------------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  lists:   [],
  finTab:  'balance',
  finData: null,
  hidden:  true,
};

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $app = () => document.getElementById('app');
const $nav = () => document.getElementById('fin-nav');

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function api(url) {
  const headers = {};
  const initData = tg?.initData;
  if (initData && initData.length > 10) {
    headers['X-Telegram-Init-Data'] = initData;
  }
  return fetch(url, { headers }).then((r) => {
    if (r.status === 401 || r.status === 403) throw new Error('Открой через Telegram');
    if (!r.ok) throw new Error('Ошибка загрузки');
    return r.json();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
function parse(s) {
  if (!s) return 0;
  return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
}
function M(text) {
  return `<span class="hidden-val${state.hidden ? '' : ' show'}">${text}</span>`;
}

function toggleHidden() {
  state.hidden = !state.hidden;
  document.querySelectorAll('.hidden-val').forEach((el) => el.classList.toggle('show', !state.hidden));
  document.querySelectorAll('.eye-btn').forEach((el) => el.textContent = state.hidden ? '👁️' : '🙈');
}

// ---------------------------------------------------------------------------
// Finance bottom navbar
// ---------------------------------------------------------------------------
const FIN_TABS = [
  { id: 'balance',  icon: '💰', label: 'Баланс' },
  { id: 'debts',    icon: '💸', label: 'Долги' },
  { id: 'expenses', icon: '📊', label: 'Расходы' },
];

function showFinNav() {
  if ($nav()) return; // already mounted
  $app().classList.add('has-fin-nav');

  const nav = document.createElement('nav');
  nav.id = 'fin-nav';
  nav.className = 'fin-nav';
  nav.innerHTML = FIN_TABS.map((t) => `
    <button
      class="fin-nav-item${state.finTab === t.id ? ' on' : ''}"
      id="fn-${t.id}"
      onclick="switchFinTab('${t.id}')"
    >
      <span class="fin-nav-icon">${t.icon}</span>
      <span class="fin-nav-label">${t.label}</span>
    </button>
  `).join('');
  document.body.appendChild(nav);
}

function hideFinNav() {
  const nav = $nav();
  if (nav) nav.remove();
  $app().classList.remove('has-fin-nav');
}

function syncFinNav() {
  FIN_TABS.forEach((t) => {
    const btn = document.getElementById(`fn-${t.id}`);
    if (btn) btn.classList.toggle('on', state.finTab === t.id);
  });
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function renderLoading() {
  return '<div class="loading"><div class="spin"></div>Загрузка...</div>';
}
function renderError(msg) {
  return `<div class="err">⚠️ ${msg}</div>`;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function renderOverview() {
  let grid = state.lists.map((list) => `
    <div class="ov" onclick="router.go('${list.id}')">
      <div class="ov-icon">${list.icon}</div>
      <div class="ov-title">${list.title}</div>
      <div class="ov-sub">${list.updated}</div>
    </div>
  `).join('');

  return `
    <div class="page">
      <div class="ov-header">
        <div class="ov-header-title">📋 Мои Листы</div>
        <div class="ov-header-sub">Личное рабочее пространство</div>
      </div>
      <div class="ov-grid">${grid}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Finance — balance tab
// ---------------------------------------------------------------------------
const PROGRESS_COLORS = ['g', 'a', 'p'];

function renderBalance(budget) {
  const gt = budget.totalBalance?.['GRAND TOTAL'] || '0';
  let deposits = 0, cards = 0, cash = 0;
  budget.deposits?.forEach((x) => { deposits += parse(x.balance); });
  budget.cards?.forEach((x)    => { cards    += parse(x.balance); });
  budget.cash?.forEach((x)     => { cash     += parse(x.amount); });

  let html = `
    <div class="summary" style="position:relative">
      <button class="eye-btn" onclick="toggleHidden()">${state.hidden ? '👁️' : '🙈'}</button>
      <div class="label">Общий баланс</div>
      <div class="big green">${M(gt)}</div>
    </div>
    <div class="stats-row">
      <div class="stat"><div class="icon">🏦</div><div class="lbl">Вклады</div><div class="val g">${M(fmt(deposits))}</div></div>
      <div class="stat"><div class="icon">💳</div><div class="lbl">Карты</div><div class="val a">${M(fmt(cards))}</div></div>
      <div class="stat"><div class="icon">💵</div><div class="lbl">Наличные</div><div class="val y">${M(fmt(cash))}</div></div>
    </div>
  `;

  // Deposits
  html += `<div class="card"><div class="card-head"><span class="card-title">🏦 Вклады</span><span class="card-val">${M(fmt(deposits) + ' сум')}</span></div>`;
  budget.deposits?.forEach((x, i) => {
    const pct = deposits > 0 ? ((parse(x.balance) / deposits) * 100).toFixed(0) : 0;
    html += `<div class="row"><span class="row-l">${x.bank}</span><span class="row-v">${M(x.balance)}</span></div><div class="bar"><div class="bar-fill ${PROGRESS_COLORS[i % 3]}" style="width:${pct}%"></div></div>`;
  });
  html += '</div>';

  // Cards
  html += `<div class="card"><div class="card-head"><span class="card-title">💳 Карты</span><span class="card-val">${M(fmt(cards) + ' сум')}</span></div>`;
  budget.cards?.forEach((c) => {
    html += `<div class="row"><span class="row-l">${c.card}</span><span class="row-v">${M(c.balance)}</span></div>`;
  });
  html += '</div>';

  // Cash
  html += `<div class="card"><div class="card-head"><span class="card-title">💵 Наличные</span><span class="card-val">${M(fmt(cash) + ' сум')}</span></div>`;
  budget.cash?.forEach((c) => {
    html += `<div class="row"><span class="row-l">${c.note}</span><span class="row-v">${M(c.amount)}</span></div>`;
  });
  html += '</div>';

  // Transactions
  if (budget.transactions?.length > 0) {
    html += `<div class="card"><div class="card-head"><span class="card-title">📋 Операции</span></div>`;
    budget.transactions.forEach((tx) => {
      const pos = tx.amount.includes('+');
      html += `<div class="tx"><span class="tx-d">${tx.date}</span><span class="tx-t">${tx.description}</span><span class="tx-a${pos ? ' pos' : ''}">${M(tx.amount)}</span></div>`;
    });
    html += '</div>';
  }

  return html;
}

// ---------------------------------------------------------------------------
// Finance — debts tab
// ---------------------------------------------------------------------------
function renderDebts(debts) {
  let sumUzs = 0, sumUsd = 0;
  debts.totals?.forEach((t) => {
    if (t.currency.includes('сум')) sumUzs = parse(t.amount);
    if (t.currency.includes('USD')) sumUsd = parse(t.amount);
  });

  let html = `
    <div class="stats-row" style="grid-template-columns:1fr 1fr">
      <div class="stat"><div class="lbl">Сум</div><div class="val g">${M(fmt(sumUzs) + ' сум')}</div></div>
      <div class="stat"><div class="lbl">USD</div><div class="val y">${M('$' + fmt(sumUsd))}</div></div>
    </div>
  `;

  debts.debtors?.forEach((debtor) => {
    const isUsd = debtor.total.includes('$');
    html += `<div class="card"><div class="debtor-head"><span class="debtor-name">${debtor.name}</span><span class="tag ${isUsd ? 'tag-y' : 'tag-g'}">${M(debtor.total)}</span></div>`;
    debtor.entries.forEach((entry) => {
      const paid = entry.returned === '✅' || entry.received === '✅';
      html += `
        <div class="d-entry">
          <div>
            <span class="d-amt">${M(entry.amount || '')}</span>
            <div class="d-meta">
              ${entry.date ? `<span class="d-date">${entry.date}</span>` : ''}
              ${entry.note ? `<span class="d-note">${entry.note}</span>` : ''}
            </div>
          </div>
          <span style="font-size:16px">${paid ? '✅' : '⏳'}</span>
        </div>
      `;
    });
    html += '</div>';
  });

  return html;
}

// ---------------------------------------------------------------------------
// Finance — expenses tab
// ---------------------------------------------------------------------------
function renderExpenses(expensesData) {
  let totalAll = 0;
  expensesData.months?.forEach((m) => { totalAll += parse(m.total); });

  let html = `<div class="summary"><div class="label">Всего расходов</div><div class="big red">${M(fmt(totalAll) + ' сум')}</div></div>`;

  expensesData.months?.forEach((month) => {
    html += `<div class="month"><div class="month-h"><span>${month.name}</span><span class="month-t">${M(month.total)}</span></div>`;

    const byCategory = {};
    month.expenses.forEach((e) => {
      if (!byCategory[e.category]) byCategory[e.category] = [];
      byCategory[e.category].push(e);
    });

    Object.entries(byCategory).forEach(([cat, items]) => {
      let catTotal = 0;
      items.forEach((i) => { catTotal += parse(i.amount); });

      const cc = cat.includes('Семья') ? 'c-fam'
        : cat.includes('ЖКХ') ? 'c-util'
        : cat.includes('Еда') ? 'c-food'
        : 'c-other';

      html += `<div class="card"><div class="card-head"><span class="card-title"><span class="e-cat ${cc}">${cat}</span></span><span class="e-amt" style="font-size:12px">${M(fmt(catTotal) + ' сум')}</span></div>`;
      items.forEach((item) => {
        html += `<div class="e-row"><div class="e-info"><div class="e-desc">${item.description}</div><div class="e-date">${item.date}</div></div><div class="e-amt">${M(item.amount)}</div></div>`;
      });
      html += '</div>';
    });

    html += '</div>';
  });

  return html;
}

// ---------------------------------------------------------------------------
// Finance — container (no top tabs; nav is the bottom bar)
// ---------------------------------------------------------------------------
function renderFinanceContent(data) {
  let body = '';
  if      (state.finTab === 'balance')  body = renderBalance(data.data.budget);
  else if (state.finTab === 'debts')    body = renderDebts(data.data.debts);
  else                                  body = renderExpenses(data.data.expenses);

  return `
    <div class="page">
      <div class="page-header">
        <button class="back-btn" onclick="router.go('overview')">←</button>
        <div class="page-title">${data.icon} ${data.title}</div>
      </div>
      ${body}
    </div>
  `;
}

function switchFinTab(tab) {
  state.finTab = tab;
  syncFinNav();
  if (state.finData) {
    $app().innerHTML = renderFinanceContent(state.finData);
    window.scrollTo(0, 0);
  }
}

// ---------------------------------------------------------------------------
// Generic list
// ---------------------------------------------------------------------------
function renderGeneric(data) {
  let html = `
    <div class="page">
      <div class="page-header">
        <button class="back-btn" onclick="router.go('overview')">←</button>
        <div class="page-title">${data.icon} ${data.title}</div>
      </div>
  `;

  const sections = data.data?.sections;
  if (!sections || sections.length === 0) {
    return html + `<div class="empty"><div class="empty-i">${data.icon}</div>Пусто — добавь что-нибудь!</div></div>`;
  }

  sections.forEach((sec) => {
    html += '<div class="gs">';
    if (sec.title) html += `<div class="gs-t">${sec.title}</div>`;

    sec.tables?.forEach((t) => {
      html += `<div class="card"><table class="gtbl"><thead><tr>${t.headers.map((th) => `<th>${th}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${t.headers.map((th) => `<td>${r[th] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    });

    sec.items?.forEach((item) => {
      if (item.bold) {
        html += `<div class="gi-b">${item.text}</div>`;
      } else if (item.hasCheckbox) {
        html += `<div class="gi-c"><div class="chk${item.checked ? ' on' : ''}" onclick="this.classList.toggle('on')"></div><span>${item.text}</span></div>`;
      } else {
        html += `<div class="gi"><span class="gi-i">${item.number ? item.number + '.' : '•'}</span><span>${item.text}</span></div>`;
      }
    });

    html += '</div>';
  });

  return html + '</div>';
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function mount(html) {
  $app().innerHTML = html;
  window.scrollTo(0, 0);
}

const router = {
  go(id) {
    if (id === 'overview') {
      hideFinNav();
      mount(renderOverview());
      return;
    }

    mount(renderLoading());

    api('/api/list/' + id)
      .then((data) => {
        if (data.type === 'finance') {
          state.finData = data;
          state.finTab  = 'balance';
          mount(renderFinanceContent(data));
          showFinNav();
        } else {
          hideFinNav();
          mount(renderGeneric(data));
        }
      })
      .catch((err) => {
        hideFinNav();
        mount(renderError(err.message));
      });
  },
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
api('/api/lists')
  .then((data) => {
    state.lists = data.lists;
    router.go('overview');
  })
  .catch((err) => mount(renderError(err.message)));
