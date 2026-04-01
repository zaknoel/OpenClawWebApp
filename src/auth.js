'use strict';

const crypto = require('crypto');
const { BOT_TOKEN, ALLOWED_USER_ID } = require('./config');

/**
 * Verifies Telegram WebApp initData using HMAC-SHA256.
 * Returns the parsed user object on success, or null on failure.
 *
 * @param {string} initData
 * @returns {object|null}
 */
function verifyTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    return null;
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash) return null;

  const entries = [];
  for (const [key, value] of params) {
    if (key !== 'hash') entries.push(`${key}=${value}`);
  }
  entries.sort();

  const dataCheckString = entries.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

/**
 * Express middleware that verifies Telegram initData for all /api/* routes.
 */
function authMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();

  const initData = req.headers['x-telegram-init-data'] || req.query.initData;
  const user = verifyTelegramInitData(initData);

  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.id !== ALLOWED_USER_ID) return res.status(403).json({ error: 'Forbidden' });

  req.telegramUser = user;
  next();
}

module.exports = { verifyTelegramInitData, authMiddleware };
