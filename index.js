const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8002;

// Routes
const pairRouter = require('./pair');

app.use('/code', pairRouter);
app.use('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});
app.use('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, () => {
    console.log(`
╔════════════════════════╗
║    SO MINI BOT         ║
║    BY SHANUKA SHAMEEN  ║
╚════════════════════════╝
Server running on http://localhost:${PORT}
    `);
});

module.exports = app;