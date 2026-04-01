'use strict';

require('dotenv').config();

const path = require('path');

const PORT            = parseInt(process.env.PORT, 10) || 8080;
const WORKSPACE       = process.env.WORKSPACE || '/root/.openclaw/workspace';
const BOT_TOKEN       = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = parseInt(process.env.ALLOWED_USER_ID, 10);

if (!BOT_TOKEN)       throw new Error('BOT_TOKEN is not set in .env');
if (!ALLOWED_USER_ID) throw new Error('ALLOWED_USER_ID is not set in .env');

const HIDDEN_FILES = [
  'AGENTS.md', 'HEARTBEAT.md', 'IDENTITY.md', 'SOUL.md',
  'TOOLS.md',  'USER.md',      'MEMORY.md',   'budget.md',
  'debts.md',  'expenses.md',
];

const FINANCE_LIST = {
  id: 'finance', icon: '💰', title: 'Бюджет', type: 'finance', updated: '',
};

const LIST_CONFIG = {
  'tasks.md':     { icon: '✅', title: 'Задачи',   type: 'generic' },
  'watchlist.md': { icon: '🎬', title: 'Watchlist', type: 'generic' },
};

const DEFAULT_CONFIG = { icon: '📄', title: '', type: 'generic' };

const WORKSPACE_PATH = (filename) => path.join(WORKSPACE, filename);

module.exports = {
  PORT,
  WORKSPACE,
  BOT_TOKEN,
  ALLOWED_USER_ID,
  HIDDEN_FILES,
  FINANCE_LIST,
  LIST_CONFIG,
  DEFAULT_CONFIG,
  WORKSPACE_PATH,
};
