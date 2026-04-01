'use strict';

const fs     = require('fs');
const router = require('express').Router();

const {
  WORKSPACE_PATH,
  HIDDEN_FILES,
  FINANCE_LIST,
  LIST_CONFIG,
  DEFAULT_CONFIG,
} = require('./config');

const {
  parseBudget,
  parseDebts,
  parseExpenses,
  parseGenericMarkdown,
} = require('./parsers');

// ---------------------------------------------------------------------------
// GET /api/lists
// Returns a list of all visible markdown files in the workspace.
// ---------------------------------------------------------------------------
router.get('/lists', (req, res) => {
  try {
    const stat       = fs.statSync(WORKSPACE_PATH('budget.md'));
    const financeList = {
      ...FINANCE_LIST,
      updated: stat.mtime.toISOString().split('T')[0],
    };

    const files = fs.readdirSync(WORKSPACE_PATH(''))
      .filter((f) => f.endsWith('.md') && !HIDDEN_FILES.includes(f) && !f.startsWith('.'));

    const lists = [financeList];

    files.forEach((filename) => {
      const cfg    = LIST_CONFIG[filename] || { ...DEFAULT_CONFIG, title: filename.replace('.md', '') };
      const fstat  = fs.statSync(WORKSPACE_PATH(filename));
      lists.push({
        id:       filename.replace('.md', ''),
        filename,
        icon:     cfg.icon,
        title:    cfg.title,
        type:     cfg.type,
        updated:  fstat.mtime.toISOString().split('T')[0],
      });
    });

    res.json({ lists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/list/:id
// Returns the parsed content for a single list.
// ---------------------------------------------------------------------------
router.get('/list/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Finance is a virtual combined list
    if (id === 'finance') {
      const budget   = parseBudget();
      const debts    = parseDebts();
      const expenses = parseExpenses();
      const updated  = fs.statSync(WORKSPACE_PATH('budget.md')).mtime.toISOString().split('T')[0];

      return res.json({
        type: 'finance', icon: '💰', title: 'Бюджет', updated,
        data: { budget, debts, expenses },
      });
    }

    const filename = `${id}.md`;

    if (HIDDEN_FILES.includes(filename)) {
      return res.status(403).json({ error: 'Hidden' });
    }

    const filePath = WORKSPACE_PATH(filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const cfg      = LIST_CONFIG[filename] || { ...DEFAULT_CONFIG, title: id };
    const text     = fs.readFileSync(filePath, 'utf-8');
    const sections = parseGenericMarkdown(text);

    res.json({ type: 'generic', ...cfg, data: { sections } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/me
// Returns the authenticated Telegram user.
// ---------------------------------------------------------------------------
router.get('/me', (req, res) => {
  res.json({ user: req.telegramUser, allowed: true });
});

module.exports = router;
