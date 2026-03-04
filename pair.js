const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const { MongoClient } = require('mongodb');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const config = require('./config');

// MongoDB setup
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Dileepa:dileepa321@cluster0.mrhh2p0.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'SO_MINI_BOT';

let mongoClient, mongoDB;
let sessionsCol, numbersCol;

async function initMongo() {
    try {
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        mongoDB = mongoClient.db(MONGO_DB);
        sessionsCol = mongoDB.collection('sessions');
        numbersCol = mongoDB.collection('numbers');
        console.log('✅ MongoDB Connected');
    } catch (e) {
        console.error('MongoDB Error:', e);
    }
}

// Utils
function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getTime() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

const activeSockets = new Map();

// Status Handler
function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg?.key || msg.key.remoteJid !== 'status@broadcast') return;

        try {
            // Auto View
            if (config.AUTO_VIEW_STATUS === 'true') {
                await socket.readMessages([msg.key]);
            }

            // Auto React
            if (config.AUTO_LIKE_STATUS === 'true') {
                const emoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                await socket.sendMessage(msg.key.remoteJid, {
                    react: { text: emoji, key: msg.key }
                });
            }

            // Auto Reply
            if (config.AUTO_REPLY_STATUS === 'true') {
                const replies = ['🌹', '💜', '👀', '😻', '🎉'];
                const reply = replies[Math.floor(Math.random() * replies.length)];
                await socket.sendMessage(msg.key.remoteJid, { text: reply });
            }
        } catch (e) {
            console.error('Status handler error:', e);
        }
    });
}

// Call Handler
function setupCallHandler(socket) {
    socket.ev.on('call', async (calls) => {
        if (config.AUTO_CALL_CUT !== 'true') return;

        for (const call of calls) {
            if (call.status === 'offer') {
                await socket.rejectCall(call.id, call.from);
                console.log(`📞 Call rejected from ${call.from}`);
            }
        }
    });
}

// Presence Handler
function setupPresenceHandler(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        if (config.AUTO_TYPING === 'true') {
            await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
            setTimeout(() => {
                socket.sendPresenceUpdate('paused', msg.key.remoteJid).catch(() => {});
            }, 2000);
        }

        if (config.AUTO_RECORDING === 'true') {
            await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            setTimeout(() => {
                socket.sendPresenceUpdate('paused', msg.key.remoteJid).catch(() => {});
            }, 2000);
        }
    });
}

// Command Handler
function setupCommandHandler(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const body = type === 'conversation' ? msg.message.conversation :
                    type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';

        if (!body || !body.startsWith(config.PREFIX)) return;

        const command = body.slice(config.PREFIX.length).trim().split(' ')[0].toLowerCase();
        const args = body.trim().split(/ +/).slice(1);

        try {
            switch (command) {
                case 'owner':
                    const vcard = 
                        'BEGIN:VCARD\n' +
                        'VERSION:3.0\n' +
                        `FN:${config.OWNER_NAME}\n` +
                        `TEL;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\n` +
                        'END:VCARD';

                    await socket.sendMessage(from, {
                        contacts: {
                            displayName: config.OWNER_NAME,
                            contacts: [{ vcard }]
                        }
                    }, { quoted: msg });
                    break;

                case 'ping':
                    const start = Date.now();
                    await socket.sendMessage(from, { text: '⚡ Pinging...' });
                    const end = Date.now();
                    await socket.sendMessage(from, { 
                        text: `📊 *Response:* ${end - start}ms\n🕒 *Time:* ${getTime()}`
                    });
                    break;

                case 'alive':
                    await socket.sendMessage(from, {
                        image: { url: config.IMAGE_PATH },
                        caption: `🤖 *${config.BOT_NAME}*\n\n` +
                                `👑 *Owner:* ${config.OWNER_NAME}\n` +
                                `📞 *Number:* ${config.OWNER_NUMBER}\n` +
                                `✅ *Status:* Online\n` +
                                `🔗 *Channel:* ${config.CHANNEL_LINK}`
                    }, { quoted: msg });
                    break;

                case 'menu':
                    await socket.sendMessage(from, {
                        image: { url: config.IMAGE_PATH },
                        caption: `📋 *${config.BOT_NAME} COMMANDS*\n\n` +
                                `👑 *${config.PREFIX}owner* - Owner Contact\n` +
                                `⚡ *${config.PREFIX}ping* - Bot Speed\n` +
                                `🤖 *${config.PREFIX}alive* - Bot Status\n` +
                                `⚙️ *${config.PREFIX}settings* - Bot Settings\n\n` +
                                `${config.BOT_FOOTER}`
                    }, { quoted: msg });
                    break;

                case 'settings':
                case 'st':
                    await socket.sendMessage(from, {
                        text: `⚙️ *SO MINI SETTINGS*\n\n` +
                              `👁️ Status Seen: ${config.AUTO_VIEW_STATUS}\n` +
                              `❤️ Status React: ${config.AUTO_LIKE_STATUS}\n` +
                              `💬 Status Reply: ${config.AUTO_REPLY_STATUS}\n` +
                              `📞 Call Cut: ${config.AUTO_CALL_CUT}\n` +
                              `🎤 Recording: ${config.AUTO_RECORDING}\n` +
                              `⌨️ Typing: ${config.AUTO_TYPING}`
                    }, { quoted: msg });
                    break;

                default:
                    // Unknown command - ignore
                    break;
            }
        } catch (e) {
            console.error('Command error:', e);
        }
    });
}

// Connection Handler
function setupConnectionHandler(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log(`Connection closed for ${number}, reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                await delay(5000);
                startPairing(number);
            } else {
                // Logged out - cleanup
                activeSockets.delete(number);
                await fs.remove(path.join(os.tmpdir(), `session_${number}`));
            }
        } else if (connection === 'open') {
            console.log(`✅ ${number} connected!`);
            const jid = jidNormalizedUser(socket.user.id);

            await socket.sendMessage(jid, {
                image: { url: config.IMAGE_PATH },
                caption: `✅ *${config.BOT_NAME} Connected!*\n\n👑 ${config.OWNER_NAME}\n🕒 ${getTime()}`
            });

            // Save to MongoDB
            if (numbersCol) {
                await numbersCol.updateOne(
                    { number },
                    { $set: { number, lastSeen: new Date() } },
                    { upsert: true }
                );
            }
        }
    });
}

// Main Pairing Function
async function startPairing(number, res = null) {
    const sanitized = number.replace(/[^0-9]/g, '');
    const sessionDir = path.join(os.tmpdir(), `session_${sanitized}`);

    await initMongo();

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const logger = pino({ level: 'fatal' });

    const socket = makeWASocket({
        auth: state,
        logger,
        browser: ['SO MINI', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
    });

    // Setup handlers
    setupStatusHandlers(socket);
    setupCallHandler(socket);
    setupPresenceHandler(socket);
    setupCommandHandler(socket, sanitized);
    setupConnectionHandler(socket, sanitized);

    // Creds update
    socket.ev.on('creds.update', saveCreds);

    // Pairing code
    if (!socket.authState.creds.registered) {
        try {
            const code = await socket.requestPairingCode(sanitized);
            console.log(`📱 Pairing code for ${sanitized}: ${code}`);

            if (res && !res.headersSent) {
                res.json({ code });
            }

            // Save initial creds
            setTimeout(() => {
                saveCreds().catch(() => {});
            }, 5000);
        } catch (e) {
            console.error('Pairing error:', e);
            if (res && !res.headersSent) {
                res.status(500).json({ error: 'Failed to generate code' });
            }
        }
    } else {
        if (res && !res.headersSent) {
            res.json({ message: 'Already registered' });
        }
    }

    activeSockets.set(sanitized, socket);
    return socket;
}

// Routes
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).json({ error: 'Number required' });
    }

    const sanitized = number.replace(/[^0-9]/g, '');
    if (activeSockets.has(sanitized)) {
        return res.json({ message: 'Already connected' });
    }

    await startPairing(sanitized, res);
});

router.get('/active', (req, res) => {
    res.json({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.post('/api/session/delete', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Number required' });

    const sanitized = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitized);

    if (socket) {
        try {
            await socket.logout();
        } catch (e) { }
        activeSockets.delete(sanitized);
    }

    await fs.remove(path.join(os.tmpdir(), `session_${sanitized}`));

    if (sessionsCol) {
        await sessionsCol.deleteOne({ number: sanitized });
    }

    res.json({ success: true });
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, num) => {
        try { socket.ws?.close(); } catch (e) { }
    });
});

initMongo().catch(console.error);

module.exports = router;