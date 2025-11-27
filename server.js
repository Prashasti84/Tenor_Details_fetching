require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const channelHandler = require('./api/channel');
const gifRanksHandler = require('./api/gif-ranks');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/channel', (req, res) => channelHandler(req, res));
app.get('/api/gif-ranks', (req, res) => gifRanksHandler(req, res));

const frontendDir = path.join(__dirname, 'frontend');
app.use(express.static(frontendDir));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Local dev server running on http://localhost:${PORT}`);
});

