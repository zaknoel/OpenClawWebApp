'use strict';

const fs = require('fs');
const { WORKSPACE_PATH } = require('./config');

// ---------------------------------------------------------------------------
// Low-level table parser
// ---------------------------------------------------------------------------

/**
 * Parses a markdown table starting at `startIdx` in the `lines` array.
 * Returns parsed rows and the index of the first line after the table.
 *
 * @param {string[]} lines
 * @param {number}   startIdx
 * @returns {{ rows: string[][], nextIdx: number }}
 */
function parseTable(lines, startIdx) {
  const rows = [];
  let i = startIdx;

  // Skip blank lines before the table
  while (i < lines.length && lines[i].trim() === '') i++;

  // Skip header row
  if (i < lines.length && lines[i].trim().startsWith('|')) i++;

  // Skip separator row (e.g. | --- | --- |)
  if (i < lines.length && /^\|[\s-|]+\|$/.test(lines[i].trim())) i++;

  // Collect data rows
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2) rows.push(cells);
    i++;
  }

  return { rows, nextIdx: i };
}

// ---------------------------------------------------------------------------
// Finance parsers
// ---------------------------------------------------------------------------

function parseBudget() {
  const text  = fs.readFileSync(WORKSPACE_PATH('budget.md'), 'utf-8');
  const lines = text.split('\n');

  const deposits = [], cards = [], cash = [], transactions = [];
  let totalBalance = null, section = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if      (line.startsWith('## Bank Deposits'))   section = 'deposits';
    else if (line.startsWith('## Cards'))           section = 'cards';
    else if (line.startsWith('## Cash'))            section = 'cash';
    else if (line.includes('TOTAL BALANCE'))        section = 'total';
    else if (line.includes('Transaction Log'))      section = 'transactions';
    else if (line.startsWith('##'))                 section = '';
    else if (line.startsWith('|')) {
      const parsed = parseTable(lines, i);

      if (parsed.rows.length > 0) {
        if (section === 'deposits') {
          parsed.rows.forEach((r) => deposits.push({ bank: r[0], balance: r[1] }));
        } else if (section === 'cards') {
          parsed.rows.forEach((r) => cards.push({ card: r[0], balance: r[1] }));
        } else if (section === 'cash') {
          parsed.rows.forEach((r) => cash.push({ note: r[0], amount: r[1] }));
        } else if (section === 'total') {
          totalBalance = {};
          parsed.rows.forEach((r) => {
            totalBalance[r[0].replace(/\*\*/g, '').trim()] = r[1].replace(/\*\*/g, '').trim();
          });
        } else if (section === 'transactions') {
          parsed.rows.forEach((r) => transactions.push({
            date: r[0], type: r[1], fromTo: r[2],
            description: r[3], amount: r[4], balanceAfter: r[5],
          }));
        }
      }

      i = parsed.nextIdx - 1;
    }
  }

  return { deposits, cards, cash, totalBalance, transactions };
}

function parseDebts() {
  const text  = fs.readFileSync(WORKSPACE_PATH('debts.md'), 'utf-8');
  const lines = text.split('\n');

  const debtors = [];
  let cur = null, totals = null, inTotals = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const isTotalsHeader =
      (line.startsWith('## 💰') && line.includes('ИТОГО')) ||
      line.startsWith('## ИТОГО');

    if (isTotalsHeader) {
      if (cur) debtors.push(cur);
      cur = null;
      inTotals = true;
      totals = [];
      const p = parseTable(lines, i + 1);
      if (p.rows.length > 0) {
        p.rows.forEach((r) => totals.push({ currency: r[0], amount: r[1] }));
      }
      i = p.nextIdx - 1;
      continue;
    }

    if (inTotals) continue;

    if (line.startsWith('## ') && !line.includes('ИТОГО')) {
      if (cur) debtors.push(cur);
      cur = { name: line.replace('## ', ''), entries: [], total: '' };
    }

    if (line.startsWith('**Total:**') && cur) {
      cur.total = line.replace('**Total:**', '').trim();
    }

    if (line.startsWith('|') && cur && !inTotals) {
      const p = parseTable(lines, i);
      if (p.rows.length > 0) {
        const headers = lines[i].split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
        p.rows.forEach((r) => {
          const entry = {};
          headers.forEach((k, idx) => { entry[k] = r[idx] || ''; });
          cur.entries.push(entry);
        });
      }
      i = p.nextIdx - 1;
    }
  }

  if (cur && !inTotals) debtors.push(cur);

  return { debtors, totals };
}

function parseExpenses() {
  const text  = fs.readFileSync(WORKSPACE_PATH('expenses.md'), 'utf-8');
  const lines = text.split('\n');

  const months = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('## ') && line.match(/\d{4}/)) {
      if (cur) months.push(cur);
      cur = { name: line.replace('## ', ''), expenses: [], total: '' };
    }

    if (line.startsWith('**Total:**') && cur) {
      cur.total = line.replace('**Total:**', '').trim();
    }

    if (line.startsWith('|') && cur && !line.match(/^\|[-\s|]+\|$/)) {
      const p = parseTable(lines, i);
      if (p.rows.length > 0) {
        p.rows.forEach((r) => cur.expenses.push({
          date: r[0], category: r[1], description: r[2], amount: r[3],
        }));
      }
      i = p.nextIdx - 1;
    }
  }

  if (cur) months.push(cur);

  return { months };
}

// ---------------------------------------------------------------------------
// Generic markdown parser
// ---------------------------------------------------------------------------

function parseGenericMarkdown(text) {
  const lines    = text.split('\n');
  const sections = [];
  let cur = null;

  function ensureSection(title) {
    if (!cur) {
      cur = { title: title || '', items: [], tables: [] };
      sections.push(cur);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip top-level headings
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) continue;

    // Section heading
    if (trimmed.startsWith('## ')) {
      cur = {
        title: trimmed.replace('## ', '').replace(/[^\w\sа-яА-ЯёЁ0-9()/-]/g, '').trim(),
        items: [],
        tables: [],
      };
      sections.push(cur);
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      ensureSection('');
      const p = parseTable(lines, i);
      if (p.rows.length > 0) {
        const headers = lines[i].trim()
          .split('|').slice(1, -1)
          .map((c) => c.trim().toLowerCase().replace(/[^\wа-яё]/g, ''));
        cur.tables.push({
          headers,
          rows: p.rows.map((r) => {
            const obj = {};
            headers.forEach((k, idx) => { obj[k || `col${idx}`] = r[idx] || ''; });
            return obj;
          }),
        });
      }
      i = p.nextIdx - 1;
      continue;
    }

    // List item
    const listMatch = trimmed.match(/^(\d+[.)]\s*|[-*]\s+)/);
    if (listMatch) {
      ensureSection('');
      const content   = trimmed.replace(listMatch[0], '').trim();
      const isChecked = content.startsWith('[x]') || content.startsWith('[X]');
      const isUnchecked = content.startsWith('[ ]');
      cur.items.push({
        text: content
          .replace(/^\[[ xX]\]\s*/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1'),
        checked:     isChecked,
        hasCheckbox: isChecked || isUnchecked,
        number:      listMatch[1].match(/\d+/) ? parseInt(listMatch[1]) : null,
      });
      continue;
    }

    // Bold line (used as sub-header in some lists)
    if (trimmed.startsWith('**') && trimmed.includes('**')) {
      ensureSection('');
      cur.items.push({ text: trimmed.replace(/\*\*/g, ''), bold: true });
      continue;
    }

    // Plain text
    if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('_Updated')) {
      ensureSection('');
      cur.items.push({ text: trimmed });
    }
  }

  return sections.filter((s) => s.title || s.items.length || s.tables.length);
}

module.exports = { parseTable, parseBudget, parseDebts, parseExpenses, parseGenericMarkdown };
