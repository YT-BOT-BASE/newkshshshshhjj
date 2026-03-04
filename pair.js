const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const axios = require('axios');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

const config = require('./config');

// ---------------- MONGO SETUP ----------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Dileepa:dileepa321@cluster0.mrhh2p0.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'SO_MINI_BOT';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, configsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  configsCol = mongoDB.collection('configs');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized');
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// ---------------- basic utils ----------------
function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function getSriLankaTimestamp() {
  return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

const activeSockets = new Map();
const socketCreationTime = new Map();

// ---------------- STATUS HANDLERS ----------------
async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
      
      // Auto View Status
      if (userConfig.AUTO_VIEW_STATUS !== 'false' && config.AUTO_VIEW_STATUS === 'true') {
        try { 
          await socket.readMessages([message.key]); 
          console.log(`✅ Status viewed: ${message.key.id}`);
        } catch (error) { 
          console.error('Failed to view status:', error);
        }
      }
      
      // Auto React Status
      if (userConfig.AUTO_LIKE_STATUS !== 'false' && config.AUTO_LIKE_STATUS === 'true') {
        const userEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        
        try {
          await socket.sendMessage(message.key.remoteJid, { 
            react: { text: randomEmoji, key: message.key } 
          }, { statusJidList: [message.key.participant] });
          console.log(`✅ Status reacted: ${randomEmoji}`);
        } catch (error) { 
          console.error('Failed to react to status:', error);
        }
      }
      
      // Auto Reply Status
      if (userConfig.AUTO_REPLY_STATUS !== 'false' && config.AUTO_REPLY_STATUS === 'true') {
        try {
          const replyMessages = [
            "🌹🌹🌹",
            "👀👀👀",
            "💜💜💜",
            "😻😻😻",
            "🎉🎉🎉",
            "💫💫💫"
          ];
          const randomReply = replyMessages[Math.floor(Math.random() * replyMessages.length)];
          
          await socket.sendMessage(message.key.remoteJid, {
            text: randomReply
          }, { quoted: message });
          console.log(`✅ Status auto replied: ${randomReply}`);
        } catch (error) {
          console.error('Failed to reply to status:', error);
        }
      }
      
    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}

// ---------------- CALL CUT HANDLER ----------------
async function setupCallRejection(socket, sessionNumber) {
  socket.ev.on('call', async (calls) => {
    try {
      const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
      if (userConfig.AUTO_CALL_CUT === 'false' && config.AUTO_CALL_CUT !== 'true') return;

      console.log(`📞 Incoming call detected for ${sessionNumber} - Auto rejecting...`);

      for (const call of calls) {
        if (call.status !== 'offer') continue;

        const id = call.id;
        const from = call.from;

        await socket.rejectCall(id, from);
        
        await socket.sendMessage(from, {
          text: `*🔕 ${config.BOT_NAME}*\nAuto call rejection is enabled. Calls are automatically rejected.`
        });
        
        console.log(`✅ Auto-rejected call from ${from}`);

        const userJid = jidNormalizedUser(socket.user.id);
        const rejectionMessage = formatMessage(
          '📞 CALL REJECTED',
          `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
          config.BOT_NAME
        );

        await socket.sendMessage(userJid, { 
          image: { url: config.IMAGE_PATH }, 
          caption: rejectionMessage 
        });
      }
    } catch (err) {
      console.error(`Call rejection error for ${sessionNumber}:`, err);
    }
  });
}

// ---------------- MESSAGE HANDLERS (Fake Typing & Recording) ----------------
function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
    
    try {
      const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
      
      // Auto Typing
      if (userConfig.AUTO_TYPING === 'true' || config.AUTO_TYPING === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          setTimeout(async () => {
            try { await socket.sendPresenceUpdate('paused', msg.key.remoteJid); } catch (e) {}
          }, 3000);
        } catch (e) { console.error('Auto typing error:', e); }
      }
      
      // Auto Recording
      if (userConfig.AUTO_RECORDING === 'true' || config.AUTO_RECORDING === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          setTimeout(async () => {
            try { await socket.sendPresenceUpdate('paused', msg.key.remoteJid); } catch (e) {}
          }, 3000);
        } catch (e) { console.error('Auto recording error:', e); }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}

// ---------------- COMMAND HANDLERS ----------------
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : config.OWNER_NUMBER.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : '';

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    if (!command) return;

    try {
      const userConfig = await loadUserConfigFromMongo(number) || {};

      switch (command) {
        // ========== OWNER CONTACT ==========
        case 'owner':
          let vcard = 
            'BEGIN:VCARD\n' +
            'VERSION:3.0\n' +
            `FN:${config.OWNER_NAME}\n` +
            `ORG:SO MINI Bot Owner;\n` +
            `TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\n` +
            'END:VCARD';

          await socket.sendMessage(
            from,
            {
              contacts: {
                displayName: config.OWNER_NAME,
                contacts: [{ vcard }]
              }
            },
            { quoted: msg }
          );
          break;

        // ========== PING ==========
        case 'ping':
          const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());
          const text = `⚡ *PONG!*\n\n📊 *Response Speed:* ${latency}ms\n🕒 *Time:* ${getSriLankaTimestamp()}`;
          await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH }, 
            caption: text 
          }, { quoted: msg });
          break;

        // ========== ALIVE ==========
        case 'alive':
          const startTime = socketCreationTime.get(number) || Date.now();
          const uptime = Math.floor((Date.now() - startTime) / 1000);
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);
          const seconds = Math.floor(uptime % 60);

          const aliveText = `🤖 *${config.BOT_NAME}*\n\n` +
            `👑 *Owner:* ${config.OWNER_NAME}\n` +
            `📞 *Number:* ${config.OWNER_NUMBER}\n` +
            `⏳ *Uptime:* ${hours}h ${minutes}m ${seconds}s\n` +
            `🔗 *Channel:* ${config.CHANNEL_LINK}\n` +
            `👥 *Group:* ${config.GROUP_INVITE_LINK}\n\n` +
            `✅ *Bot is online and active!*`;

          await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH }, 
            caption: aliveText 
          }, { quoted: msg });
          break;

        // ========== MENU ==========
        case 'menu':
          const menuText = `📋 *${config.BOT_NAME} COMMANDS*\n\n` +
            `╭───────────────\n` +
            `│ 👑 *OWNER*\n` +
            `│    ${prefix}owner\n` +
            `│\n` +
            `│ ⚡ *PING*\n` +
            `│    ${prefix}ping\n` +
            `│\n` +
            `│ 🤖 *ALIVE*\n` +
            `│    ${prefix}alive\n` +
            `│\n` +
            `│ ⚙️ *SETTINGS*\n` +
            `│    ${prefix}settings\n` +
            `│    ${prefix}set [option] [value]\n` +
            `│    ${prefix}showconfig\n` +
            `│\n` +
            `╰───────────────\n\n` +
            `> *${config.BOT_FOOTER}*`;

          await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH }, 
            caption: menuText 
          }, { quoted: msg });
          break;

        // ========== SETTINGS ==========
        case 'settings':
        case 'st':
          const currentConfig = await loadUserConfigFromMongo(number) || {};
          
          const statusEmoji = (val) => val === 'true' || val === 'on' ? '✅' : '❌';
          
          const settingsText = `⚙️ *${config.BOT_NAME} SETTINGS*\n\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `👁️ *Auto Status Seen:* ${statusEmoji(currentConfig.AUTO_VIEW_STATUS !== 'false' && config.AUTO_VIEW_STATUS)}\n` +
            `❤️ *Auto Status React:* ${statusEmoji(currentConfig.AUTO_LIKE_STATUS !== 'false' && config.AUTO_LIKE_STATUS)}\n` +
            `💬 *Auto Status Reply:* ${statusEmoji(currentConfig.AUTO_REPLY_STATUS !== 'false' && config.AUTO_REPLY_STATUS)}\n` +
            `📞 *Auto Call Cut:* ${statusEmoji(currentConfig.AUTO_CALL_CUT !== 'false' && config.AUTO_CALL_CUT)}\n` +
            `🎤 *Fake Recording:* ${statusEmoji(currentConfig.AUTO_RECORDING === 'true' || config.AUTO_RECORDING)}\n` +
            `⌨️ *Fake Typing:* ${statusEmoji(currentConfig.AUTO_TYPING === 'true' || config.AUTO_TYPING)}\n` +
            `━━━━━━━━━━━━━━━━\n\n` +
            `📝 *Commands:*\n` +
            `${prefix}set statusseen on/off\n` +
            `${prefix}set statusreact on/off\n` +
            `${prefix}set statusreply on/off\n` +
            `${prefix}set callcut on/off\n` +
            `${prefix}set recording on/off\n` +
            `${prefix}set typing on/off\n` +
            `${prefix}set emoji [emoji1] [emoji2] ...\n\n` +
            `> *${config.BOT_FOOTER}*`;

          await socket.sendMessage(from, { 
            image: { url: config.IMAGE_PATH }, 
            caption: settingsText 
          }, { quoted: msg });
          break;

        // ========== SET COMMAND ==========
        case 'set':
          if (args.length < 2) {
            return await socket.sendMessage(from, { 
              text: '❌ Usage: .set [option] [value]\nExample: .set statusseen on' 
            }, { quoted: msg });
          }

          const option = args[0].toLowerCase();
          const value = args[1].toLowerCase();
          
          if (!['on', 'off'].includes(value) && option !== 'emoji') {
            return await socket.sendMessage(from, { 
              text: '❌ Value must be "on" or "off"' 
            }, { quoted: msg });
          }

          const userCfg = await loadUserConfigFromMongo(number) || {};
          const boolValue = value === 'on' ? 'true' : 'false';

          switch (option) {
            case 'statusseen':
              userCfg.AUTO_VIEW_STATUS = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Auto Status Seen: ${value}` }, { quoted: msg });
              break;
            case 'statusreact':
              userCfg.AUTO_LIKE_STATUS = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Auto Status React: ${value}` }, { quoted: msg });
              break;
            case 'statusreply':
              userCfg.AUTO_REPLY_STATUS = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Auto Status Reply: ${value}` }, { quoted: msg });
              break;
            case 'callcut':
              userCfg.AUTO_CALL_CUT = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Auto Call Cut: ${value}` }, { quoted: msg });
              break;
            case 'recording':
              userCfg.AUTO_RECORDING = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Fake Recording: ${value}` }, { quoted: msg });
              break;
            case 'typing':
              userCfg.AUTO_TYPING = boolValue;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Fake Typing: ${value}` }, { quoted: msg });
              break;
            case 'emoji':
              const newEmojis = args.slice(1);
              if (newEmojis.length === 0) {
                return await socket.sendMessage(from, { text: '❌ Please provide emojis' }, { quoted: msg });
              }
              userCfg.AUTO_LIKE_EMOJI = newEmojis;
              await setUserConfigInMongo(number, userCfg);
              await socket.sendMessage(from, { text: `✅ Status React Emojis updated: ${newEmojis.join(' ')}` }, { quoted: msg });
              break;
            default:
              await socket.sendMessage(from, { text: '❌ Invalid option' }, { quoted: msg });
          }
          break;

        // ========== SHOW CONFIG ==========
        case 'showconfig':
          const cfg = await loadUserConfigFromMongo(number) || {};
          let configText = `📝 *Current Configuration*\n\n`;
          
          configText += `👁️ Auto Status Seen: ${cfg.AUTO_VIEW_STATUS !== 'false' ? 'ON' : 'OFF'}\n`;
          configText += `❤️ Auto Status React: ${cfg.AUTO_LIKE_STATUS !== 'false' ? 'ON' : 'OFF'}\n`;
          configText += `💬 Auto Status Reply: ${cfg.AUTO_REPLY_STATUS !== 'false' ? 'ON' : 'OFF'}\n`;
          configText += `📞 Auto Call Cut: ${cfg.AUTO_CALL_CUT !== 'false' ? 'ON' : 'OFF'}\n`;
          configText += `🎤 Fake Recording: ${cfg.AUTO_RECORDING === 'true' ? 'ON' : 'OFF'}\n`;
          configText += `⌨️ Fake Typing: ${cfg.AUTO_TYPING === 'true' ? 'ON' : 'OFF'}\n`;
          
          if (cfg.AUTO_LIKE_EMOJI) {
            configText += `\n🎭 *Status Emojis:*\n${cfg.AUTO_LIKE_EMOJI.join(' ')}\n`;
          }
          
          configText += `\n> *${config.BOT_FOOTER}*`;

          await socket.sendMessage(from, { text: configText }, { quoted: msg });
          break;

        // ========== DEFAULT ==========
        default:
          // Unknown command - ignore
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
    }
  });
}

// ---------------- AUTO RESTART ----------------
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'));

      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { 
          const sessionPath = path.join(os.tmpdir(), `session_${number.replace(/[^0-9]/g, '')}`);
          if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
          activeSockets.delete(number.replace(/[^0-9]/g, ''));
          socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
          await removeSessionFromMongo(number);
          await removeNumberFromMongo(number);
        } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number}. Attempt reconnect...`);
        await delay(10000);
        const mockRes = { headersSent:false, send:() => {}, status: () => mockRes };
        await EmpirePair(number, mockRes);
      }
    }
  });
}

// ---------------- MAIN PAIRING FUNCTION ----------------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  
  await initMongo().catch(()=>{});
  
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { 
          await delay(1500); 
          code = await socket.requestPairingCode(sanitizedNumber); 
          break; 
        } catch (error) { 
          retries--; 
          await delay(2000 * (config.MAX_RETRIES - retries)); 
        }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const credsPath = path.join(sessionPath, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const fileContent = await fs.readFile(credsPath, 'utf8');
          const credsObj = JSON.parse(fileContent);
          const keysObj = state.keys || null;
          await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
          console.log('✅ Creds saved to MongoDB');
        }
      } catch (err) { 
        console.error('Failed saving creds:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);

          activeSockets.set(sanitizedNumber, socket);

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || config.BOT_NAME;

          const welcomeCaption = formatMessage(
            useBotName,
            `✅ *Successfully connected!*\n\n🔢 *Number:* ${sanitizedNumber}\n👑 *Owner:* ${config.OWNER_NAME}\n🕒 *Time:* ${getSriLankaTimestamp()}`,
            config.BOT_NAME
          );

          await socket.sendMessage(userJid, { 
            image: { url: config.IMAGE_PATH }, 
            caption: welcomeCaption 
          });

          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
        }
      }
      if (connection === 'close') {
        try { 
          if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); 
        } catch(e){}
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- API ENDPOINTS ----------------
router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
    return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  }
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ 
    botName: config.BOT_NAME, 
    count: activeSockets.size, 
    numbers: Array.from(activeSockets.keys()), 
    timestamp: getSriLankaTimestamp() 
  });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ 
    status: 'active', 
    botName: config.BOT_NAME, 
    message: 'SO MINI BOT', 
    activeSessions: activeSockets.size 
  });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) {
      return res.status(404).send({ error: 'No numbers found to connect' });
    }
    
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { 
        results.push({ number, status: 'already_connected' }); 
        continue; 
      }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { 
    console.error('Connect all error:', error); 
    res.status(500).send({ error: 'Failed to connect all bots' }); 
  }
});

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    
    if (running) {
      try { 
        if (typeof running.logout === 'function') await running.logout().catch(()=>{}); 
      } catch(e){}
      try { 
        running.ws?.close(); 
      } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    
    try { 
      const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); 
      if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); 
    } catch(e){}
    
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

// ---------------- CLEANUP ----------------
process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2 restart ${process.env.PM2_NAME || 'SO-MINI-BOT'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});

// Initialize Mongo & auto-reconnect
initMongo().catch(err => console.warn('Mongo init failed at startup', err));

(async() => {
  try { 
    const nums = await getAllNumbersFromMongo(); 
    if (nums && nums.length) { 
      for (const n of nums) { 
        if (!activeSockets.has(n)) { 
          const mockRes = { headersSent: false, send: () => {}, status: () => mockRes }; 
          await EmpirePair(n, mockRes); 
          await delay(500); 
        } 
      } 
    } 
  } catch(e){} 
})();

module.exports = router;