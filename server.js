'use strict';

const express = require('express');
const path    = require('path');

const { PORT }           = require('./src/config');
const { authMiddleware } = require('./src/auth');
const apiRouter          = require('./src/routes');

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Workspace WebApp running on http://0.0.0.0:${PORT}`);
});
