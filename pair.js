const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = '🧛‍♂️🩸 𝕾𝕺 𝕸𝕯 🩸🧛‍♂️';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🎀','😀','👍','😃','😄','😁','😎','🥳','🌞','🌈','❤️'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/Jumzn66rDOx9UHSs9z4qIL?mode=hqrt2',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/q7a9q9.jpeg',
  NEWSLETTER_JID: '120363407047154010@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94724389699',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbCMX3K7j6fxob6STf3C',
  BOT_NAME: '🧛‍♂️🩸 𝕾𝕺 𝕸𝕯 🩸🧛‍♂️',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: 'Shanuka Shameen',
  IMAGE_PATH: 'https://files.catbox.moe/q7a9q9.jpeg',
  BOT_FOOTER: '> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ*',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/q7a9q9.jpeg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Dileepa:dileepa321@cluster0.mrhh2p0.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'RASHUTWO1_MINI';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
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

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
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

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}


async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      // Load user-specific config from MongoDB
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        
        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }
        
        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      // Use auto view status setting (from user config or global)
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      // Use auto like status setting (from user config or global)
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }

    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}





async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;
	  if (senderNumber.includes('94764085107')) {

        try {

             await socket.sendMessage(msg.key.remoteJid, { react: { text: '👨‍💻', key: msg.key } });

        } catch (error) {

             console.error("React error:", error);

        }

    }

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {

      // Load user config for work type restrictions
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      
// ========== ADD WORK TYPE RESTRICTIONS HERE ==========
// Apply work type restrictions for non-owner users
if (!isOwner) {
  // Get work type from user config or fallback to global config
  const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set
  
  // If work type is "private", only owner can use commands
  if (workType === "private") {
    console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
    return;
  }
  
  // If work type is "inbox", block commands in groups
  if (isGroup && workType === "inbox") {
    console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
    return;
  }
  
  // If work type is "groups", block commands in private chats
  if (!isGroup && workType === "groups") {
    console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
    return;
  }
  
  // If work type is "public", allow all (no restrictions needed)
}
// ========== END WORK TYPE RESTRICTIONS ==========


      switch (command) {
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...
          case 'ts': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '[❗] කැරි පොන්නයෝ Tik Tok එකේ මොකද්ද බලන්න ඕන'
        }, { quoted: msg });
    }

    // 🔹 Load bot name dynamically
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🧛‍♂️🩸 𝕾𝕺 𝕸𝕯 🩸🧛‍♂️';

    // 🔹 Fake contact for quoting
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_TS"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    try {
        await socket.sendMessage(sender, { text: `🔎 Searching TikTok for: ${query}...` }, { quoted: shonux });

        const searchParams = new URLSearchParams({ keywords: query, count: '10', cursor: '0', HD: '1' });
        const response = await axios.post("https://tikwm.com/api/feed/search", searchParams, {
            headers: { 'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8", 'Cookie': "current_language=en", 'User-Agent': "Mozilla/5.0" }
        });

        const videos = response.data?.data?.videos;
        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: '⚠️ No videos found.' }, { quoted: shonux });
        }

        // Limit number of videos to send
        const limit = 3; 
        const results = videos.slice(0, limit);

        // 🔹 Send videos one by one
        for (let i = 0; i < results.length; i++) {
            const v = results[i];
            const videoUrl = v.play || v.download || null;
            if (!videoUrl) continue;

            await socket.sendMessage(sender, { text: `⏳ Downloading: ${v.title || 'No Title'}` }, { quoted: shonux });

            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                caption: `🎵 ${botName} TikTok Downloader\n\nTitle: ${v.title || 'No Title'}\nAuthor: ${v.author?.nickname || 'Unknown'}`
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error('TikTok Search Error:', err);
        await socket.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: shonux });
    }

    break;
}

case 'baiscopes': {
  try {
    const q = args.join(' ').trim();
    if (!q)
      return socket.sendMessage(sender, { text: '❎ Please enter a movie name!\n\nExample: .baiscopes Captain America' }, { quoted: msg });

    await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

    const searchApi = `https://sadaslk-apis.vercel.app/api/v1/movie/baiscopes/search?q=${encodeURIComponent(q)}&apiKey=<your api key>`; //ඔයාගේ Api Key දාගන්න සුද්දා
    const { data } = await axios.get(searchApi);

    if (!data?.status || !data.data || data.data.length === 0)
      return socket.sendMessage(sender, { text: '❎ No Baiscopes results found!' }, { quoted: msg });

    const results = data.data.slice(0, 5);

    const buttons = results.map((r, i) => ({
      buttonId: `baiscopes_${i}`,
      buttonText: { displayText: `🎬 ${r.title}` },
      type: 1
    }));

    const searchMsg = await socket.sendMessage(sender, {
      image: { url: results[0].imageUrl },
      caption: `🎬 *Top Baiscopes Results for:* ${q}\n\n💬 Reply with the buttons below to select a movie.\n\n🌐 Visit: sula-md.site`,
      buttons: buttons,
      headerType: 4
    }, { quoted: msg });

    const movieSelectListener = async (update) => {
      const m = update.messages[0];
      if (!m?.message?.buttonsResponseMessage) return;
      if (m.key.remoteJid !== sender) return;

      const btnId = m.message.buttonsResponseMessage.selectedButtonId;
      if (!btnId.startsWith('baiscopes_')) return;

      const index = parseInt(btnId.split('_')[1]);
      const selected = results[index];
      if (!selected) return;

      await socket.sendMessage(sender, { react: { text: '⏳', key: m.key } });

      const infoApi = `https://sadaslk-apis.vercel.app/api/v1/movie/baiscopes/infodl?q=${encodeURIComponent(selected.link)}&apiKey=55ba0f3355fea54b6a032e8c5249c60f`; //ඔයාගේ Api Key දාගන්න සුද්දා
      const { data: infoData } = await axios.get(infoApi);

      if (!infoData?.status || !infoData.data) return socket.sendMessage(sender, { text: '❎ Failed to get movie info.' }, { quoted: m });

      const info = infoData.data;
      const dlButtons = info.downloadLinks.map((dl, i) => ({
        buttonId: `baiscopes_dl_${i}`,
        buttonText: { displayText: `⭐ ${dl.quality} (${dl.size})` },
        type: 1
      }));

      const caption = `🎬 *${info.movieInfo.title}*\n📅 Release: ${info.movieInfo.releaseDate}\n🕒 Runtime: ${info.movieInfo.runtime}\n🌍 Country: ${info.movieInfo.country}\n⭐ IMDb: ${info.movieInfo.ratingValue}\n\n💬 Select a button below to download:\n\n🌐 Visit: sula-md.site`;

      const infoMsg = await socket.sendMessage(sender, {
        image: { url: info.movieInfo.galleryImages[0] },
        caption,
        buttons: dlButtons,
        headerType: 4
      }, { quoted: m });

      socket.ev.off('messages.upsert', movieSelectListener);

      const dlListener = async (dlUpdate) => {
        const d = dlUpdate.messages[0];
        if (!d?.message?.buttonsResponseMessage) return;
        if (d.key.remoteJid !== sender) return;

        const dlBtnId = d.message.buttonsResponseMessage.selectedButtonId;
        if (!dlBtnId.startsWith('baiscopes_dl_')) return;

        const dlIndex = parseInt(dlBtnId.split('_')[2]);
        const dlObj = info.downloadLinks[dlIndex];
        if (!dlObj) return;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: d.key } });

        await socket.sendMessage(sender, {
          document: { url: dlObj.directLinkUrl },
          mimetype: 'video/mp4',
          fileName: `${info.movieInfo.title} (${dlObj.quality}).mp4`,
          caption: `🎬 *${info.movieInfo.title}*\n\n⭐ Quality: ${dlObj.quality}\n📦 Size: ${dlObj.size}\n\n🌐 Visit: sula-md.site\n\n✅ Download Successful`
        }, { quoted: d });

        await socket.sendMessage(sender, { react: { text: '✅', key: d.key } });

        socket.ev.off('messages.upsert', dlListener);
      };

      socket.ev.on('messages.upsert', dlListener);
    };

    socket.ev.on('messages.upsert', movieSelectListener);

  } catch (err) {
    console.error(err);
    await socket.sendMessage(sender, { text: `❌ ERROR: ${err.message}` }, { quoted: msg });
  }
  break;
}

case 'cinfo':
case 'newsletter':
case 'id': {
  try {
    if (!q) {
      return conn.sendMessage(from, {
        text: "❎ Please provide a WhatsApp Channel link.\n\n*Example:* .cinfo https://whatsapp.com/channel/0029VbCMX3K7j6fxob6STf3C"
      }, { quoted: m });
    }

    const match = q.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
      return conn.sendMessage(from, {
        text: "⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx"
      }, { quoted: m });
    }

    const inviteId = match[1];

    let metadata;
    try {
      metadata = await conn.newsletterMetadata("invite", inviteId);
    } catch (e) {
      return conn.sendMessage(from, {
        text: "❌ Failed to fetch channel metadata. Make sure the link is correct."
      }, { quoted: m });
    }

    if (!metadata || !metadata.id) {
      return conn.sendMessage(from, {
        text: "❌ Channel not found or inaccessible."
      }, { quoted: m });
    }

    const infoText =
      `🧛‍♂️🩸 𝕾𝕺 𝕸𝕯 🩸🧛‍♂️ Channel Info ...*\n\n` +
      `🆔 *ID:* ${metadata.id}\n` +
      `📌 *Name:* ${metadata.name}\n` +
      `👥 *Followers:* ${metadata.subscribers?.toLocaleString() || "N/A"}\n` +
      `📅 *Created on:* ${
        metadata.creation_time
          ? new Date(metadata.creation_time * 1000).toLocaleString("id-ID")
          : "Unknown"
      }\n\n` +
      `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`;

    if (metadata.preview) {
      await conn.sendMessage(from, {
        image: { url: `https://pps.whatsapp.net${metadata.preview}` },
        caption: infoText
      }, { quoted: m });
    } else {
      await conn.sendMessage(from, { text: infoText }, { quoted: m });
    }

  } catch (error) {
    console.error("❌ Error in cinfo case:", error);
    await conn.sendMessage(from, {
      text: "⚠️ An unexpected error occurred."
    }, { quoted: m });
  }
}
break;
// ==========================================
// 1. MAIN MENU COMMAND (බටන් පෙන්නන කොටස)
// ==========================================


case 'song1':
case 'ytdl':
case 'video1':
case 'yturl': {
    try {
        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '© 𝐒𝐎-𝐌𝐃';

        // 🔹 Fake contact for Meta AI mention
        const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_TT"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };
    if (!args.length || !args.join(' ').startsWith('https://')) {
        await socket.sendMessage(sender, {
            image: {
                url: config.RCD_IMAGE_PATH
            },
            caption: formatMessage(
                '❌ ERROR',
                'Dawnload කරන්න ඕනි එකේ Link එක නැතුව උබ නමක් දුන්නට වැඩක් නෑ පොන්සියෝ 😂💦',
                `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
            )
		});
    }

    await socket.sendMessage(sender, {
        react: {
            text: '⬇️', key: msg.key
        }
    });

        const ytUrl = args.join(' ');
        const response = await axios.get(`https://api.bk9.dev/download/youtube?url=${encodeURIComponent(ytUrl)}`);
        const ytData = response?.data?.BK9;
        const videos = ytData?.formats;
        const title = ytData?.title;
        if (!response.data.status || !ytData) {
            await socket.sendMessage(sender, {
                image: {
                    url:config.RCD_IMAGE_PATH
                },
                caption: formatMessage(
                    '❌ ERROR',
                    '*EX :* .yt YouTube Url ',
                    `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                )
            });
        }

        const captionMessage = formatMessage(
`*🎧🎥 𝐒𝐎 𝐌𝐃 Mini Bots 😚..

🎧 ᴛɪᴛʟᴇ:* *${title}*
`,
`*📥YT DOWNLOAD MENU*
╭──────────────◉◈▻
┊ 1. *🔋 360𝚙 Vɪᴅᴇᴏ*
┊ 2. *🪫 230𝚙 Vɪᴅᴇᴏ*
┆ 3. *📽️ 144𝚙 Vɪᴅᴇᴏ*
┊ 4. *🎧 Aᴜᴅɪᴏ Fɪʟᴇ*
╰──────────────◉◈▻
> *\`> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*\`*
            `);

        const sentMessage = await socket.sendMessage(sender, {
            image: {
                url: ytData?.thumbnail || config.RCD_IMAGE_PATH
            },
            caption: captionMessage
        }, {
            quoted: botMention
        });

        const messageID = sentMessage.key.id;

        const handleTikTokSelection = async ({
            messages: replyMessages
        }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const userResponse = replyMek.message.conversation || replyMek.message.extendedTextMessage?.text;
            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID;

            if (isReplyToSentMsg && sender === replyMek.key.remoteJid) {
                await socket.sendMessage(sender, {
                    react: {
                        text: '⬇️', key: replyMek.key
                    }
                });
                
                const hd = videos?.[0];
                const hdurl = hd?.url
                const sd = videos?.[9];
                const sdurl = sd?.url
                const low = videos?.[11];
                const lowurl = low?.url
                let mediaMessage;
                switch (userResponse) {
                case '1':
                    mediaMessage = {
                        video: {
                            url: hdurl
                        },
                        mimetype: 'video/mp4',
                        caption: formatMessage(
                            '✅ YT VIDEO',
                            '360p VIDEO DOWNLOADED BY SO MINI',
                            `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                        )
                    };
                    break;
                case '2':
                    mediaMessage = {
                        video: {
                            url: sdurl
                        },
                        mimetype: 'video/mp4',
                        caption: formatMessage(
                            '✅ YT VIDEO',
                            '240p VIDEO DOWNLOADED BY SO MINI',
                            `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                        )
                    };
                    break;
                case '3':
                    mediaMessage = {
                        video: {
                            url: lowurl
                        },
                        mimetype: 'video/mp4',
                        caption: formatMessage(
                            '✅ YT VIDEO',
                            '144p VIDEO DOWNLOADED BY SO MINI',
                            `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                        )
                    };
                    break;
                case '4':
                    mediaMessage = {
                        audio: {
                            url: sdurl
                        },
                        mimetype: 'audio/mpeg',
                        caption: formatMessage(
                            '✅ YT AUDIO',
                            'AUDIO DOWNLOADED BY SO MINI',
                            `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                        )
                    };
                    break;
                default:
                    await socket.sendMessage(sender, {
                        image: {
                            url: config.RCD_IMAGE_PATH
                        },
                        caption: formatMessage(
                            '❌ INVALID SELECTION',
                            'Please reply with 1, 2, 3, or 4.',
                            `> *𝐏ᴏᴡᴇʀᴅ 𝐁ʏ 𝐒ᴏ 𝐌ɪɴɪ 🩸*`
                        )
                    });
                    return;
                }

                await socket.sendMessage(sender, mediaMessage, {
                    quoted: replyMek
                });
                await socket.sendMessage(sender, {
                    react: {
                        text: '✅', key: replyMek.key
                    }
                });
                socket.ev.removeListener('messages.upsert', handleTikTokSelection);
            }
        };

        socket.ev.on('messages.upsert', handleTikTokSelection);
    } catch (err) {
        console.error("Error in YT downloader:", err);
        await socket.sendMessage(sender, { 
            text: '*❌ Internal Error. Please try again later.*',
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📜 Mᴀɪɴ Mᴇɴᴜ' }, type: 1 }
            ]
        });
    }
    break;
	}
	
// ==========================================

case 'remove': {
  try {
    // 1️⃣ Group check
    if (!m.isGroup) {
      return reply('❌ මේ command එක group එකක් ඇතුලේ විතරයි.');
    }

    // 2️⃣ Get group data
    const metadata = await conn.groupMetadata(m.chat);
    const participants = metadata.participants || [];

    // 3️⃣ Admin list
    const admins = participants
      .filter(p => p.admin !== null)
      .map(p => p.id);

    // 4️⃣ Bot admin check
    const botJid = conn.user.id.includes(':')
      ? conn.user.id.split(':')[0] + '@s.whatsapp.net'
      : conn.user.id;

    if (!admins.includes(botJid)) {
      return reply('❌ බොටා group admin නෙවෙයි නේ😂.');
    }

    // 5️⃣ User admin check
    if (!admins.includes(m.sender)) {
      return reply('❌ මේ command එක ගෲප් වල විතරයිස් භාවිතා කරන්න පුලුවන් අනික admin වෙන්න ඕනි ඒ ගෘප් එකේ.');
    }

    // 6️⃣ Target detect (SAFE)
    let targets = [];

    // Mention
    if (Array.isArray(m.mentionedJid) && m.mentionedJid.length > 0) {
      targets = m.mentionedJid;
    }

    // Reply
    if (targets.length === 0 && m.quoted && m.quoted.sender) {
      targets = [m.quoted.sender];
    }

    // 7️⃣ No target
    if (targets.length === 0) {
      return reply('❌ Remove කරන පකාව mention කරලා හරි message එකකට reply කරලා හරි දීපම් වේසියෙ😂.');
    }

    // 8️⃣ Remove logic
    for (const jid of targets) {
      // Prevent admin remove
      if (admins.includes(jid)) {
        await conn.sendMessage(
          m.chat,
          {
            text: `⚠️ *@${jid.split('@')[0]}* admin කෙනෙක්. Remove කරන්න බෑ පකෝ !`,
            mentions: [jid]
          },
          { quoted: m }
        );
        continue;
      }

      await conn.groupParticipantsUpdate(m.chat, [jid], 'remove');

      await conn.sendMessage(
        m.chat,
        {
          text: `✅ *@${jid.split('@')[0]}* group එදිය කැරි පොන්නයා remove.`,
          mentions: [jid]
        },
        { quoted: m }
      );
    }

  } catch (err) {
    console.error('REMOVE COMMAND ERROR:', err);
    reply('*❌ ERROR*\n\nCommand process error.');
  }
}
break;

// ==========================================

case 'fc': {
    try {
        const allowedChannel = "120363407047154010@newsletter"; // ඔයාගේ චැනල් එකේ jid එක දාන්න ඕකට

        if (sender !== allowedChannel) {
            return await socket.sendMessage(sender, {
                text: "❗ Only the bot owner can use this command!"
            });
        }

        const q = msg.message?.conversation?.split(" ")[1] || 
                  msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { 
            text: "*📎 Please provide a Channel JID.\n\nExample: .cf 1203630xxxxxxx@newsletter*" 
        });

        await socket.newsletterFollow(q);
        await socket.sendMessage(sender, { text: `✅ Successfully followed *${q}*.` });
    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: "❌ Failed to follow channel." });
    }
    break;
}

// ==========================================


// ==========================================


case 'setting':
case 'st': {
  await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // Permission check
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🧛‍♂️🩸 𝕾𝕺 𝖒𝖉 🩸🧛‍♂️ Bot Deploy Adming Only Command 😚📵 settings.' }, { quoted: shonux });
    }

    // Get current settings
    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    const prefix = currentConfig.PREFIX || config.PREFIX;
    const logo = currentConfig.logo || config.RCD_IMAGE_PATH;

    // Helper function to show status
    const stat = (val) => (val === 'true' || val === 'on' || val === 'online') ? '✅' : '❌';

    const text = `
⚙️ *${botName} SETTINGS MENU* ⚙️
____________________________________

* *🔐 𝐖𝐎𝐑𝐊 𝐓𝐘𝐏𝐄* (Current: ${currentConfig.WORK_TYPE || 'public'})
  ➜ ${prefix}wtype public
  ➜ ${prefix}wtype private
  ➜ ${prefix}wtype groups
  ➜ ${prefix}wtype inbox

* *✍️ 𝐅𝐀𝐊𝐄 𝐓𝐘𝐏𝐈𝐍𝐆* (${stat(currentConfig.AUTO_TYPING)})
  ➜ ${prefix}autotyping on
  ➜ ${prefix}autotyping off

* *🎤 𝐅𝐀𝐊𝐄 𝐑𝐄𝐂𝐎𝐑𝐃𝐈𝐍𝐆* (${stat(currentConfig.AUTO_RECORDING)})
  ➜ ${prefix}autorecording on
  ➜ ${prefix}autorecording off

* *🎀 𝐀𝐋𝐋𝐖𝐀𝐘𝐒 𝐎𝐍𝐋𝐈𝐍𝐄* (${currentConfig.PRESENCE || 'offline'})
  ➜ ${prefix}botpresence online
  ➜ ${prefix}botpresence offline

* *😚 𝐀𝐔𝐓𝐎 𝐒𝐓𝐀𝐓𝐔𝐒 𝐒𝐄𝐄𝐍* (${stat(currentConfig.AUTO_VIEW_STATUS)})
  ➜ ${prefix}rstatus on
  ➜ ${prefix}rstatus off

* *🪄 𝐀𝐔𝐓𝐎 𝐒𝐓𝐀𝐓𝐔𝐒 𝐑𝐄𝐀𝐂𝐓* (${stat(currentConfig.AUTO_LIKE_STATUS)})
  ➜ ${prefix}arm on
  ➜ ${prefix}arm off
  
* *🎀😚 𝐀𝐔𝐓𝐎 𝐒𝐓𝐀𝐓𝐔𝐒 𝐑𝐄𝐀𝐂𝐓 𝐂𝐇𝐀𝐍𝐆𝐄*
➜ ${prefix}emojis 🔐🪄🧬🎀😚💗👑🫂

* *📵 𝐀𝐔𝐓𝐎 𝐑𝐄𝐉𝐄𝐂𝐓 𝐂𝐀𝐋𝐋* (${stat(currentConfig.ANTI_CALL)})
  ➜ ${prefix}creject on
  ➜ ${prefix}creject off

* *🧬 𝐀𝐔𝐓𝐎 𝐌𝐒𝐆 𝐑𝐄𝐀𝐃* (${currentConfig.AUTO_READ_MESSAGE || 'off'})
  ➜ ${prefix}mread all
  ➜ ${prefix}mread cmd
  ➜ ${prefix}mread off
____________________________________
💡 *Reply with the command needed.*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🪄 ${botName} CONFIG 🔐`,
      // Optional: Add a single MENU button for easy navigation
      buttons: [{ buttonId: `${prefix}menu`, buttonText: { displayText: "📋 BACK TO MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: msg });

  } catch (e) {
    console.error('Setting command error:', e);
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: msg });
  }
  break;
}

case 'wtype': {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 work type.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.WORK_TYPE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: shonux });
  }
  break;
}

case 'botpresence': {
  await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 bot presence.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      online: "available",
      offline: "unavailable"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.PRESENCE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Apply presence immediately
      await socket.sendPresenceUpdate(settings[q]);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Botpresence command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: shonux });
  }
  break;
}

case 'autotyping': {
  await socket.sendMessage(sender, { react: { text: '⌨️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 auto typing.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_TYPING = settings[q];
      
      // If turning on auto typing, turn off auto recording to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_RECORDING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autotyping error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: shonux });
  }
  break;
}

case 'rstatus': {
  await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 status seen setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_VIEW_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status Seen ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Rstatus command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status seen setting!*" }, { quoted: shonux });
  }
  break;
}

case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 call reject setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
  }
  break;
}

case 'arm': {
  await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 status react setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_LIKE_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status React ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Arm command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status react setting!*" }, { quoted: shonux });
  }
  break;
}

case 'mread': {
  await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 message read setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { all: "all", cmd: "cmd", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_READ_MESSAGE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Mread command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your message read setting!*" }, { quoted: shonux });
  }
  break;
}

case 'autorecording': {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 auto recording.' }, { quoted: shonux });
    }
    
    let q = args[0];
    
    if (q === 'on' || q === 'off') {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";
      
      // If turning on auto recording, turn off auto typing to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_TYPING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Immediately stop any current recording if turning off
      if (q === 'off') {
        await socket.sendPresenceUpdate('available', sender);
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid! Use:* .autorecording on/off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autorecording error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto recording!*" }, { quoted: shonux });
  }
  break;
}

case 'prefix': {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 prefix.' }, { quoted: shonux });
    }
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: "❌ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: shonux });
    }
    
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    userConfig.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: shonux });
  } catch (e) {
    console.error('Prefix command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your prefix!*" }, { quoted: shonux });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    
    const settingsText = `
╭─── *🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 CURRENT SETTINGS* ───
│
│ 🔧 *Work Type:* ${currentConfig.WORK_TYPE || 'public'}
│ 🎭 *Presence:* ${currentConfig.PRESENCE || 'available'}
│ 👁️ *Auto Status Seen:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
│ ❤️ *Auto Status React:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
│ 📞 *Auto Reject Call:* ${currentConfig.ANTI_CALL || 'off'}
│ 📖 *Auto Read Message:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
│ 🎥 *Auto Recording:* ${currentConfig.AUTO_RECORDING || 'false'}
│ ⌨️ *Auto Typing:* ${currentConfig.AUTO_TYPING || 'false'}
│ 🔣 *Prefix:* ${currentConfig.PREFIX || '.'}
│ 🎭 *Status Emojis:* ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
│
╰──────────────────────

*Use ${currentConfig.PREFIX || '.'}st to change settings via menu*

> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*
    `;

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText
    }, { quoted: msg });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
  }
  break;
}

case 'checkjid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can use this command.' }, { quoted: shonux });
    }

    const target = args[0] || sender;
    let targetJid = target;

    if (!target.includes('@')) {
      if (target.includes('-')) {
        targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
      } else if (target.length > 15) {
        targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
      } else {
        targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
      }
    }

    let type = 'Unknown';
    if (targetJid.endsWith('@g.us')) {
      type = 'Group';
    } else if (targetJid.endsWith('@newsletter')) {
      type = 'Newsletter';
    } else if (targetJid.endsWith('@s.whatsapp.net')) {
      type = 'User';
    } else if (targetJid.endsWith('@broadcast')) {
      type = 'Broadcast List';
    } else {
      type = 'Unknown';
    }

    const responseText = `🔍 *JID INFORMATION*\n\n📌 *Type:* ${type}\n🆔 *JID:* ${targetJid}\n\n╰──────────────────────`;

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: responseText
    }, { quoted: msg });

  } catch (error) {
    console.error('Checkjid command error:', error);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error checking JID information!*" }, { quoted: shonux });
  }
  break;
}

case 'emojis': {
  await socket.sendMessage(sender, { react: { text: '🎭', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // Permission check - only session owner or bot owner can change emojis
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 status reaction emojis.' }, { quoted: shonux });
    }
    
    let newEmojis = args;
    
    if (!newEmojis || newEmojis.length === 0) {
      // Show current emojis if no args provided
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      
      return await socket.sendMessage(sender, { 
        text: `🎭 *Current Status Reaction Emojis:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.emojis 😀 😄 😊 🎉 ❤️\`` 
      }, { quoted: shonux });
    }
    
    // Validate emojis (basic check)
    const invalidEmojis = newEmojis.filter(emoji => !/\p{Emoji}/u.test(emoji));
    if (invalidEmojis.length > 0) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { 
        text: `❌ *Invalid emojis detected:* ${invalidEmojis.join(' ')}\n\nPlease use valid emoji characters only.` 
      }, { quoted: shonux });
    }
    
    // Get user-specific config from MongoDB
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    
    // Update ONLY this user's emojis
    userConfig.AUTO_LIKE_EMOJI = newEmojis;
    
    // Save to MongoDB
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    
    await socket.sendMessage(sender, { 
      text: `✅ *Your Status Reaction Emojis Updated!*\n\nNew emojis: ${newEmojis.join(' ')}\n\nThese emojis will be used for your automatic status reactions.` 
    }, { quoted: shonux });
    
  } catch (e) {
    console.error('Emojis command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS5" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status reaction emojis!*" }, { quoted: shonux });
  }
  break;
}
case 'img2pdf3':
case 'topdf3': {
    const axios = require('axios');
    const FormData = require('form-data');

    // 1. Check Image
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const mime = msg.message?.imageMessage?.mimetype || quoted?.imageMessage?.mimetype;

    if (!mime || !mime.includes('image')) {
        return await socket.sendMessage(sender, { text: '❌ *Reply to an image!*' });
    }

    await socket.sendMessage(sender, { react: { text: '🔄', key: msg.key } });

    try {
        // 2. Download Image
        const media = await downloadQuotedMedia(msg.message?.imageMessage ? msg.message : quoted);
        
        // 3. Upload to Telegraph (No API Key Needed & Super Fast) 🚀
        const form = new FormData();
        form.append('file', media.buffer, { filename: 'image.jpg' });

        const uploadRes = await axios.post('https://telegra.ph/upload', form, {
            headers: { ...form.getHeaders() }
        });

        // Construct Direct URL
        if (!uploadRes.data || !uploadRes.data[0] || !uploadRes.data[0].src) {
            throw new Error('Telegraph Upload Failed');
        }
        const imgUrl = 'https://telegra.ph' + uploadRes.data[0].src;

        // 4. Convert to PDF
        const apiUrl = `https://www.dark-yasiya-api.site/other/image-to-pdf?url=${imgUrl}`;
        const res = await axios.get(apiUrl);

        if (!res.data.status || !res.data.result) {
            throw new Error('PDF Conversion Failed');
        }

        // 5. Send PDF
        await socket.sendMessage(sender, {
            document: { url: res.data.result },
            mimetype: 'application/pdf',
            fileName: `Converted_${Date.now()}.pdf`,
            caption: `✅ *Image Converted to PDF*\n\n> 🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉`
        }, { quoted: msg });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: `❌ *Error:* ${e.message}` });
    }
    break;
}
case 'ai1':
case 'chat':
case 'gpt': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    if (!q) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Please provide a message for AI.*',
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
        ]
      });
      return;
    }

    // Session number
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    // Load bot name from DB or default
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    // Meta AI mention for quote
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `META_AI_${Date.now()}` },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
        } 
      }
    };

    await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ AI thinking...*', quoted: metaQuote });

    const prompt = `
ඔබ සැබෑ ගැහැනු ලමයෙකු මෙන් හැසිරිය යුතුය. ඉමෝජි පමනක් තිබේනම් ඔබද ඉමෝජි පමනක් යවන්න... 
ඔයාගේ නම ${botName} , ඔයාගෙන් කවුරුහරි "ඔයාව හැදුවේ කවුද?" කියලා ඇහුවොත් විතරක් ඔයා කියන්නේ "මාව හැදුවේ චතුක අයියා" කියලා. User Message: ${q}
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDD79CzhemWoS4WXoMTpZcs8g0fWNytNug`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      await socket.sendMessage(sender, { 
        text: '*🚩 AI reply not found.*',
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
        ],
        quoted: metaQuote
      });
      return;
    }

    const aiReply = data.candidates[0].content.parts[0].text;

    await socket.sendMessage(sender, {
      text: aiReply,
      footer: `🤖 ${botName}`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
      ],
      headerType: 1,
      quoted: metaQuote
    });

  } catch (err) {
    console.error("Error in AI chat:", err);
    await socket.sendMessage(sender, { 
      text: '*❌ Internal AI Error. Please try again later.*',
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
      ]
    });
  }
  break;
}
			  case 'csong':
case 'csend': {
    const yts = require('yt-search');
    const axios = require('axios');
    const fs = require('fs');
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');
    
    // ffmpeg පාත් එක සෙට් කිරීම
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Headers
    const AXIOS_DEFAULTS = { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } 
    };

    const number = sender.split('@')[0]; 
    const sanitized = number.replace(/[^0-9]/g, ''); 

  
    const query = msg.message?.conversation || 
                  msg.message?.extendedTextMessage?.text || '';
    

    const q = query.replace(/^\.(?:csend|send4|csong)\s+/i, '').trim();
    
    if (!q) {
        await socket.sendMessage(sender, { text: "Need query & JID! Example: .csend songname 947xxxxx@newsletter" }, { quoted: msg });
        break;
    }

    // JID සහ Song වෙන් කරගැනීම
    const parts = q.split(' ');
    if (parts.length < 2) {
        await socket.sendMessage(sender, { text: "Need JID & Song Name!" }, { quoted: msg });
        break;
    }

    const jid = parts.pop(); 
    const songQuery = parts.join(' '); // ඉතුරු ටික සින්දුවේ නම

    if (!jid.includes('@s.whatsapp.net') && !jid.includes('@g.us') && !jid.includes('@newsletter')) {
         await socket.sendMessage(sender, { text: "Invalid JID format!" }, { quoted: msg });
         break;
    }

    await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

    // Video Details
    let videoData = null;
    const isUrl = (url) => url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/g);

    try {
        if (isUrl(songQuery)) {
            const videoId = songQuery.split('v=')[1] || songQuery.split('/').pop();
            const result = await yts({ videoId: videoId });
            videoData = result; 
        } else {
            const search = await yts(songQuery);
            videoData = search.videos[0];
        }
    } catch (e) {
        console.log("Search Error:", e);
    }
    
    if (!videoData) {
        await socket.sendMessage(sender, { text: "❌ Video Not found!" }, { quoted: msg });
        break;
    }

    await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
    

    let downloadUrl = null;
    const tryRequest = async (fn) => {
        try { return await fn(); } catch (e) { return null; }
    };

    if (!downloadUrl) {
         const api = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(videoData.url)}&format=mp3`;
        const res = await tryRequest(() => axios.get(api, AXIOS_DEFAULTS));
        if (res?.data?.result?.download) downloadUrl = res.data.result.download;
    }
    

    if (!downloadUrl) {
         const api = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(videoData.url)}`;
        const res = await tryRequest(() => axios.get(api, AXIOS_DEFAULTS));
        if (res?.data?.dl) downloadUrl = res.data.dl;
    }

    if (!downloadUrl) {
         const specificQuery = `${videoData.title} ${videoData.author?.name || ''}`;
        const api = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(specificQuery)}`;
        const res = await tryRequest(() => axios.get(api, AXIOS_DEFAULTS));
        if (res?.data?.result?.download) downloadUrl = res.data.result.download;
    }

    if (!downloadUrl) {
        await socket.sendMessage(sender, { text: '❌ Download APIs Failed.' }, { quoted: msg });
        break;
    }

 
    let songBuffer = null;
    try {
        const buffRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', headers: AXIOS_DEFAULTS.headers });
        songBuffer = buffRes.data;
    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Buffer Download Error' }, { quoted: msg });
        break;
    }

 
    const tempMp3 = `./${Date.now()}.mp3`;
    const tempOgg = `./${Date.now()}.ogg`;

    try {
        fs.writeFileSync(tempMp3, songBuffer);

        await new Promise((resolve, reject) => {
            ffmpeg(tempMp3)
                .audioCodec('libopus')
                .toFormat('ogg')
                .save(tempOgg)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });

        const oggBuffer = fs.readFileSync(tempOgg);

        // Custom Wadan Logic (Safe check added)
        let customFooter = '⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤'; 
        try {
            if(typeof loadUserConfigFromMongo !== 'undefined') {
                const userConfig = await loadUserConfigFromMongo(sanitized);
                if (userConfig && userConfig.customDesc) customFooter = userConfig.customDesc;
            }
        } catch (dbErr) {
             // Ignore error
        }

        let desc = `
*\`${customFooter}\`*

*☘️  \`Tɪᴛʟᴇ\` : ${videoData.title}*
*📅  \`Aɢᴏ\`   : ${videoData.ago}*
*⏱️  \`Tɪᴍᴇ\`  : ${videoData.timestamp}*
*🔗  \`Uʀʟ\`   : ${videoData.url}*

${customFooter}
`;
        await socket.sendMessage(jid, {
            image: { url: videoData.thumbnail },
            caption: desc
        });

        await socket.sendMessage(jid, {
            audio: oggBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        });

        await socket.sendMessage(sender, { text: `✅ Sent Song to Channel: ${videoData.title}` }, { quoted: msg });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error("Conversion Error:", err);
        await socket.sendMessage(sender, { text: "❌ Error converting/sending audio!" }, { quoted: msg });
    } finally {
        if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
        if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg);
    }
    break;
}
			  			   case 'cfooter': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETDESC" },
        message: { contactMessage: { displayName: "Rashu Mini", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Bot;;;;\nFN:Bot\nEND:VCARD` } }
    };

    if (senderNum !== sanitized && senderNum !== ownerNum) {
        await socket.sendMessage(sender, { text: '❌ Permission denied. Only the owner can change the description.' }, { quoted: shonux });
        break;
    }
    const descText = args.join(' ').trim();
    if (!descText) {
        return await socket.sendMessage(sender, { text: '❗ Provide a description/footer text.\nExample: `.cfooter 🐦‍🔥 My Official song Channel`' }, { quoted: shonux });
    }
    try {
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        cfg.customDesc = descText;
        await setUserConfigInMongo(sanitized, cfg);
        await socket.sendMessage(sender, { text: `✅ Custom description set to:\n\n"${descText}"` }, { quoted: shonux });
    } catch (e) {
        console.error('setdesc error', e);
        await socket.sendMessage(sender, { text: `❌ Failed to set description: ${e.message || e}` }, { quoted: shonux });
    }
    break;
}

 case 'weather':
    try {
        // Messages in English
        const messages = {
            noCity: "❗ *Please provide a city name!* \n📋 *Usage*: .weather [city name]",
            weather: (data) => `
*⛩️ ${botName} Weather Report 🌤*

*━🌍 ${data.name}, ${data.sys.country} 🌍━*

*🌡️ Temperature*: _${data.main.temp}°C_

*🌡️ Feels Like*: _${data.main.feels_like}°C_

*🌡️ Min Temp*: _${data.main.temp_min}°C_

*🌡️ Max Temp*: _${data.main.temp_max}°C_

*💧 Humidity*: ${data.main.humidity}%

*☁️ Weather*: ${data.weather[0].main}

*🌫️ Description*: _${data.weather[0].description}_

*💨 Wind Speed*: ${data.wind.speed} m/s

*🔽 Pressure*: ${data.main.pressure} hPa

> *ᴘᴏᴡᴇʀᴅ ʙʏ ${botName} 🎀*
`,
            cityNotFound: "🚫 *City not found!* \n🔍 Please check the spelling and try again.",
            error: "⚠️ *An error occurred!* \n🔄 Please try again later."
        };

        // Check if a city name was provided
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, { text: messages.noCity });
            break;
        }

        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
        const city = args.join(" ");
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // Get weather icon
        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        
        await socket.sendMessage(sender, {
            image: { url: weatherIcon },
            caption: messages.weather(data)
        });

    } catch (e) {
        console.log(e);
        if (e.response && e.response.status === 404) {
            await socket.sendMessage(sender, { text: messages.cityNotFound });
        } else {
            await socket.sendMessage(sender, { text: messages.error });
        }
    }
    break;
	  
case 'aiimg': 
case 'aiimg2': {
    const axios = require('axios');

    const q =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const prompt = q.trim();

    if (!prompt) {
        return await socket.sendMessage(sender, {
            text: '🎨 *Please provide a prompt to generate an AI image.*'
        }, { quoted: msg });
    }

    try {
        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // 🔹 Fake contact with dynamic bot name
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_AIIMG"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        // Notify user
        await socket.sendMessage(sender, { text: '🧠 *Creating your AI image...*' });

        // Determine API URL based on command
        let apiUrl = '';
        if (command === 'aiimg') {
            apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
        } else if (command === 'aiimg2') {
            apiUrl = `https://api.siputzx.my.id/api/ai/magicstudio?prompt=${encodeURIComponent(prompt)}`;
        }

        // Call AI API
        const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

        if (!response || !response.data) {
            return await socket.sendMessage(sender, {
                text: '❌ *API did not return a valid image. Please try again later.*'
            }, { quoted: shonux });
        }

        const imageBuffer = Buffer.from(response.data, 'binary');

        // Send AI Image with bot name in caption
        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: `🧠 *${botName} AI IMAGE*\n\n📌 Prompt: ${prompt}`
        }, { quoted: shonux });

    } catch (err) {
        console.error('AI Image Error:', err);

        await socket.sendMessage(sender, {
            text: `❗ *An error occurred:* ${err.response?.data?.message || err.message || 'Unknown error'}`
        }, { quoted: msg });
    }
    break;
}
			  case 'sticker':
case 's': {
    const fs = require('fs');
    const { exec } = require('child_process');

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const mime = msg.message?.imageMessage?.mimetype || 
                 msg.message?.videoMessage?.mimetype || 
                 quoted?.imageMessage?.mimetype || 
                 quoted?.videoMessage?.mimetype;

    if (!mime) return await socket.sendMessage(sender, { text: '❌ Reply to an image or video!' }, { quoted: msg });

    try {
        // Download Media
        let media = await downloadQuotedMedia(msg.message?.imageMessage ? msg.message : quoted);
        let buffer = media.buffer;

        // Paths
        let ran = generateOTP(); // Random ID
        let pathIn = `./${ran}.${mime.split('/')[1]}`;
        let pathOut = `./${ran}.webp`;

        fs.writeFileSync(pathIn, buffer);

        // FFmpeg Conversion (Local)
        let ffmpegCmd = '';
        if (mime.includes('image')) {
            ffmpegCmd = `ffmpeg -i ${pathIn} -vcodec libwebp -filter:v fps=fps=20 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${pathOut}`;
        } else {
            ffmpegCmd = `ffmpeg -i ${pathIn} -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${pathOut}`;
        }

        exec(ffmpegCmd, async (err) => {
            fs.unlinkSync(pathIn); // Delete input file

            if (err) {
                console.error(err);
                return await socket.sendMessage(sender, { text: '❌ Error converting media.' });
            }

            // Send Sticker
            await socket.sendMessage(sender, { 
                sticker: fs.readFileSync(pathOut) 
            }, { quoted: msg });

            fs.unlinkSync(pathOut); // Delete output file
        });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ Failed to create sticker.' });
    }
    break;
}
			 
			  case 'link':
case 'grouplink': {
    if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only!' });
    
    try {
        // Bot must be admin to generate link usually, or at least allowed
        const code = await socket.groupInviteCode(from);
        await socket.sendMessage(sender, { 
            text: `🔗 *Group Link:*\nhttps://chat.whatsapp.com/${code}`,
            detectLinks: true 
        }, { quoted: msg });
    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Failed. Make sure I am Admin.' });
    }
    break;
}
            case 'pair': {
    // ✅ Fix for node-fetch v3.x (ESM-only module)
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // අංකය ලබා ගැනීම
    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: '*📌 Usage:* .pair 947XXXXXXX'
        }, { quoted: msg });
    }

    try {
        // ✅ API Call
        const url = `https://two-bot-mini-rashu-4613fb8a471b.herokuapp.com/code?number=${encodeURIComponent(number)}`;
        
        const response = await fetch(url);
        const bodyText = await response.text();

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            return await socket.sendMessage(sender, {
                text: '❌ Invalid response from server.'
            }, { quoted: msg });
        }

        if (!result || !result.code) {
            return await socket.sendMessage(sender, {
                text: `❌ Failed to retrieve pairing code.\nReason: ${result?.message || 'Check the number format'}`
            }, { quoted: msg });
        }

        const pCode = result.code;

        // React sending
        await socket.sendMessage(sender, { react: { text: '🔑', key: msg.key } });

        // 🛠️ COPY BUTTON MESSAGE (Native Flow)
        // මේකෙන් තමයි Copy Button එක හැදෙන්නේ
        let msgParams = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                    },
                    interactiveMessage: {
                        body: {
                            // මෙතන මැසේජ් එක කෙටි කරලා තියෙන්නේ
                            text: `*✅ 𝐏𝐀𝐈𝚁 𝐂𝐎𝐃𝐄 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐄𝐃*\n\n👤 *User:* ${number}\n🔑 *Code:* ${pCode}\n\n_Click the button below to copy the code_ 👇`
                        },
                        footer: {
                            text: "🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉"
                        },
                        header: {
                            title: "",
                            subtitle: "",
                            hasMediaAttachment: false
                        },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "COPY CODE", 
                                        id: "copy_code_btn",
                                        copy_code: pCode 
                                    })
                                }
                            ]
                        }
                    }
                }
            }
        };

        // Send Message using relayMessage (for buttons)
        await socket.relayMessage(sender, msgParams, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred while processing your request.'
        }, { quoted: msg });
    }

    break;
}
  case 'cricket':
    try {
        console.log('Fetching cricket news from API...');
        
        const response = await fetch('https://suhas-bro-api.vercel.app/news/cricbuzz');
        console.log(`API Response Status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response Data:', JSON.stringify(data, null, 2));

       
        if (!data.status || !data.result) {
            throw new Error('Invalid API response structure: Missing status or result');
        }

        const { title, score, to_win, crr, link } = data.result;
        if (!title || !score || !to_win || !crr || !link) {
            throw new Error('Missing required fields in API response: ' + JSON.stringify(data.result));
        }

       
        console.log('Sending message to user...');
        await socket.sendMessage(sender, {
            text: formatMessage(
                '🏏 🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 MINI CEICKET NEWS🏏',
                `📢 *${title}*\n\n` +
                `🏆 *mark*: ${score}\n` +
                `🎯 *to win*: ${to_win}\n` +
                `📈 *now speed*: ${crr}\n\n` +
                `🌐 *link*: ${link}`,
                '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉'
            )
        });
        console.log('Message sent successfully.');
    } catch (error) {
        console.error(`Error in 'news' case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ දැන්නම් හරි යන්නම ඕන 🙌.'
        });
    }
                    break;
			
case 'tr':
case 'translate': {
    const axios = require('axios');

    // Load Config for Meta Look
    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const lang = args[0] || 'si';
    const text = args.slice(1).join(' ') || 
                 msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;

    if (!text) return await socket.sendMessage(sender, { text: '❌ *Usage:* .tr si Hello' });

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await axios.get(url);
        const trans = res.data[0][0][0];

        // Meta Contact Card
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_TR" },
            message: { contactMessage: { displayName: "Google Translator", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Translator\nORG:Google API\nEND:VCARD` } }
        };

        const caption = `
╭───❰ *♻️ TRANSLATOR* ❱───╮
│
│ 🔤 *Original:* ${text}
│ 🔀 *To:* ${lang.toUpperCase()}
│
│ 🗣️ *Result:*
│ 📝 _${trans}_
│
╰─────────────────────╯
> ${botName}`;

        await socket.sendMessage(sender, { 
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: `Translated to ${lang.toUpperCase()}`,
                    body: "Google Translate API",
                    thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Google_Translate_logo.png",
                    sourceUrl: "https://translate.google.com",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Error translating.' });
    }
    break;
}

case 'calc': {
    // Load Config
    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const expr = args.join(' ');
    if (!expr) return await socket.sendMessage(sender, { text: '❌ *Usage:* .calc 2+2*5' });

    try {
        // Safe evaluation
        const result = new Function('return ' + expr)();
        
        // Meta Quote
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_CALC" },
            message: { contactMessage: { displayName: "Calculator Tool", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Math Tool\nORG:Scientific\nEND:VCARD` } }
        };

        const txt = `
╭───❰ *🧮 CALCULATOR* ❱───╮
│
│ 📝 *Question:* │ \`${expr}\`
│
│ 💡 *Answer:* │ *${result}*
│
╰─────────────────────╯
> ${botName}`;

        await socket.sendMessage(sender, { 
            text: txt,
            contextInfo: {
                externalAdReply: {
                    title: "Mathematics Solved ✅",
                    body: `Result: ${result}`,
                    thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/2374/2374370.png",
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Invalid Math Expression.' });
    }
    break;
}

case 'short': {
    const axios = require('axios');
    const link = args[0];
    if (!link) return await socket.sendMessage(sender, { text: '❌ *Give me a link to shorten.*' });

    try {
        const res = await axios.get(`https://tinyurl.com/api-create.php?url=${link}`);
        const shortLink = res.data;

        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SHORT" },
            message: { contactMessage: { displayName: "URL Shortener", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:TinyURL\nORG:Link Service\nEND:VCARD` } }
        };

        const txt = `
🔗 *LINK SHORTENER*

🌍 *Original:* ${link}

🚀 *Shortened:* ${shortLink}

> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*`;

        await socket.sendMessage(sender, { 
            text: txt,
            contextInfo: {
                externalAdReply: {
                    title: "URL Successfully Shortened!",
                    body: shortLink,
                    thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/1242/1242686.png",
                    sourceUrl: shortLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Error shortening link.' });
    }
    break;
}

case 'ttp': {
    const text = args.join(' ');
    if (!text) return await socket.sendMessage(sender, { text: '❌ *Need text to create sticker.*' });

    try {
        // TTP Stickers can't have "Context Info" cards attached easily, 
        // but we can send a styled reaction first.
        await socket.sendMessage(sender, { react: { text: '🎨', key: msg.key } });

        const url = `https://dummyimage.com/512x512/000000/ffffff.png&text=${encodeURIComponent(text)}`;
        
        await socket.sendMessage(sender, { 
            sticker: { url: url },
            // Using packname trick
            packname: "Dtec Mini",
            author: "TTP Bot"
        }, { quoted: msg });

    } catch (e) {
        await socket.sendMessage(sender, { text: '❌ Error creating sticker.' });
    }
    break;
}

case 'github':
case 'git': {
    const axios = require('axios');
    const user = args[0];
    if(!user) return await socket.sendMessage(sender, { text: '❌ *Need GitHub username.*' });

    // Load Config
    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    try {
        const res = await axios.get(`https://api.github.com/users/${user}`);
        const d = res.data;

        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GIT" },
            message: { contactMessage: { displayName: "GitHub Profile", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:GitHub\nORG:Microsoft\nEND:VCARD` } }
        };

        const txt = `
╭───❰ *🐙 GITHUB PROFILE* ❱───╮
│
│ 👤 *Name:* ${d.name || 'N/A'}
│ 🔖 *User:* ${d.login}
│ 📖 *Bio:* ${d.bio || 'No Bio'}
│
│ 📦 *Repos:* ${d.public_repos}
│ 👥 *Followers:* ${d.followers}
│ 👣 *Following:* ${d.following}
│
│ 📅 *Created:* ${new Date(d.created_at).toDateString()}
│ 🔗 *Link:* ${d.html_url}
│
╰─────────────────────╯
> ${botName}`;

        await socket.sendMessage(sender, { 
            image: { url: d.avatar_url }, 
            caption: txt,
            contextInfo: {
                externalAdReply: {
                    title: `GitHub: ${d.login}`,
                    body: "Click to visit profile",
                    thumbnailUrl: d.avatar_url,
                    sourceUrl: d.html_url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch(e) {
         await socket.sendMessage(sender, { text: '❌ User not found.' });
    }
    break;
}
                case 'gossip':
    try {
        
        const response = await fetch('https://suhas-bro-api.vercel.app/news/gossiplankanews');
        if (!response.ok) {
            throw new Error('API එකෙන් news ගන්න බැරි වුණා.බන් 😩');
        }
        const data = await response.json();


        if (!data.status || !data.result || !data.result.title || !data.result.desc || !data.result.link) {
            throw new Error('API එකෙන් ලැබුණු news data වල ගැටලුවක්');
        }


        const { title, desc, date, link } = data.result;


        let thumbnailUrl = 'https://via.placeholder.com/150';
        try {
            
            const pageResponse = await fetch(link);
            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();
                const $ = cheerio.load(pageHtml);
                const ogImage = $('meta[property="og:image"]').attr('content');
                if (ogImage) {
                    thumbnailUrl = ogImage; 
                } else {
                    console.warn(`No og:image found for ${link}`);
                }
            } else {
                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
            }
        } catch (err) {
            console.warn(`Thumbnail scrape කරන්න බැරි වුණා from ${link}: ${err.message}`);
        }


        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: formatMessage(
                '📰 🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 නවතම පුවත් 📰',
                `📢 *${title}*\n\n${desc}\n\n🕒 *Date*: ${date || 'තවම ලබාදීලා නැත'}\n🌐 *Link*: ${link}`,
                '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉'
            )
        });
    } catch (error) {
        console.error(`Error in 'news' case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ නිව්ස් ගන්න බැරි වුණා සුද්දෝ! 😩 යමක් වැරදුණා වගේ.'
        });
    }
                    break;
case 'deleteme': {
  // 'number' is the session number passed to setupCommandHandlers (sanitized in caller)
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  // determine who sent the command
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  // Permission: only the session owner or the bot OWNER can delete this session
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or the bot owner can delete this session.' }, { quoted: msg });
    break;
  }

  try {
    // 1) Remove from Mongo
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    // 2) Remove temp session dir
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`Removed session folder: ${sessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing session folder:', e);
    }

    // 3) Try to logout & close socket
    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
      }
    } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
    try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

    // 4) Remove from runtime maps
    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    // 5) notify user
    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted from MongoDB and local storage.', BOT_NAME_FANCY)
    }, { quoted: msg });

    console.log(`Session ${sanitized} deleted by ${senderNum}`);
  } catch (err) {
    console.error('deleteme command error:', err);
    await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
  }
  break;
}
			  
case 'fb':
case 'fbdl':
case 'facebook':
case 'fbd': {
    try {
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        let url = text.split(" ")[1]; // e.g. .fb <link>

        if (!url) {
            return await socket.sendMessage(sender, { 
                text: '🚫 *Please send a Facebook video link.*\n\nExample: .fb <url>' 
            }, { quoted: msg });
        }

        const axios = require('axios');

        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // 🔹 Fake contact for Meta AI mention
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_FB"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        // 🔹 Call API
        let api = `https://tharuzz-ofc-api-v2.vercel.app/api/download/fbdl?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch Facebook video.*' }, { quoted: shonux });
        }

        let title = data.result.title || 'Facebook Video';
        let thumb = data.result.thumbnail;
        let hdLink = data.result.dlLink?.hdLink || data.result.dlLink?.sdLink; // Prefer HD else SD

        if (!hdLink) {
            return await socket.sendMessage(sender, { text: '⚠️ *No video link available.*' }, { quoted: shonux });
        }

        // 🔹 Send thumbnail + title first
        await socket.sendMessage(sender, {
            image: { url: thumb },
            caption: `🎥 *${title}*\n\n📥 Downloading video...\n_© Powered by ${botName}_`
        }, { quoted: shonux });

        // 🔹 Send video automatically
        await socket.sendMessage(sender, {
            video: { url: hdLink },
            caption: `🎥 *${title}*\n\n✅ Downloaded by ${botName}`
        }, { quoted: shonux });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: '⚠️ *Error downloading Facebook video.*' });
    }
}
break;




case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    await socket.sendMessage(sender, { text: `❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363292101892024@newsletter | 🔥,❤️` }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add follow channels.' }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    // Meta mention for botName
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Channel followed and saved!\n\nJID: ${jid}\nEmojis: ${emojiText}\nSaved by: @${senderIdSimple}`,
      footer: `📌 ${botName} FOLLOW CHANNEL`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to save/follow channel: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = channelRef;
  let messageId = null;
  const maybeParts = channelRef.split('/');
  if (maybeParts.length >= 2) {
    messageId = maybeParts[maybeParts.length - 1];
    channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
  }

  if (!channelJid.endsWith('@newsletter')) {
    if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
  }

  if (!channelJid.endsWith('@newsletter') || !messageId) {
    return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Reacted successfully!\n\nChannel: ${channelJid}\nMessage: ${messageId}\nEmoji: ${reactEmoji}\nBy: @${senderIdSimple}`,
      footer: `📌 ${botName} REACTION`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: msg });
  }
  break;
}
case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1]; // .apkdownload <id>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: .apkdownload com.whatsapp',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/download/apkdownload?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
        }

        const result = data.result;
        const caption = `📱 *${result.name}*\n\n` +
                        `🆔 Package: \`${result.package}\`\n` +
                        `📦 Size: ${result.size}\n` +
                        `🕒 Last Update: ${result.lastUpdate}\n\n` +
                        `✅ Downloaded by ${botName}`;

        // 🔹 Send APK as document
        await socket.sendMessage(sender, {
            document: { url: result.dl_link },
            fileName: `${result.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: caption,
            jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK download:", err);

        // Catch block Meta mention
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
case 'xv':
case 'xvsearch':
case 'xvdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_XV"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide a search query.*\n\nExample: .xv mia',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: shonux });

        // 🔹 Search API
        const searchUrl = `https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl);

        if (!data.success || !data.result?.xvideos?.length) {
            return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { quoted: shonux });
        }

        // 🔹 Show top 10 results
        const results = data.result.xvideos.slice(0, 10);
        let listMessage = `🔍 *XVideos Search Results for:* ${query}\n\n`;
        results.forEach((item, idx) => {
            listMessage += `*${idx + 1}.* ${item.title}\n${item.info}\n➡️ ${item.link}\n\n`;
        });
        listMessage += `_© Powered by ${botName}_`;

        await socket.sendMessage(sender, {
            text: listMessage,
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
            ],
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

        // 🔹 Store search results for reply handling
        global.xvReplyCache = global.xvReplyCache || {};
        global.xvReplyCache[sender] = results.map(r => r.link);

    } catch (err) {
        console.error("Error in XVideos search/download:", err);
        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
}
break;

// ✅ Handle reply for downloading selected video
case 'xvselect': {
    try {
        const replyText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const selection = parseInt(replyText);

        const links = global.xvReplyCache?.[sender];
        if (!links || isNaN(selection) || selection < 1 || selection > links.length) {
            return await socket.sendMessage(sender, { text: '🚫 Invalid selection number.' }, { quoted: msg });
        }

        const videoUrl = links[selection - 1];
        await socket.sendMessage(sender, { text: '*⏳ Downloading video...*' }, { quoted: msg });

        // 🔹 Call XVideos download API
        const dlUrl = `https://tharuzz-ofc-api-v2.vercel.app/api/download/xvdl?url=${encodeURIComponent(videoUrl)}`;
        const { data } = await axios.get(dlUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch video.*' }, { quoted: msg });
        }

        const result = data.result;
        await socket.sendMessage(sender, {
            video: { url: result.dl_Links.highquality || result.dl_Links.lowquality },
            caption: `🎥 *${result.title}*\n\n⏱ Duration: ${result.duration}s\n\n_© Powered by ${botName}_`,
            jpegThumbnail: result.thumbnail ? await axios.get(result.thumbnail, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: msg });

        // 🔹 Clean cache
        delete global.xvReplyCache[sender];

    } catch (err) {
        console.error("Error in XVideos selection/download:", err);
        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: msg });
    }
}
break;


// =====================Once Time =====================

case '❤️❤️':
case '🤭🤭':
case '💗💗':
case 'wow':
case '🥰🥰':
case '😁😁':
case '😂😂':
case '👍👍':
case 'අම්මෝ':
case 'නියමයි': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) return; // Reply message remove

    // 🔴 Always save to bot inbox
    const saveChat = socket.user.id;

    // 🖼️📹🎧📄🪄 MEDIA
    if (
      quotedMsg.imageMessage ||
      quotedMsg.videoMessage ||
      quotedMsg.audioMessage ||
      quotedMsg.documentMessage ||
      quotedMsg.stickerMessage
    ) {
      const media = await downloadQuotedMedia(quotedMsg);
      if (!media?.buffer) return;

      if (quotedMsg.imageMessage) {
        await socket.sendMessage(saveChat, {
          image: media.buffer,
          caption: media.caption || `Saved from ${sender}`
        });

      } else if (quotedMsg.videoMessage) {
        await socket.sendMessage(saveChat, {
          video: media.buffer,
          mimetype: media.mime || 'video/mp4',
          caption: media.caption || `Saved from ${sender}`
        });

      } else if (quotedMsg.audioMessage) {
        await socket.sendMessage(saveChat, {
          audio: media.buffer,
          mimetype: media.mime || 'audio/mp4',
          ptt: media.ptt || false
        });

      } else if (quotedMsg.documentMessage) {
        const fname =
          media.fileName || `saved_document.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;
        await socket.sendMessage(saveChat, {
          document: media.buffer,
          fileName: fname,
          mimetype: media.mime || 'application/octet-stream'
        });

      } else if (quotedMsg.stickerMessage) {
        await socket.sendMessage(saveChat, {
          image: media.buffer,
          caption: `Sticker saved from ${sender}`
        });
      }

    // 📝 TEXT STATUS
    } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
      const text =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text;

      await socket.sendMessage(saveChat, {
        text: `Text saved from ${sender}:\n\n${text}`
      });

    // 🔁 FALLBACK (forward)
    } else {
      if (typeof socket.copyNForward === 'function') {
        try {
          await socket.copyNForward(saveChat, msg.key, true);
        } catch {}
      }
    }

  } catch (error) {
    console.error('*මොකද්ද අප්පා ඒ උනේ අවුලක් වගේ 😒*', error);
  }
  break;
}

// ====================Status Save======================

case 'sv':
case 'save': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg) {
      return await socket.sendMessage(
        sender,
        { text: '*❌ Please reply to a Once View / status / media message to save it.*' },
        { quoted: msg }
      );
    }

    // 💾 react
    try {
      await socket.sendMessage(sender, {
        react: { text: '💾', key: msg.key }
      });
    } catch (e) {}

    // 🔴 Always save to OWNER
    const saveChat = socket.user.id;

    // 🖼️📹🎧📄🪄 MEDIA
    if (
      quotedMsg.imageMessage ||
      quotedMsg.videoMessage ||
      quotedMsg.audioMessage ||
      quotedMsg.documentMessage ||
      quotedMsg.stickerMessage
    ) {
      const media = await downloadQuotedMedia(quotedMsg);

      if (!media || !media.buffer) {
        return await socket.sendMessage(
          sender,
          { text: '❌ Failed to download media.' },
          { quoted: msg }
        );
      }

      if (quotedMsg.imageMessage) {
        await socket.sendMessage(saveChat, {
          image: media.buffer,
          caption: media.caption || `✅ Image Saved\nFrom: ${sender}`
        });

      } else if (quotedMsg.videoMessage) {
        await socket.sendMessage(saveChat, {
          video: media.buffer,
          mimetype: media.mime || 'video/mp4',
          caption: media.caption || `✅ Video Saved\nFrom: ${sender}`
        });

      } else if (quotedMsg.audioMessage) {
        await socket.sendMessage(saveChat, {
          audio: media.buffer,
          mimetype: media.mime || 'audio/mp4',
          ptt: media.ptt || false
        });

      } else if (quotedMsg.documentMessage) {
        const fname =
          media.fileName ||
          `saved_document.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;

        await socket.sendMessage(saveChat, {
          document: media.buffer,
          fileName: fname,
          mimetype: media.mime || 'application/octet-stream'
        });

      } else if (quotedMsg.stickerMessage) {
        await socket.sendMessage(saveChat, {
          image: media.buffer,
          caption: `✅ Sticker Saved\nFrom: ${sender}`
        });
      }

      await socket.sendMessage(
        sender,
        { text: '🔥 *Saved successfully to bot owner!*' },
        { quoted: msg }
      );

    // 📝 TEXT STATUS
    } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
      const text =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text;

      await socket.sendMessage(saveChat, {
        text: `✅ *Text Saved*\n\n${text}\n\nFrom: ${sender}`
      });

      await socket.sendMessage(
        sender,
        { text: '🔥 *Text saved successfully!*' },
        { quoted: msg }
      );

    // 🔁 FALLBACK (forward)
    } else {
      if (typeof socket.copyNForward === 'function') {
        try {
          await socket.copyNForward(saveChat, msg.key, true);
          await socket.sendMessage(
            sender,
            { text: '🔥 *Saved (forwarded) successfully!*' },
            { quoted: msg }
          );
        } catch (e) {
          await socket.sendMessage(
            sender,
            { text: '❌ Could not forward the message.' },
            { quoted: msg }
          );
        }
      } else {
        await socket.sendMessage(
          sender,
          { text: '❌ Unsupported message type.' },
          { quoted: msg }
        );
      }
    }

  } catch (error) {
    console.error('❌ VV Save Error:', error);
    await socket.sendMessage(
      sender,
      { text: '*❌ Failed to save Once View / status*' },
      { quoted: msg }
    );
  }
  break;
}

// ==========================================

case 'alive': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `
🤖 *${botName}* is online!*2026 අලුත් අවුරුද්ද ඔබටත් ඔබගේ පවුලේ සැමටත් 🎉 සාමය සතුට පිරි සුබම සුභ අලුත් අවුරුද්දක් වේවා 🎉💗🎊🥰🌸*


👑 *Owner*: ${config.OWNER_NAME || 'RASHU'}
⏳ *Uptime*: ${hours}h ${minutes}m ${seconds}s
☁️ *Platform*: ${process.env.PLATFORM || 'Heroku'}
🔗 *Prefix*: ${config.PREFIX}
`;

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🔥 ${botName} ALIVE 🔥`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

// ---------------------- PING ----------------------
case 'ping': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PING" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const text = `
*╭──────────────┈⊷*
*│ ⚡ ${botName} 𝐒𝐏𝐄𝐄𝐃 🧸*
*╰──────────────┈⊷*
*╭──────────────┈⊷*
*│ 𝐏ɪɴɢ:* ${latency}ᴍꜱ
*│ 𝐓ɪᴍᴇ 𝐎ꜰ 𝐒ᴇʀᴠᴇʀ:* ${new Date().toLocaleString()}
*╰──────────────┈⊷*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `> *ᴘᴏᴡᴇʀᴅ ʙʏ ${botName} 🎀*`,
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 𝐌𝐄𝐍𝐔 𝐋𝐈𝐒𝐓" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('ping error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get ping.' }, { quoted: msg });
  }
  break;
}


case 'rashu': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `*꧁🧸⃟♥️⃟🎀⃟ 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐃 ⃟🎀⃟♥️⃟🧸꧂*`;

    const buttons = [
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "🎀 𝐎𝐖𝐍𝐄𝐑" }, type: 1 },
      { buttonId: `${config.PREFIX}system`, buttonText: { displayText: "🎀 𝐒𝐘𝐒𝐓𝐄𝐌" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🎀 𝐒𝐏𝐄𝐄𝐃" }, type: 1 },
      { buttonId: `${config.PREFIX}bots`, buttonText: { displayText: "🎀 𝐃𝐄𝐏𝐋𝐎𝐘" }, type: 1 },
      { buttonId: `${config.PREFIX}pair`, buttonText: { displayText: "🎀 𝐂𝐎𝐍𝐍𝐄𝐂𝐓 " }, type: 1 },
      { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🎀 𝐎𝐍𝐋𝐈𝐍𝐄" }, type: 1 },
      { buttonId: `${config.PREFIX}system`, buttonText: { displayText: "🎀 𝐀𝐁𝐎𝐔𝐓" }, type: 1 },
      { buttonId: `${config.PREFIX}help`, buttonText: { displayText: "🎀 𝐋𝐀𝐍𝐆𝐔𝐀𝐆𝐄" }, type: 1 },
      { buttonId: `${config.PREFIX}rashu`, buttonText: { displayText: "🎀 𝐆𝐑𝐎𝐔𝐏" }, type: 1 },
      { buttonId: `${config.PREFIX}pair`, buttonText: { displayText: "🎀 𝐒𝐔𝐏𝐏𝐎𝐑𝐓" }, type: 1 },
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "🎀 𝐂𝐎𝐌𝐌𝐀𝐍𝐃" }, type: 1 },
      { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🎀 𝐎𝐍𝐋𝐈𝐍𝐄" }, type: 1 },
      { buttonId: `${config.PREFIX}st`, buttonText: { displayText: "🎀 𝐒𝐄𝐓𝐓𝐈𝐍𝐆" }, type: 1 },
      { buttonId: `${config.PREFIX}nipun`, buttonText: { displayText: "🎀 𝐍𝐀𝐌𝐄" }, type: 1 },
      { buttonId: `${config.PREFIX}rashu1`, buttonText: { displayText: "🎀 𝐁𝐔𝐆" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `⚠️ ${botName} 𝐁𝐎𝐓 🎀`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send Bots status.' }, { quoted: msg });
  }
  break;
}

case 'fo': {
    try {
        if (!isOwner) return reply("Owner Only ❌");

        if (!q) return reply("Please provide a target JID ❌");
        if (!quoted) return reply("Please reply to a message ❌");

        // Quoted message real object
        const msg = quoted.message || quoted.fakeObj?.message;
        if (!msg) return reply("Invalid quoted message ❌");

        // Forward message content
        const forwardContent = await conn.generateForwardMessageContent(
            msg,
            false // true = force forward (show forwarded)
        );

        const waMessage = await conn.generateWAMessageFromContent(
            q,
            forwardContent,
            {
                userJid: conn.user.id
            }
        );

        await conn.relayMessage(q, waMessage.message, {
            messageId: waMessage.key.id
        });

        reply(
            `*${botName}*\n\n✅ Message forwarded successfully\n\n📌 To: ${q}`
        );

    } catch (err) {
        console.error("FORWARD ERROR:", err);
        reply("❌ Failed to forward message");
    }
}
break;

			  case 'system': {
    try {
        const axios = require('axios');
        const os = require('os');
        const process = require('process');

        // Config & Bot Name Load
        const sanitized = (sender || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
        
        // --- 1. System Info Calculations ---
        
        // RAM Usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const formatSize = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        
        // Uptime Calculation
        const uptime = process.uptime();
        const days = Math.floor(uptime / (24 * 60 * 60));
        const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // Host Info
        const platform = os.platform();
        const arch = os.arch();
        const cpu = os.cpus()[0]?.model || 'Unknown CPU';
        const cores = os.cpus().length;

        // --- 2. Prepare Images & Fake Data ---

        // Preview Image URL
        const previewImgUrl = 'https://files.catbox.moe/q7a9q9.jpeg';
        
        // Fetch Image Buffer for Thumbnail (Required for PDF preview)
        const thumbBuffer = await axios.get(previewImgUrl, { responseType: 'arraybuffer' }).then(res => res.data);

        // Fake File Size (100 TB in bytes)
        // 100 TB = 100 * 1024 * 1024 * 1024 * 1024
        const fakeFileSize = 109951162777600; 

        // Fake Quote Card
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "DTEC_SYSTEM_V1" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName}\nFN:${botName}\nEND:VCARD` } }
        };

        // --- 3. Build Caption ---
        
        const caption = `
┌───────────────────────
│ 🖥️ *SYSTEM STATUS REPORT*
│ 
│ 🤖 *Bot Name:* ${botName}
│ ⏱️ *Uptime:* ${uptimeStr}
│ 
│ 📟 *RAM Usage:* ${formatSize(usedMem)} / ${formatSize(totalMem)}
│ 
│ 💻 *Server Info:*
│ ⚡ *Platform:* ${platform.toUpperCase()} (${arch})
│ 🧠 *CPU:* ${cores} Cores
│ ⚙️ *Model:* ${cpu}
│ 
│ 📅 *Date:* ${new Date().toLocaleDateString()}
│ ⌚ *Time:* ${new Date().toLocaleTimeString()}
└───────────────────────
> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*
`;

        // --- 4. Send Message (PDF Type) ---

        await socket.sendMessage(sender, {
            document: { url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' }, // Small dummy PDF link
            mimetype: 'application/pdf',
            fileName: `🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉`, // File Name
            fileLength: fakeFileSize.toString(), // 100TB Trick
            pageCount: 2025, // Fake page count
            caption: caption,
            jpegThumbnail: thumbBuffer, // The image preview
            contextInfo: {
                externalAdReply: {
                    title: "🚀 SYSTEM PERFORMANCE: MAXIMUM",
                    body: `Running on ${platform} server`,
                    thumbnail: thumbBuffer,
                    sourceUrl: "https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23", // Your channel link
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        console.error('System command error:', e);
        await socket.sendMessage(sender, { text: '*❌ Error fetching system info!*' });
    }
    break;
}
case 'activesessions':
case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Permission check - only owner and admins can use this
    const admins = await loadAdminsFromMongo();
    const normalizedAdmins = (admins || []).map(a => (a || '').toString());
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

    if (!isOwner && !isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ Permission denied. Only bot owner or admins can check active sessions.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let text = `🤖 *ACTIVE SESSIONS - ${botName}*\n\n`;
    text += `📊 *Total Active Sessions:* ${activeCount}\n\n`;

    if (activeCount > 0) {
      text += `📱 *Active Numbers:*\n`;
      activeNumbers.forEach((num, index) => {
        text += `${index + 1}. ${num}\n`;
      });
    } else {
      text += `⚠️ No active sessions found.`;
    }

    text += `\n🕒 Checked at: ${getSriLankaTimestamp()}`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📊 ${botName} SESSION STATUS`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
        { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('activesessions error', e);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to fetch active sessions information.' 
    }, { quoted: msg });
  }
  break;
}

case 'help': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `*🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 𝐁𝐎𝐓 𝐋𝐀𝐍𝐆𝐔𝐀𝐆𝐄.....*

*ඔබගෙ බාශාව අනුව පහත බොත්තම ස්පර්ශ කරන්න*

*Touch the button below according to your language*

अपनी भाषा के अनुसार नीचे दिए गए बटन को स्पर्श करें।`;

    const buttons = [
      { buttonId: `${config.PREFIX}sllist`, buttonText: { displayText: "🇱🇰 සිංහල" }, type: 1 },
      { buttonId: `${config.PREFIX}enlist`, buttonText: { displayText: "🇮🇸 ENGLISH" }, type: 1 },
      { buttonId: `${config.PREFIX}hilist`, buttonText: { displayText: "🇹🇯 हिंदी" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🔐 ${botName} Language.`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

case 'sllist': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `*🇱🇰👑 QUEEN RASHU MINI WHATSAPP BOT 👑🇱🇰*

_🌸 ඔබට සුබ දවසක් වේවා! 🌸_

_💖 QUEEN RASHU MINI BOT යනු_
*ඔබගේ වට්සැප් අත්දැකීම තවත් පහසු, වේගවත්, ආරක්ෂිත සහ විනෝදජනක කිරීමට නිර්මාණය කර ඇති ස්වයංක්‍රීය බොට් එකකි 🤖✨*

━━━━━━━━━━━━━━━━━━━━
*📌 බොට් භාවිතයට පෙර අනිවාර්යයෙන් දැනගත යුතු කරුණු*
━━━━━━━━━━━━━━━━━━━━
_⚠️ බොට්ට විදාන ලබාදෙන විට_
*👉 විදානයට ඉදිරියෙන් ( . ) ඩොට් ලකුණ යෙදීම අනිවාර්ය වේ.*
📝 උදාහරණයක්:
.menu
❗ ඩොට් ලකුණ නොමැතිව යවන විදාන
➡️ බොට් විසින් පිළිතුරු ලබා නොදේ.
━━━━━━━━━━━━━━━━━━━━
📜 මූලික විදාන
━━━━━━━━━━━━━━━━━━━━
📖 .menu
➡️ බොට් තුළ ඇති සියලුම විදාන එකම ලැයිස්තුවක් ලෙස දැකගත හැක.
🟢 .alive
➡️ බොට් දැනට ක්‍රියාත්මකද කියා පරීක්ෂා කරගත හැක.
⚡ .ping
➡️ බොට්ගේ ප්‍රතිචාර වේගය පරීක්ෂා කරගත හැක.
🖥️ .system
➡️ බොට්ගේ ක්‍රියාත්මක තත්ත්වය සහ පද්ධති තොරතුරු ලබාගත හැක.
━━━━━━━━━━━━━━━━━━━━
👮 පරිපාලකයින් සඳහා විදාන
━━━━━━━━━━━━━━━━━━━━
👑 .kick
➡️ කණ්ඩායමෙන් සඳහන් කළ සාමාජිකයෙකු ඉවත් කිරීමට.
🔇 .mute
➡️ කණ්ඩායම තුළ පණිවිඩ යැවීම තාවකාලිකව නවත්වීමට.
🔊 .unmute
➡️ නැවත පණිවිඩ යැවීමට අවසර ලබාදීමට.
📌 .setdesc
➡️ කණ්ඩායම් විස්තරය වෙනස් කිරීමට.
━━━━━━━━━━━━━━━━━━━━
🎉 විනෝදාත්මක විදාන
━━━━━━━━━━━━━━━━━━━━
😂 .fun
➡️ හිනාවෙන පණිවිඩයක් ලබාගැනීමට.
❤️ .love
➡️ ආදරණීය වචන සහ පණිවිඩ ලබාගැනීමට.
🎲 .luck
➡️ ඔබගේ වාසනාව අද කොහොමද කියා බලන්න.
💌 .wish
➡️ ලස්සන සුභ පැතුම් පණිවිඩයක් ලබාගැනීමට.
━━━━━━━━━━━━━━━━━━━━
📜 නීති සහ අවවාද
━━━━━━━━━━━━━━━━━━━━
🚫 බොට් අනිසි ලෙස භාවිතා නොකරන්න.
🚫 අධික ලෙස පණිවිඩ යවමින් කරදර නොකරන්න.
🚫 වට්සැප් නීතිවලට විරුද්ධ ක්‍රියාකාරකම් වලට බොට් භාවිතා නොකරන්න.
⚠️ මෙම නීති උල්ලංඝනය කරන පුද්ගලයන්
➡️ ස්ථිරවම බොට් භාවිතයෙන් තහනම් විය හැක.
━━━━━━━━━━━━━━━━━━━━
💞 අවසන් පණිවිඩය
━━━━━━━━━━━━━━━━━━━━

👑 QUEEN RASHU MINI BOT
ඔබට හොඳම, ආරක්ෂිතම සහ විශ්වාසදායකම සේවාවක් ලබාදීමට සෑමවිටම සූදානම්!

📩 ගැටලුවක්, යෝජනාවක් හෝ උදව්වක් අවශ්‍ය නම්

👉 බොට් හිමිකරු වෙත දැනුම් දෙන්න 💗
_wa.me/94764085107_

🌸 සතුටින් භාවිතා කරන්න! 🌸
🤖👑✨`;

    const buttons = [
      { buttonId: `${config.PREFIX}help`, buttonText: { displayText: "↩️ පිටුපසට" }, type: 1 },
      { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "↪️ ඉදිරියට" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*🇱🇰 ${botName} සින්හල බාශාවෙන්.*`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

case 'enlist': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `🇬🇧👑 QUEEN RASHU MINI WHATSAPP BOT 👑🇬🇧
🌸 Wishing you a very good day! 🌸
💖 QUEEN RASHU MINI BOT is a smart automated bot designed to make your WhatsApp experience easier, faster, safer, and more entertaining 🤖✨
━━━━━━━━━━━━━━━━━━━━
📌 Important things you must know before using the bot
━━━━━━━━━━━━━━━━━━━━
⚠️ When giving commands to the bot
👉 You must add a dot ( . ) before every command.
📝 Example:
.menu
❗ Commands sent without the dot
➡️ will not receive a response from the bot.
━━━━━━━━━━━━━━━━━━━━
📜 Basic Commands
━━━━━━━━━━━━━━━━━━━━
📖 .menu
➡️ View all available commands in one complete list.
🟢 .alive
➡️ Check whether the bot is currently active and running.
⚡ .ping
➡️ Check the bot’s response speed.
🖥️ .system
➡️ View the bot’s system status and technical information.
━━━━━━━━━━━━━━━━━━━━
👮 Admin Commands
━━━━━━━━━━━━━━━━━━━━
👑 .kick
➡️ Remove a mentioned member from the group.
🔇 .mute
➡️ Temporarily disable messaging in the group.
🔊 .unmute
➡️ Re-enable messaging in the group.
📌 .setdesc
➡️ Change the group description.
━━━━━━━━━━━━━━━━━━━━
🎉 Fun Commands
━━━━━━━━━━━━━━━━━━━━
😂 .fun
➡️ Get a funny message.
❤️ .love
➡️ Receive love messages and romantic words.
🎲 .luck
➡️ Check how lucky you are today.
💌 .wish
➡️ Get a beautiful wishing message.
━━━━━━━━━━━━━━━━━━━━
📜 Rules & Warnings
━━━━━━━━━━━━━━━━━━━━
🚫 Do not misuse the bot.
🚫 Do not spam commands excessively.
🚫 Do not use the bot for activities that violate WhatsApp rules.
⚠️ Users who break these rules
➡️ may be permanently banned from using the bot.
━━━━━━━━━━━━━━━━━━━━
💞 Final Message
━━━━━━━━━━━━━━━━━━━━
👑 QUEEN RASHU MINI BOT
is always ready to provide you with the best, safest, and most reliable service!

📩 If you need help, have suggestions, or face any issues

👉 Please contact the bot owner 💗
wa.me/94764085107

🌸 Enjoy using the bot! 🌸
🤖👑✨`;

    const buttons = [
      { buttonId: `${config.PREFIX}help`, buttonText: { displayText: "↩️ BACK" }, type: 1 },
      { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "↪️ GO" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🇮🇸 ${botName} Bot English`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}

case 'hilist': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const text = `🇹🇯👑 QUEEN RASHU MINI WHATSAPP BOT 👑🇹🇯
🌸 आपका दिन शुभ हो! 🌸

💖 QUEEN RASHU MINI BOT एक स्मार्ट ऑटोमेटेड बॉट है, जिसे आपके WhatsApp अनुभव को और भी आसान, तेज़, सुरक्षित और मनोरंजक बनाने के लिए डिज़ाइन किया गया है 🤖✨

━━━━━━━━━━━━━━━━━━━━
📌 बॉट का उपयोग करने से पहले ज़रूरी बातें
━━━━━━━━━━━━━━━━━━━━
⚠️ बॉट को कमांड देते समय
👉 हर कमांड से पहले डॉट ( . ) लगाना ज़रूरी है।

📝 उदाहरण:
.menu

❗ डॉट के बिना भेजे गए कमांड
➡️ बॉट की ओर से कोई जवाब नहीं मिलेगा।

━━━━━━━━━━━━━━━━━━━━
📜 बेसिक कमांड्स
━━━━━━━━━━━━━━━━━━━━
📖 .menu
➡️ सभी उपलब्ध कमांड्स की पूरी सूची देखें।

🟢 .alive
➡️ जाँचें कि बॉट चालू है या नहीं।

⚡ .ping
➡️ बॉट की प्रतिक्रिया की गति जाँचें।

🖥️ .system
➡️ बॉट की सिस्टम स्थिति और तकनीकी जानकारी देखें।

━━━━━━━━━━━━━━━━━━━━
👮 एडमिन कमांड्स
━━━━━━━━━━━━━━━━━━━━
👑 .kick
➡️ ग्रुप से किसी मेंशन किए गए सदस्य को हटाएँ।

🔇 .mute
➡️ ग्रुप में मैसेज भेजना अस्थायी रूप से बंद करें।

🔊 .unmute
➡️ ग्रुप में मैसेज भेजना दोबारा चालू करें।

📌 .setdesc
➡️ ग्रुप का विवरण (Description) बदलें।

━━━━━━━━━━━━━━━━━━━━
🎉 मज़ेदार कमांड्स
━━━━━━━━━━━━━━━━━━━━
😂 .fun
➡️ एक मज़ेदार संदेश प्राप्त करें।

❤️ .love
➡️ प्यार भरे संदेश और रोमांटिक शब्द पाएँ।

🎲 .luck
➡️ आज आपकी किस्मत कैसी है, जानें।

💌 .wish
➡️ एक सुंदर शुभकामना संदेश प्राप्त करें।

━━━━━━━━━━━━━━━━━━━━
📜 नियम और चेतावनियाँ
━━━━━━━━━━━━━━━━━━━━
🚫 बॉट का दुरुपयोग न करें।
🚫 बार-बार स्पैम कमांड न भेजें।
🚫 WhatsApp के नियमों का उल्लंघन करने वाली गतिविधियों के लिए बॉट का उपयोग न करें।

⚠️ जो यूज़र इन नियमों का उल्लंघन करेंगे
➡️ उन्हें बॉट के उपयोग से स्थायी रूप से प्रतिबंधित किया जा सकता है।

━━━━━━━━━━━━━━━━━━━━
💞 अंतिम संदेश
━━━━━━━━━━━━━━━━━━━━
👑 QUEEN RASHU MINI BOT
आपको सबसे बेहतरीन, सुरक्षित और भरोसेमंद सेवा देने के लिए हमेशा तैयार है!

📩 यदि आपको मदद चाहिए, कोई सुझाव है, या किसी समस्या का सामना कर रहे हैं

👉 कृपया बॉट के मालिक से संपर्क करें 💗
wa.me/94764085107

🌸 बॉट का आनंद लें! 🌸
🤖👑✨`;

    const buttons = [
      { buttonId: `${config.PREFIX}help`, buttonText: { displayText: "↩️ पीछे की ओर" }, type: 1 },
      { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "↪️ आगे" }, type: 1 }
    ];

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `🇹🇯 ${botName}बॉट हिंदी`,
      buttons,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('alive error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
  }
  break;
}



// ==================== MAIN MENU ====================


const { proto } = require('@whiskeysockets/baileys');

case 'menu': {
try { await socket.sendMessage(sender, { react: { text: "🎉", key: msg.key } }); } catch(e){}

try {
const startTime = socketCreationTime.get(number) || Date.now();
const uptime = Math.floor((Date.now() - startTime) / 1000);
const hours = Math.floor(uptime / 3600);
const minutes = Math.floor((uptime % 3600) / 60);
const seconds = Math.floor(uptime % 60);

// load per-session config (logo, botName)  
let userCfg = {};  
try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }  
catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }  

const title = userCfg.botName || '𝐐𝐔𝐄𝐄𝐍-𝐑𝐀𝐒𝐇𝐔-𝐌𝐃';  

// 🔹 Fake contact for Meta AI mention  
const shonux = {  
    key: {  
        remoteJid: "status@broadcast",  
        participant: "0@s.whatsapp.net",  
        fromMe: false,  
        id: "META_AI_FAKE_ID_MENU"  
    },  
    message: {  
        contactMessage: {  
            displayName: title,  
            vcard: `BEGIN:VCARD

VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
}
}
};

const text = `
_📜 ${title} Menu List ..._

*📄 𝐁օԵ 𝐍αตҽ :*
> ${title}
*⏳ 𝐑մղ 𝐓íตҽ :*
> ${hours}h ${minutes}m ${seconds}s
*🥷 𝐎աղҽɾ :*
> ${config.OWNER_NAME || 'Nipun Harshana'}
*📡 𝐕ҽɾsíօղ :*
> ${config.BOT_VERSION || '0.0001+'}

*🔽 Choose A Category From The Menu Below*

*© ᴘᴏᴡᴇʀᴅ ʙʏ ${title} 🎀*
`.trim();

const buttons = [  
  { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 Dᴀᴡɴʟᴏᴀᴅ Mᴇɴᴜ" }, type: 1 },  
  { buttonId: `${config.PREFIX}creative`, buttonText: { displayText: "🎨 Cʀᴇᴀᴛɪᴠᴇ Mᴇɴᴜ" }, type: 1 },  
  { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: "🛠️ Tᴏᴏʟꜱ Mᴇɴᴜ" }, type: 1 },  
  { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "👋 Aʟɪᴠᴇ" }, type: 1 },  
  { buttonId: `${config.PREFIX}system`, buttonText: { displayText: "🕹️ Sʏꜱᴛᴇᴍ" }, type: 1 }  
];  

const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';  
const useLogo = userCfg.logo || defaultImg;  

// build image payload (url or buffer)  
let imagePayload;  
if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };  
else {  
  try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }  
}  

await socket.sendMessage(sender, {  
  image: imagePayload,  
  caption: text,  
  footer: "⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤",  
  buttons,  
  headerType: 4  
}, { quoted: shonux });

} catch (err) {
console.error('menu command error:', err);
try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
}
break;
}


// ==================== DOWNLOAD MENU ====================
case 'download': {
  try { await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐐𝐔𝐄𝐄𝐍-𝐑𝐀𝐒𝐇𝐔-𝐌𝐃';
    
    const curHr = new Date().getHours();
    const greetings = curHr < 12 ? '𝐆𝐨𝐨𝐝 𝐌𝐨𝐫𝐧𝐢𝐧𝐠 ⛅' : curHr < 18 ? '𝐆𝐨𝐨𝐝 𝐀𝐟𝐭𝐞𝐫𝐧𝐨𝐨𝐧 🌞' : '𝐆𝐨𝐨𝐝 𝐄𝐯𝐞𝐧𝐢𝐧𝐠 🌙';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DL" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
    };

    const text = `*╭─「🔽 𝐃𝐀𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑 𝐋𝐈𝐒𝐓」 ──◉◉➢*   

*╭──────────◉◉➢*
*📱 ᴍᴇᴅɪᴀ & ꜱᴏᴄɪᴀʟ Dᴀᴡʟᴏᴀᴅ :*

* ${config.PREFIX}song 
> < ꜱᴏɴɢ ɴᴀᴍᴇ ᴏʀ ʟɪɴᴋ >
* ${config.PREFIX}csong
> < ᴊɪᴅ >< ꜱᴏɴɢ ɴᴀᴍᴇ >
* ${config.PREFIX}ringtone
> < ʀɪɴɢᴛᴏɴᴇ ɴᴀᴍᴇ >
* ${config.PREFIX}tiktok
> < ᴛɪᴋ ᴛᴏᴋ ᴜʀʟ >
* ${config.PREFIX}video
> < ᴠɪᴅᴇᴏ ɴᴀᴍᴇ ᴏʀ ʟɪɴᴋ >
* ${config.PREFIX}xvideo
> < ɴᴀᴍᴇ ᴏʀ ᴜʀʟ >
* ${config.PREFIX}xnxx
> < ɴᴀᴍᴇ ᴏʀ ᴜʀʟ >
* ${config.PREFIX}fb
> < ꜰʙ ᴜʀʟ >
* ${config.PREFIX}instagram
> < ɪɢ ᴜʀʟ >
* ${config.PREFIX}save
> < ꜱᴛᴀᴛᴜꜱ ʀᴇᴘʟʏ >

*📱 ᴀʟʟ ᴀᴘᴘ ᴀɴᴅ ꜰɪʟᴇ :*

* ${config.PREFIX}apk
> < ᴀᴘᴘ ɴᴀᴍᴇ ᴏʀ ᴘʟᴀʏꜱᴛᴏʀᴇ ᴜʀʟ >
* ${config.PREFIX}apksearch
> < ᴀᴘᴋ ɴᴀᴍᴇ >
* ${config.PREFIX}mediafire
> < ᴍᴇᴅɪᴀꜰɪʀᴇ ᴜʀʟ >
* ${config.PREFIX}gdrive
> < ɢᴅʀɪᴠᴇ ᴜʀʟ >

*╰──────────◉◉➢*

> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*
`.trim();

    const buttons = [
       { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Mᴀɪɴ Mᴇɴᴜ" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🔮 Bᴏᴛ Sᴘᴇᴇᴅ" }, type: 1 },
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Bᴏᴛ Oᴡɴᴇʀ" }, type: 1 }
    ];

    const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
    const useLogo = userCfg.logo || defaultImg;
    let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

    await socket.sendMessage(sender, {
      document: imagePayload,
      mimetype: 'application/pdf',
      fileName: `📥 𝐃𝐀𝐖𝐍𝐋𝐎𝐀𝐃 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
      fileLength: 109951162777600,
      pageCount: 100,
      caption: text,
      contextInfo: {
          externalAdReply: {
              title: greetings,
              body: "𝐅𝐢𝐥𝐞 𝐒𝐢𝐳𝐞 : 100𝐓𝐁",
              sourceUrl: 'https://whatsapp.com',
              mediaType: 1,
              renderLargerThumbnail: true
          }
      },
      buttons,
      headerType: 6
    }, { quoted: shonux });

  } catch (err) {
    console.error('download command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show download menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== CREATIVE MENU ====================
case 'creative': {
  try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐐𝐔𝐄𝐄𝐍-𝐑𝐀𝐒𝐇𝐔-𝐌𝐃';
    
    const curHr = new Date().getHours();
    const greetings = curHr < 12 ? '𝐆𝐨𝐨𝐝 𝐌𝐨𝐫𝐧𝐢𝐧𝐠 ⛅' : curHr < 18 ? '𝐆𝐨𝐨𝐝 𝐀𝐟𝐭𝐞𝐫𝐧𝐨𝐨𝐧 🌞' : '𝐆𝐨𝐨𝐝 𝐄𝐯𝐞𝐧𝐢𝐧𝐠 🌙';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_CR" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
    };

    const text = `*╭─「🔽 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐋𝐈𝐒𝐓」 ──◉◉➢*  

*╭──────────◉◉➢*
*🤖 *Aɪ Fᴇᴀᴛᴜʀᴇ :*

* ${config.PREFIX}ai
> < ᴍᴇꜱꜱᴀɢᴇ >
* ${config.PREFIX}aiimg
> < ᴘʀᴏᴍᴘᴛ >
* ${config.PREFIX}aiimg2
> < ᴘʀᴏᴍᴘᴛ >

*✍️ Tᴇxᴛ Tᴏᴏʟꜱ :*

* ${config.PREFIX}font
> < ʏᴏᴜʀ ᴛᴇxᴛ >
* ${config.PREFIX}short
> < ʏᴏᴜʀ ᴜʀʟ >
* ${config.PREFIX}calc
> < 70+68 >
* ${config.PREFIX}translate
> < ᴛᴇxᴛ >
 
*🖼️ Iᴍᴀɢᴇ Tᴏᴏʟꜱ :*

* ${config.PREFIX}getdp 
> < ᴅᴘ ᴅᴀᴡɴʟᴏᴀᴅ ɴᴜᴍʙᴇʀ >
*╰──────────◉◉➢*
> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*
`.trim();

    const buttons = [
       { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Mᴀɪɴ Mᴇɴᴜ" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🔮 Bᴏᴛ Sᴘᴇᴇᴅ" }, type: 1 },
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Bᴏᴛ Oᴡɴᴇʀ" }, type: 1 }
    ];

    const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
    const useLogo = userCfg.logo || defaultImg;
    let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

    await socket.sendMessage(sender, {
      document: imagePayload,
      mimetype: 'application/pdf',
      fileName: `🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
      fileLength: 109951162777600,
      pageCount: 100,
      caption: text,
      contextInfo: {
          externalAdReply: {
              title: greetings,
              body: "𝐅𝐢𝐥𝐞 𝐒𝐢𝐳𝐞 : 100𝐓𝐁",
              sourceUrl: 'https://whatsapp.com',
              mediaType: 1,
              renderLargerThumbnail: true
          }
      },
      buttons,
      headerType: 6
    }, { quoted: shonux });

  } catch (err) {
    console.error('creative command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show creative menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}

// ==================== TOOLS MENU ====================
case 'tools': {
  try { await socket.sendMessage(sender, { react: { text: "🛠️", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '© 𝐐𝐔𝐄𝐄𝐍-𝐑𝐀𝐒𝐇𝐔-𝐌𝐃';

    const curHr = new Date().getHours();
    const greetings = curHr < 12 ? '𝐆𝐨𝐨𝐝 𝐌𝐨𝐫𝐧𝐢𝐧𝐠 ⛅' : curHr < 18 ? '𝐆𝐨𝐨𝐝 𝐀𝐟𝐭𝐞𝐫𝐧𝐨𝐨𝐧 🌞' : '𝐆𝐨𝐨𝐝 𝐄𝐯𝐞𝐧𝐢𝐧𝐠 🌙';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_TL" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
    };

    const text = `*╭─「🔽 𝐓𝐎𝐎𝐋𝐒 𝐋𝐈𝐒𝐓」 ──◉◉➢*  

*╭──────────◉◉➢*
*🆔 Iɴꜰᴏ Tᴏᴏʟ :*

* ${config.PREFIX}jid
> < ᴄʜᴀᴛ / ɢʀᴏᴜᴘ ꜱᴇɴᴅ >
* ${config.PREFIX}cid
> < ᴄʜᴀɴɴᴇʟ ʟɪɴᴋ >
* ${config.PREFIX}system
> < ᴄʜᴇᴄᴋ ʙᴏᴛ ꜱʏꜱᴛᴇᴍ>

*👥 Gʀᴏᴜᴘ Tᴏᴏʟꜱ :*

* ${config.PREFIX}tagall
> < ᴛᴀɢ ᴍᴇꜱꜱᴀɢᴇ >
* ${config.PREFIX}hidetag
> < ᴛᴀɢ ᴍᴇꜱꜱᴀɢᴇ >
* ${config.PREFIX}online
> < ɢʀᴏᴜᴘ ꜱᴇɴᴅ >

*📰 Nᴇᴡꜱ Tᴏᴏʟ :*

* ${config.PREFIX}adanews
* ${config.PREFIX}sirasanews
* ${config.PREFIX}lankadeepanews
* ${config.PREFIX}gagananews
* ${config.PREFIX}gossip
* ${config.PREFIX}weather
* ${config.PREFIX}cricket
* ${config.PREFIX}google
* ${config.PREFIX}github

*🔐 Uꜱᴇʀ Mᴀɴᴀɢᴍᴇɴᴛ :*
* ${config.PREFIX}block
> < ʙʟᴏᴄᴋ ɴᴜᴍʙᴇʀ ᴛɪᴘᴇ >
* ${config.PREFIX}unblock
> < ᴜɴʙʟᴏᴄᴋ ɴᴜᴍʙᴇʀ ᴛɪᴘᴇ >
* ${config.PREFIX}prefix
> < ᴄʜᴀɴɢᴇ ʏᴏᴜʀ ᴘʀɪꜰɪx >
* ${config.PREFIX}autorecording
> < ᴀᴜᴛᴏ ʀᴇᴄᴏᴅɪɴɢ >
* ${config.PREFIX}mread
> < ᴀᴜᴛᴏ ᴍꜱɢ ʀᴇᴀᴅ ᴏɴ/ᴏꜰꜰ
* ${config.PREFIX}creject
> < ᴄᴀʟʟ.ʀᴇᴊᴇᴄᴛ ᴏɴ/ᴏꜰꜰ
* ${config.PREFIX}wtype
> < ᴘʀɪᴠᴇᴛ / ᴘᴜʙʟɪᴄ / ɢʀᴏᴜᴘ / ɪɴʙᴏx >
* ${config.PREFIX}arm
> < ᴀᴜᴛᴏ ꜱᴛᴀᴛᴜꜱ ʀᴇact ᴏɴ/ᴏꜰꜰ
* ${config.PREFIX}rstatus
> < ᴀᴜᴛᴏ ꜱᴛᴀᴛᴜꜱ ʀᴇᴀᴅ ᴏɴ/ᴏꜰꜰ
* ${config.PREFIX}botpresence
> < ʙᴏᴛ ᴏɴʟɪɴᴇ ᴏɴ/ᴏꜰꜰ >
* ${config.PREFIX}setlogo
> < ɪᴍᴀɢᴇ ᴜʀʟ ᴘᴀꜱᴛ >
* ${config.PREFIX}setbotname
> < ʏᴏᴜʀ ɴᴀᴍᴇ >
* ${config.PREFIX}resetconfig
* ${config.PREFIX}showconfig
* ${config.PREFIX}deleteme


*👥 Gᴏᴏɢʟᴇ Sᴇᴀʀᴄʜ Tᴏᴏʟ :*
* ${config.PREFIX}img
> < Qᴜᴇʀʏ >
* ${config.PREFIX}google
> < Qᴜᴇʀʏ >
 
*📊 Bᴏᴛ Sᴛᴀᴛᴜꜱ :*
* ${config.PREFIX}ping
* ${config.PREFIX}alive
*╰──────────◉◉➢*
> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*
`.trim();

    const buttons = [
       { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Mᴀɪɴ Mᴇɴᴜ" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🔮 Bᴏᴛ Sᴘᴇᴇᴅ" }, type: 1 },
      { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Bᴏᴛ Oᴡɴᴇʀ" }, type: 1 }  
        ];

    const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
    const useLogo = userCfg.logo || defaultImg;
    let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

    await socket.sendMessage(sender, {
      document: imagePayload,
      mimetype: 'application/pdf',
      fileName: `🛠️ 𝐓𝐎𝐎𝐋𝐒 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
      fileLength: 109951162777600,
      pageCount: 100,
      caption: text,
      contextInfo: {
          externalAdReply: {
              title: greetings,
              body: "𝐅𝐢𝐥𝐞 𝐒𝐢𝐳𝐞 : 100𝐓𝐁",
              sourceUrl: 'https://whatsapp.com',
              mediaType: 1,
              renderLargerThumbnail: true
          }
      },
      buttons,
      headerType: 6
    }, { quoted: shonux });

  } catch (err) {
    console.error('tools command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show tools menu.' }, { quoted: msg }); } catch(e){}
  }
  break;
}
                case 'song': {
                    const yts = require('yt-search');

                    function extractYouTubeId(url) {
                        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
                        const match = url.match(regex);
                        return match ? match[1] : null;
                    }

                    function convertYouTubeLink(input) {
                        const videoId = extractYouTubeId(input);
                        if (videoId) {
                            return `https://www.youtube.com/watch?v=${videoId}`;
                        }
                        return input;
                    }
                    
                    // 🔹 Fake contact for Meta AI mention
        const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_TT"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

                    const q = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

                    if (!q || q.trim() === '') {
                        return await socket.sendMessage(sender, {
                            text: '*`Need YT_URL or Title`*'
                        });
                    }

                    const fixedQuery = convertYouTubeLink(q.trim());
                    const search = await yts(fixedQuery);
                    const data = search.videos[0];
                    if (!data) {
                        return await socket.sendMessage(sender, {
                            text: '*`No results found`*'
                        });
                    }

                    const url = data.url;
                    const desc = `*🎧 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🌿**\n\n╭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▯●\n▮ \`• Title :\`  ${data.title}\n▯ \`• Duration :\` ${data.duration.timestamp}\n▮ \`• Views :\` ${data.views.toLocaleString()}\n▯ \`• Released Date :\` ${data.ago}\n╰▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▯●\n\n> *𝐏σωεɾ∂ 𝐁ყ ⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤ 🌿*`;

                    const buttons = [{
                            buttonId: `${config.PREFIX}audio ${url}`,
                            buttonText: {
                                displayText: '🎧 𝐀մժíօ'
                            },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}voice ${url}`,
                            buttonText: {
                                displayText: '🎤 𝐕օícҽ'
                            },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}document ${url}`,
                            buttonText: {
                                displayText: '📁 𝐃օcմตҽղԵ'
                            },
                            type: 1
                        }
                    ];

                    await socket.sendMessage(sender, {
                        buttons,
                        headerType: 1,
                        viewOnce: true,
                        caption: desc,
                        image: {
                            url: data.thumbnail
                        },
                        contextInfo: {
                            mentionedJid: [sender],
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363292101892024@newsletter',
                                newsletterName: '⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤',
                                serverMessageId: 143
                            }
                        }
                    }, {
                        quoted: botMention
                    });

                    break;
                }


                case 'audio': {
                    const axios = require('axios');
                    const videoUrl = args[0] || q;

                    try {
                        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=128`;
                        const apiRes = await axios.get(apiUrl, {
                            timeout: 15000
                        }).then(r => r.data).catch(() => null);

                        const downloadUrl = apiRes?.result?.download?.url;
                        const title = apiRes?.result?.title;

                        if (!downloadUrl) {
                            await socket.sendMessage(sender, {
                                text: '*MP3 API returned no download URL*'
                            }, {
                                quoted: botMention
                            });
                            break;
                        }

                        await socket.sendMessage(sender, {
                            audio: {
                                url: downloadUrl
                            },
                            mimetype: "audio/mpeg",
                            fileName: `${title}.mp3`
                        }, {
                            quoted: botMention
                        });

                    } catch {
                        await socket.sendMessage(sender, {
                            text: '*Error while processing audio request.*'
                        }, {
                            quoted: botMention
                        });
                    }
                    break;
                }

                case 'doc': {
                    const axios = require('axios');
                    const videoUrl = args[0] || q;

                    try {
                        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=360`;
                        const apiRes = await axios.get(apiUrl, {
                            timeout: 15000
                        }).then(r => r.data);

                        const video = apiRes?.results?.download;

                        if (!video?.url) {
                            await socket.sendMessage(sender, {
                                text: '*360p video not found*'
                            }, {
                                quoted: botMention
                            });

                            break;
                        }

                        await socket.sendMessage(sender, {
                            document: {
                                url: video.url
                            },
                            mimetype: 'video/mp4',
                            fileName: video.filename
                        }, {
                            quoted: botMention
                        });

                    } catch {
                        await socket.sendMessage(sender, {
                            text: '*Error while processing document request*'
                        }, {
                            quoted: botMention
                        });
                    }
                    break;
                }

                case 'vnote': {
                    const axios = require('axios');
                    const videoUrl = args[0] || q;

                    try {
                        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=360`;
                        const apiRes = await axios.get(apiUrl, {
                            timeout: 15000
                        }).then(r => r.data);

                        const video = apiRes?.results?.download;

                        if (!video?.url) {
                            await socket.sendMessage(sender, {
                                text: '*360p video not found*'
                            }, {
                                quoted: botMention
                            });

                            break;
                        }

                        await socket.sendMessage(sender, {
                            video: {
                                url: video.url
                            },
                            mimetype: 'video/mp4',
                            ptv: true,
                            fileName: video.filename
                        }, {
                            quoted: botMention
                        });

                    } catch {
                        await socket.sendMessage(sender, {
                            text: '*Error while processing video note*'
                        }, {
                            quoted: botMention
                        });
                    }
                    break;
                }

                case 'normal': {
                    const axios = require('axios');
                    const videoUrl = args[0] || q;

                    try {
                        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=360`;
                        const apiRes = await axios.get(apiUrl, {
                            timeout: 15000
                        }).then(r => r.data);

                        const video = apiRes?.results?.download;

                        if (!video?.url) {
                            await socket.sendMessage(sender, {
                                text: '*360p video not found*'
                            }, {
                                quoted: botMention
                            });

                            break;
                        }

                        await socket.sendMessage(sender, {
                            video: {
                                url: video.url
                            },
                            mimetype: 'video/mp4',
                            fileName: video.filename
                        }, {
                            quoted: botMention
                        });

                    } catch (e) {
                        await socket.sendMessage(sender, {
                            text: '*Error while processing video request*'
                        }, {
                            quoted: botMention
                        });
                    }
                    break;
                }
                
case 'voice': {
    const axios = require("axios");
    const fs = require("fs");
    const path = require("path");    
    const ffmpeg = require("fluent-ffmpeg");
    const ffmpegPath = require("ffmpeg-static");
    ffmpeg.setFfmpegPath(ffmpegPath);

    const videoUrl = args[0] || q;

    try {
        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=128`;
        const apiRes = await axios.get(apiUrl, { timeout: 15000 }).then(r => r.data);

        const downloadUrl = apiRes?.result?.download?.url;
        const title = apiRes?.result?.title || "voice";

        if (!downloadUrl) {
            await socket.sendMessage(sender, {
                text: '*MP3 API returned no download URL*'
            });
            break;
        }

        const tempMp3 = path.join("/tmp", `voice_${Date.now()}.mp3`);
        const tempOpus = path.join("/tmp", `voice_${Date.now()}.opus`);

        const mp3Data = await axios.get(downloadUrl, { responseType: "arraybuffer" });
        fs.writeFileSync(tempMp3, Buffer.from(mp3Data.data));

        await new Promise((resolve, reject) => {
            ffmpeg(tempMp3)
                .audioCodec("libopus")
                .format("opus")
                .save(tempOpus)
                .on("end", resolve)
                .on("error", reject);
        });

        const opusBuffer = fs.readFileSync(tempOpus);

        await socket.sendMessage(sender, {
            audio: opusBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
        });

        try { fs.unlinkSync(tempMp3); } catch {}
        try { fs.unlinkSync(tempOpus); } catch {}

    } catch {
        await socket.sendMessage(sender, {
            text: '*Error while processing audio request.*'
        });
    }
    break;
}
                
                case 'document': {
                    const axios = require('axios');
                    const videoUrl = args[0] || q;

                    try {
                        const apiUrl = `https://www.movanest.xyz/v2/yt-vidsave?url=${encodeURIComponent(videoUrl)}&quality=128`;
                        const apiRes = await axios.get(apiUrl, {
                            timeout: 15000
                        }).then(r => r.data).catch(() => null);

                        const downloadUrl = apiRes?.result?.download?.url;
                        const title = apiRes?.result?.title;

                        if (!downloadUrl) {
                            await socket.sendMessage(sender, {
                                text: '*MP3 API returned no download URL*'
                            }, {
                                quoted: botMention
                            });
                            break;
                        }

                        await socket.sendMessage(sender, {
                            document: {
                                url: downloadUrl
                            },
                            mimetype: "audio/mpeg",
                            fileName: `${title}.mp3`
                        }, {
                            quoted: botMention
                        });

                    } catch {
                        await socket.sendMessage(sender, {
                            text: '*Error while processing audio request.*'
                        }, {
                            quoted: botMention
                        });
                    }
                    break;
                }

                case 'video': {
                    const yts = require('yt-search');

                    function extractYouTubeId(url) {
                        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
                        const match = url.match(regex);
                        return match ? match[1] : null;
                    }
                    
                            const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_TT"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

                    function convertYouTubeLink(input) {
                        const videoId = extractYouTubeId(input);
                        if (videoId) {
                            return `https://www.youtube.com/watch?v=${videoId}`;
                        }
                        return input;
                    }

                    const q = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

                    if (!q || q.trim() === '') {
                        return await socket.sendMessage(sender, {
                            text: '*`Need YT_URL or Title`*'
                        });
                    }

                    const fixedQuery = convertYouTubeLink(q.trim());
                    const search = await yts(fixedQuery);
                    const data = search.videos[0];
                    if (!data) {
                        return await socket.sendMessage(sender, {
                            text: '*`No results found`*'
                        });
                    }

                    const url = data.url;
                    const desc = `*📽️ 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🌿*\n\n╭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▯●\n▮ \`• Title :\`  ${data.title}\n▯ \`• Duration :\` ${data.duration.timestamp}\n▮ \`• Views :\` ${data.views.toLocaleString()}\n▯ \`• Released Date :\` ${data.ago}\n╰▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▭▬▯●\n\n> *𝐏σωεɾ∂ 𝐁ყ ⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤ 🌿*`;

                    const buttons = [{
                            buttonId: `${config.PREFIX}normal ${url}`,
                            buttonText: {
                                displayText: '📽️ ѵíժҽօ'
                            },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}vnote ${url}`,
                            buttonText: {
                                displayText: '🎥 ѵíժҽօ ղօԵҽ'
                            },
                            type: 1
                        },
                        {
                            buttonId: `${config.PREFIX}doc ${url}`,
                            buttonText: {
                                displayText: '📁 ժօcմตҽղԵ'
                            },
                            type: 1
                        }
                    ];

                    await socket.sendMessage(sender, {
                        buttons,
                        headerType: 1,
                        viewOnce: true,
                        caption: desc,
                        image: {
                            url: data.thumbnail
                        },
                        contextInfo: {
                            mentionedJid: [sender],
                            forwardingScore: 999,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363292101892024@newsletter',
                                newsletterName: '⏤͟͟͞͞ 𝐂𝐘𝐁𝚵𝐑 ꪶ鍶ꫂ 𝐑𝐔𝐒𝐇 𝐌𝚯𝐃𝐙  ͟͞⏤',
                                serverMessageId: 143
                            }
                        }
                    }, {
                        quoted: botMention
                    });

                    break;
                }
                
                
case 'getdp': {
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = cfg.botName || BOT_NAME_FANCY;
        const logo = cfg.logo || config.RCD_IMAGE_PATH;

        const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { text: "❌ Please provide a number.\n\nUsage: .getdp <number>" });

        // 🔹 Format number into JID
        let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

        // 🔹 Try to get profile picture
        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(jid, "image");
        } catch {
            ppUrl = "https://files.catbox.moe/q7a9q9.jpeg"; // default dp
        }

        // 🔹 BotName meta mention
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETDP" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        // 🔹 Send DP with botName meta mention
        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: `🖼 *Profile Picture of* +${q}\nFetched by: ${botName}`,
            footer: `📌 ${botName} GETDP`,
            buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
            headerType: 4
        }, { quoted: metaQuote }); // <-- botName meta mention

    } catch (e) {
        console.log("❌ getdp error:", e);
        await socket.sendMessage(sender, { text: "⚠️ Error: Could not fetch profile picture." });
    }
    break;
}

case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `*Session config for ${sanitized}:*\n`;
    txt += `• Bot name: ${botName}\n`;
    txt += `• Logo: ${cfg.logo || config.RCD_IMAGE_PATH}\n`;
    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('showconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to load config.' }, { quoted: shonux });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can reset configs.' }, { quoted: shonux });
    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '✅ Session config reset to defaults.' }, { quoted: shonux });
  } catch (e) {
    console.error('resetconfig error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to reset config.' }, { quoted: shonux });
  }
  break;
}

case 'owner': {
  try { await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } }); } catch(e){}

  try {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_OWNER"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    const text = `
╭───❏ *OWNER INFO* ❏
│ 
│ 👑 *Name*: NipunHarshana
│ 📞 *Contact*: +94764085107
│
│ 💬 *For support or queries*
│ contact the owner directly
│ 
╰───────────────❏
`.trim();

    const buttons = [
      { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Mᴀɪɴ Mᴇɴᴜ" }, type: 1 },
      { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🔮 Bᴏᴛ Sᴘᴇᴇᴅ" }, type: 1 },
    ];

    await socket.sendMessage(sender, {
      text,
      footer: "👑 OWNER INFORMATION",
      buttons
    }, { quoted: shonux });

  } catch (err) {
    console.error('owner command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ Failed to show owner info.' }, { quoted: msg }); } catch(e){}
  }
  break;
}
case 'google':
case 'gsearch':
case 'search':
    try {
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, {
                text: '⚠️ *Please provide a search query.*\n\n*Example:*\n.google how to code in javascript'
            });
            break;
        }

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GOOGLE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        const query = args.join(" ");
        const apiKey = "AIzaSyDMbI3nvmQUrfjoCJYLS69Lej1hSXQjnWI";
        const cx = "baf9bdb0c631236e5";
        const apiUrl = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`;

        const response = await axios.get(apiUrl);

        if (response.status !== 200 || !response.data.items || response.data.items.length === 0) {
            await socket.sendMessage(sender, { text: `⚠️ *No results found for:* ${query}` }, { quoted: botMention });
            break;
        }

        let results = `🔍 *Google Search Results for:* "${query}"\n\n`;
        response.data.items.slice(0, 5).forEach((item, index) => {
            results += `*${index + 1}. ${item.title}*\n\n🔗 ${item.link}\n\n📝 ${item.snippet}\n\n`;
        });

        const firstResult = response.data.items[0];
        const thumbnailUrl = firstResult.pagemap?.cse_image?.[0]?.src || firstResult.pagemap?.cse_thumbnail?.[0]?.src || 'https://via.placeholder.com/150';

        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: results.trim(),
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: botMention });

    } catch (error) {
        console.error(`Google search error:`, error);
        await socket.sendMessage(sender, { text: `⚠️ *An error occurred while fetching search results.*\n\n${error.message}` });
    }
    break;
		case 'tourl':
case 'url':
case 'upload': {
    const axios = require('axios');
    const FormData = require('form-data');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    const mime = quoted?.quotedMessage?.imageMessage?.mimetype || 
                 quoted?.quotedMessage?.videoMessage?.mimetype || 
                 quoted?.quotedMessage?.audioMessage?.mimetype || 
                 quoted?.quotedMessage?.documentMessage?.mimetype;

    if (!quoted || !mime) {
        return await socket.sendMessage(sender, { text: '❌ *Please reply to an image or video.*' });
    }

    // Fake Quote for Style
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
        message: { contactMessage: { displayName: "RASHU MEDIA UPLOADER", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Catbox\nORG:Upload Service\nEND:VCARD` } }
    };

    let mediaType;
    let msgKey;
    
    if (quoted.quotedMessage.imageMessage) {
        mediaType = 'image';
        msgKey = quoted.quotedMessage.imageMessage;
    } else if (quoted.quotedMessage.videoMessage) {
        mediaType = 'video';
        msgKey = quoted.quotedMessage.videoMessage;
    } else if (quoted.quotedMessage.audioMessage) {
        mediaType = 'audio';
        msgKey = quoted.quotedMessage.audioMessage;
    } else if (quoted.quotedMessage.documentMessage) {
        mediaType = 'document';
        msgKey = quoted.quotedMessage.documentMessage;
    }

    try {
        // Using existing downloadContentFromMessage
        const stream = await downloadContentFromMessage(msgKey, mediaType);
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const ext = mime.split('/')[1] || 'tmp';
        const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFilePath, buffer);

        const form = new FormData();
        form.append('fileToUpload', fs.createReadStream(tempFilePath));
        form.append('reqtype', 'fileupload');

        const response = await axios.post('https://catbox.moe/user/api.php', form, { 
            headers: form.getHeaders() 
        });

        fs.unlinkSync(tempFilePath); // Cleanup

        const mediaUrl = response.data.trim();
        const fileSize = (buffer.length / 1024 / 1024).toFixed(2) + ' MB';
        const typeStr = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

        const txt = `
🔗 *MEDIA UPLOADER*

📂 *Type:* ${typeStr}
📊 *Size:* ${fileSize}

🚀 *Url:* ${mediaUrl}

> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*`;

        await socket.sendMessage(sender, { 
            text: txt,
            contextInfo: {
                externalAdReply: {
                    title: "Media Uploaded Successfully!",
                    body: "Click to view media",
                    thumbnailUrl: mediaUrl.match(/\.(jpeg|jpg|gif|png)$/) ? mediaUrl : "https://cdn-icons-png.flaticon.com/512/337/337946.png",
                    sourceUrl: mediaUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: metaQuote });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error uploading media.*' });
    }
}
break;
			  case 'img2pdf':
case 'topdf': {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!quoted || !quoted.quotedMessage?.imageMessage) {
        return await socket.sendMessage(sender, { text: '❌ *Please reply to an Image.*' });
    }

    // Fake Quote for Style
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_PDF" },
        message: { contactMessage: { displayName: "DTEC PDF CONVERTER", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:PDF Tools\nORG:Converter\nEND:VCARD` } }
    };

    try {
        // Using existing downloadContentFromMessage
        const stream = await downloadContentFromMessage(quoted.quotedMessage.imageMessage, 'image');
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const doc = new PDFDocument({ autoFirstPage: false });
        const pdfPath = path.join(os.tmpdir(), `dt_pdf_${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);

        doc.pipe(writeStream);

        const img = doc.openImage(buffer);
        doc.addPage({ size: [img.width, img.height] });
        doc.image(img, 0, 0);
        doc.end();

        await new Promise((resolve) => writeStream.on('finish', resolve));

        const pdfBuffer = fs.readFileSync(pdfPath);

        const txt = `
📄 *IMAGE TO PDF*

✅ *Status:* Conversion Successful!
📉 *Size:* ${(pdfBuffer.length / 1024).toFixed(2)} KB

> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*`;

        // Send PDF Document
        await socket.sendMessage(sender, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: 'Converted_Image.pdf',
            caption: txt,
            contextInfo: {
                externalAdReply: {
                    title: "PDF Created Successfully!",
                    body: "Rashu Mini Tools",
                    thumbnailUrl: "https://cdn-icons-png.flaticon.com/512/337/337946.png", // PDF Icon
                    sourceUrl: "https://wa.me/",
                    mediaType: 1,
                    renderLargerThumbnail: false
                }
            }
        }, { quoted: metaQuote });

        fs.unlinkSync(pdfPath); // Cleanup

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error converting to PDF.*' });
    }
}
break;
case 'img': {
    const q = body.replace(/^[.\/!]img\s*/i, '').trim();
    if (!q) return await socket.sendMessage(sender, {
        text: '🔍 Please provide a search query. Ex: `.img sunset`'
    }, { quoted: msg });

    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_IMG" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        const res = await axios.get(`https://allstars-apis.vercel.app/pinterest?search=${encodeURIComponent(q)}`);
        const data = res.data.data;
        if (!data || data.length === 0) return await socket.sendMessage(sender, { text: '❌ No images found for your query.' }, { quoted: botMention });

        const randomImage = data[Math.floor(Math.random() * data.length)];

        const buttons = [{ buttonId: `${config.PREFIX}img ${q}`, buttonText: { displayText: "⏩ Next Image" }, type: 1 }];

        const buttonMessage = {
            image: { url: randomImage },
            caption: `🖼️ *Image Search:* ${q}\n\n_Provided by ${botName}_`,
            footer: config.FOOTER || '> 🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉',
            buttons: buttons,
             headerType: 4,
            contextInfo: { mentionedJid: [sender] }
        };

        await socket.sendMessage(from, buttonMessage, { quoted: botMention });

    } catch (err) {
        console.error("Image search error:", err);
        await socket.sendMessage(sender, { text: '❌ Failed to fetch images.' }, { quoted: botMention });
    }
    break;
}
case 'gdrive': {
    try {
        const text = args.join(' ').trim();
        if (!text) return await socket.sendMessage(sender, { text: '⚠️ Please provide a Google Drive link.\n\nExample: `.gdrive <link>`' }, { quoted: msg });

        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const userCfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = userCfg.botName || BOT_NAME_FANCY;

        // 🔹 Meta AI fake contact mention
        const botMention = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GDRIVE" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
        };

        // 🔹 Fetch Google Drive file info
        const res = await axios.get(`https://saviya-kolla-api.koyeb.app/download/gdrive?url=${encodeURIComponent(text)}`);
        if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch file info.' }, { quoted: botMention });

        const file = res.data.result;

        // 🔹 Send as document
        await socket.sendMessage(sender, {
            document: { 
                url: file.downloadLink, 
                mimetype: file.mimeType || 'application/octet-stream', 
                fileName: file.name 
            },
            caption: `📂 *File Name:* ${file.name}\n💾 *Size:* ${file.size}\n\n_Provided by ${botName}_`,
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: botMention });

    } catch (err) {
        console.error('GDrive command error:', err);
        await socket.sendMessage(sender, { text: '❌ Error fetching Google Drive file.' }, { quoted: botMention });
    }
    break;
}


case 'adanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n📅 Date: ${n.date}\n⏰ Time: ${n.time}\n\n${n.desc}\n\n🔗 [Read more](${n.url})\n\n_Provided by ${botName}_`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('adanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: botMention });
  }
  break;
}
case 'sirasanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n📅 Date: ${n.date}\n⏰ Time: ${n.time}\n\n${n.desc}\n\n🔗 [Read more](${n.url})\n\n_Provided by ${botName}_`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('sirasanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' }, { quoted: botMention });
  }
  break;
}
case 'lankadeepanews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n📅 Date: ${n.date}\n⏰ Time: ${n.time}\n\n${n.desc}\n\n🔗 [Read more](${n.url})\n\n_Provided by ${botName}_`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('lankadeepanews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' }, { quoted: botMention });
  }
  break;
}
case 'gagananews': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
    if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: botMention });

    const n = res.data.result;
    const caption = `📰 *${n.title}*\n\n📅 Date: ${n.date}\n⏰ Time: ${n.time}\n\n${n.desc}\n\n🔗 [Read more](${n.url})\n\n_Provided by ${botName}_`;

    await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

  } catch (err) {
    console.error('gagananews error:', err);
    await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' }, { quoted: botMention });
  }
  break;
}


//💐💐💐💐💐💐






        case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide channel JID to unfollow. Example:\n.unfollow 1203633963799045644@newsletter' }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or admins can remove channels.' }, { quoted: shonux });
  }

  if (!jid.endsWith('@newsletter')) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Must end with @newsletter' }, { quoted: shonux });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: shonux });
  } catch (e) {
    console.error('unfollow error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to unfollow: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        // 🔹 Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // 🔹 Fake contact for Meta AI mention
        const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_TT"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const q = text.split(" ").slice(1).join(" ").trim();

        if (!q) {
            await socket.sendMessage(sender, { 
                text: '*🚫 Please provide a TikTok video link.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: botMention });
            return;
        }

        if (!q.includes("tiktok.com")) {
            await socket.sendMessage(sender, { 
                text: '*🚫 Invalid TikTok link.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: botMention });
            return;
        }

        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Downloading TikTok video...*' }, { quoted: botMention });

        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.data) {
            await socket.sendMessage(sender, { 
                text: '*🚩 Failed to fetch TikTok video.*',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: botMention });
            return;
        }

        const { title, like, comment, share, author, meta } = data.data;
        const videoUrl = meta.media.find(v => v.type === "video").org;

        const titleText = `*${botName} TIKTOK DOWNLOADER*`;
        const content = `┏━━━━━━━━━━━━━━━━\n` +
                        `┃👤 \`User\` : ${author.nickname} (@${author.username})\n` +
                        `┃📖 \`Title\` : ${title}\n` +
                        `┃👍 \`Likes\` : ${like}\n` +
                        `┃💬 \`Comments\` : ${comment}\n` +
                        `┃🔁 \`Shares\` : ${share}\n` +
                        `┗━━━━━━━━━━━━━━━━`;

        const footer = config.BOT_FOOTER || '';
        const captionMessage = formatMessage(titleText, content, footer);

        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            caption: captionMessage,
            contextInfo: { mentionedJid: [sender] },
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
            ]
        }, { quoted: botMention });

    } catch (err) {
        console.error("Error in TikTok downloader:", err);
        await socket.sendMessage(sender, { 
            text: '*❌ Internal Error. Please try again later.*',
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
            ]
        });
    }
    break;
}
case 'xvideo1': {
  try {
    // ---------------------------
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XVIDEO" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    // ---------------------------

    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Usage: .xvideo <url/query>*' }, { quoted: botMention });

    let video, isURL = false;
    if (args[0].startsWith('http')) { video = args[0]; isURL = true; } 
    else {
      await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } }, { quoted: botMention });
      const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(args.join(' '))}`);
      if (!s.data?.status || !s.data.result?.length) throw new Error('No results');
      video = s.data.result[0];
    }

    const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
    if (!dlRes.data?.status) throw new Error('Download API failed');

    const dl = dlRes.data.result;

    await socket.sendMessage(sender, {
      video: { url: dl.url },
      caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ? '' : `Duration: ${video.duration}`}\n👁️ Views: ${dl.views}\n👍 ${dl.likes} | 👎 ${dl.dislikes}\n\n_Provided by ${botName}_`,
      mimetype: 'video/mp4'
    }, { quoted: botMention });

  } catch (err) {
    console.error('xvideo error:', err);
    await socket.sendMessage(sender, { text: '*❌ Failed to fetch video*' }, { quoted: botMention });
  }
  break;
}
case 'xvideo': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XVIDEO2" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!args[0]) return await socket.sendMessage(sender, { text: '*❌ Usage: .xvideo2 <url/query>*' }, { quoted: botMention });

    let video = null, isURL = false;
    if (args[0].startsWith('http')) { video = args[0]; isURL = true; } 
    else {
      await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } }, { quoted: botMention });
      const s = await axios.get(`https://saviya-kolla-api.koyeb.app/search/xvideos?query=${encodeURIComponent(args.join(' '))}`);
      if (!s.data?.status || !s.data.result?.length) throw new Error('No results');
      video = s.data.result[0];
    }

    const dlRes = await axios.get(`https://saviya-kolla-api.koyeb.app/download/xvideos?url=${encodeURIComponent(isURL ? video : video.url)}`);
    if (!dlRes.data?.status) throw new Error('Download API failed');

    const dl = dlRes.data.result;

    await socket.sendMessage(sender, {
      video: { url: dl.url },
      caption: `*📹 ${dl.title}*\n\n⏱️ ${isURL ? '' : `Duration: ${video.duration}`}\n👁️ Views: ${dl.views}\n👍 Likes: ${dl.likes} | 👎 Dislikes: ${dl.dislikes}\n\n_Provided by ${botName}_`,
      mimetype: 'video/mp4'
    }, { quoted: botMention });

  } catch (err) {
    console.error('xvideo2 error:', err);
    await socket.sendMessage(sender, { text: '*❌ Failed to fetch video*' }, { quoted: botMention });
  }
  break;
}

// ============NEWUPDATE==============================
switch (command) {

/* ===================== XHAM SEARCH ===================== */
case 'xham': {
  const text = getText(msg);
  const query = text.replace(/^\S+\s*/, '').trim() || 'random';

  try {
    const res = await api.get(
      `https://movanest.zone.id/v2/xhamsearch?query=${encodeURIComponent(query)}`
    );

    if (!res.data || !res.data.results?.length)
      throw new Error('No results');

    const item = res.data.results[Math.floor(Math.random() * res.data.results.length)];
    const payload = JSON.stringify({
      u: item.url,
      t: item.title.substring(0, 30)
    });

    await socket.sendMessage(sender, {
      text: `🔥 *XHAM SEARCH*\n\n📖 ${item.title}\n⏱️ ${item.duration}`,
      buttons: [
        { buttonId: `.xham-dl ${payload}`, buttonText: { displayText: '▶️ View' }, type: 1 }
      ],
      headerType: 1
    }, { quoted: msg });

  } catch (e) {
    await socket.sendMessage(sender, {
      text: `❌ Xham Error\nReason: ${e.response?.status || 'API Down'}`
    });
  }
  break;
}

/* ===================== XHAM DOWNLOAD ===================== */
case 'xham-dl': {
  try {
    const text = getText(msg);
    const json = text.slice(text.indexOf('{'));
    const { u, t } = JSON.parse(json);

    const res = await api.get(
      `https://movanest.zone.id/v2/xhamdetail?url=${encodeURIComponent(u)}`
    );

    if (!res.data?.results?.videoUrl)
      throw new Error('Video not found');

    await socket.sendMessage(sender, {
      video: { url: res.data.results.videoUrl },
      caption: `🔥 ${t}`
    }, { quoted: msg });

  } catch (e) {
    await socket.sendMessage(sender, { text: '❌ Xham download failed' });
  }
  break;
}

case 'xham': {
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
        message: { contactMessage: { displayName: "DTEC XHAM GENERATOR", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:MovaNest\nORG:Xham Service\nEND:VCARD` } }
    };

  
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || 
                 msg.message?.videoMessage?.caption || '';

  
    const query = text.replace(/^\S+\s+/, '').trim() || 'random';

    if (!query) {
        return await socket.sendMessage(sender, { text: '❌ *Please provide a query.*' }, { quoted: metaQuote });
    }

    try {
        const searchResponse = await axios.get(`https://movanest.xyz/v2/xhamsearch?query=${encodeURIComponent(query)}`);
        const { results } = searchResponse.data;

        if (!results || results.length === 0) {
            await socket.sendMessage(sender, { text: '❌ *No results found.*' }, { quoted: metaQuote });
            break;
        }

        const randomItem = results[Math.floor(Math.random() * results.length)];
        const { title, duration, url } = randomItem; 

      
        const payloadNormal = JSON.stringify({ u: url, t: title.substring(0, 30), type: 'n' });
        const payloadDoc = JSON.stringify({ u: url, t: title.substring(0, 30), type: 'd' });

        const caption = `🔥 *Xham Search: ${query}*\n\n📖 *Title:* ${title}\n⏱️ *Duration:* ${duration}\n\nPowered by MovaNest API\n\n*Choose delivery method:*`;

        const buttons = [
            { buttonId: `${config.PREFIX}xham-dl ${payloadNormal}`, buttonText: { displayText: "▶️ View Normally" }, type: 1 },
            { buttonId: `${config.PREFIX}xham-dl ${payloadDoc}`, buttonText: { displayText: "📥 DL as Document" }, type: 1 }
        ];
        
        await socket.sendMessage(sender, { 
            text: caption, 
            buttons, 
            headerType: 1 
        }, { quoted: metaQuote });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error fetching Xham list.*' });
    }
    break;
}

case 'xham-dl': {
    try {
        const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                         msg.message?.templateButtonReplyMessage?.selectedId || 
                         msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';
        const jsonStartIndex = buttonId.indexOf('{');
        
        if (jsonStartIndex === -1) {
            console.log("Error: JSON not found in Button ID");
            break; 
        }

        const jsonStr = buttonId.slice(jsonStartIndex);
        const data = JSON.parse(jsonStr);
        const { u: pageUrl, t: title, type } = data;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const detailResponse = await axios.get(`https://movanest.xyz/v2/xhamdetail?url=${encodeURIComponent(pageUrl)}`);
        const { results: detailResult } = detailResponse.data;

        if (!detailResult || !detailResult.videoUrl) {
            await socket.sendMessage(sender, { text: '❌ *Failed to fetch video source.*' }, { quoted: msg });
            break;
        }

        const videoUrl = detailResult.videoUrl;
        const caption = `🔥 *Xham: ${title}*\n\nPowered by MovaNest API`;

        if (type === 'n') {
            await socket.sendMessage(sender, { video: { url: videoUrl }, caption: caption }, { quoted: msg });
        } else {
            const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
            await socket.sendMessage(sender, { document: { url: videoUrl }, mimetype: 'video/mp4', fileName: `${cleanTitle}.mp4`, caption: caption }, { quoted: msg });
        }

    } catch (e) {
        console.error("Xham Download Error:", e);
        await socket.sendMessage(sender, { text: '❌ *Error downloading video.*' }, { quoted: msg });
    }
    break;
}
case 'xnxx': {
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
        message: { contactMessage: { displayName: "DTEC XNXX GENERATOR", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:MovaNest\nORG:XNXX Service\nEND:VCARD` } }
    };

    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || 
                 msg.message?.videoMessage?.caption || '';
    const query = text.replace(/^\S+\s+/, '').trim() || 'random';

    if (!query) {
        return await socket.sendMessage(sender, { text: '❌ *Please provide a query. Example: .xnxx mom*' }, { quoted: metaQuote });
    }

    try {
   
        const response = await axios.get(`https://movanest.xyz/v2/xnxx?query=${encodeURIComponent(query)}`);
        const { result } = response.data;

        if (!result || result.length === 0) {
            await socket.sendMessage(sender, { text: '❌ *No results found.*' }, { quoted: metaQuote });
            break;
        }

    
        const randomItem = result[Math.floor(Math.random() * result.length)];
        const { title, info, link } = randomItem; 

        const cleanTitle = title.substring(0, 30);

        const caption = `🔥 *XNXX Search: ${query}*\n\n📖 *Title:* ${title}\n📊 *Info:* ${info}\n\n*Select Quality & Type:*\nPowered by MovaNest API`;

        const buttons = [

            { buttonId: `${config.PREFIX}xnxx-dl ${JSON.stringify({ u: link, t: cleanTitle, type: 'n', q: 'h' })}`, buttonText: { displayText: "▶️ Normal High" }, type: 1 },
            { buttonId: `${config.PREFIX}xnxx-dl ${JSON.stringify({ u: link, t: cleanTitle, type: 'n', q: 'l' })}`, buttonText: { displayText: "▶️ Normal Low" }, type: 1 },
            { buttonId: `${config.PREFIX}xnxx-dl ${JSON.stringify({ u: link, t: cleanTitle, type: 'd', q: 'h' })}`, buttonText: { displayText: "📥 Doc High" }, type: 1 },
            { buttonId: `${config.PREFIX}xnxx-dl ${JSON.stringify({ u: link, t: cleanTitle, type: 'd', q: 'l' })}`, buttonText: { displayText: "📥 Doc Low" }, type: 1 }
        ];
        
        await socket.sendMessage(sender, { 
            text: caption, 
            buttons, 
            headerType: 1 
        }, { quoted: metaQuote });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error fetching XNXX list.*' });
    }
    break;
}


case 'xnxx-dl': {
    try {
        
        const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                         msg.message?.templateButtonReplyMessage?.selectedId || 
                         msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';

  
        const jsonStartIndex = buttonId.indexOf('{');
        
        if (jsonStartIndex === -1) {
             console.log("Invalid Button Response: No JSON found");
             break;
        }

        const jsonStr = buttonId.slice(jsonStartIndex);
        const data = JSON.parse(jsonStr);
        const { u: pageUrl, t: title, type, q: quality } = data;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });


        const dlResponse = await axios.get(`https://movanest.xyz/v2/xnxx?url=${encodeURIComponent(pageUrl)}`);
        const dlResult = dlResponse.data.result;

        if (!dlResult || !dlResult.files) {
            await socket.sendMessage(sender, { text: '❌ *Failed to fetch download links.*' }, { quoted: msg });
            break;
        }

    
        const videoUrl = (quality === 'h') ? dlResult.files.high : dlResult.files.low;

        if (!videoUrl) {
            await socket.sendMessage(sender, { text: '❌ *Selected quality not available.*' }, { quoted: msg });
            break;
        }

        const caption = `🔥 *XNXX: ${title}*\n\n📺 *Quality:* ${quality === 'h' ? 'High' : 'Low'}\nPowered by MovaNest API`;


        if (type === 'n') {
            
            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                caption: caption
            }, { quoted: msg });
        } else {
           
            const cleanTitleName = (title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
            await socket.sendMessage(sender, {
                document: { url: videoUrl },
                mimetype: 'video/mp4',
                fileName: `${cleanTitleName}.mp4`,
                caption: caption
            }, { quoted: msg });
        }

    } catch (e) {
        console.error("XNXX Download Error:", e);
        await socket.sendMessage(sender, { text: '❌ *Error downloading video. Link might be expired.*' }, { quoted: msg });
    }
    break;
}

/* ===================== XNXX SEARCH ===================== */
case 'xnxx1': {
  const text = getText(msg);
  const query = text.replace(/^\S+\s*/, '').trim() || 'random';

  try {
    const res = await api.get(
      `https://movanest.zone.id/v2/xnxx?query=${encodeURIComponent(query)}`
    );

    if (!res.data?.result?.length)
      throw new Error('No results');

    const item = res.data.result[Math.floor(Math.random() * res.data.result.length)];
    const payload = JSON.stringify({
      u: item.link,
      t: item.title.substring(0, 30)
    });

    await socket.sendMessage(sender, {
      text: `🔥 *XNXX SEARCH*\n\n📖 ${item.title}`,
      buttons: [
        { buttonId: `.xnxx-dl ${payload}`, buttonText: { displayText: '▶️ View' }, type: 1 }
      ],
      headerType: 1
    }, { quoted: msg });

  } catch (e) {
    await socket.sendMessage(sender, {
      text: `❌ XNXX Error\nReason: ${e.response?.status || 'API Down'}`
    });
  }
  break;
}

/* ===================== XNXX DOWNLOAD ===================== */
case 'xnxx-dl': {
  try {
    const text = getText(msg);
    const json = text.slice(text.indexOf('{'));
    const { u, t } = JSON.parse(json);

    const res = await api.get(
      `https://movanest.zone.id/v2/xnxx?url=${encodeURIComponent(u)}`
    );

    const video = res.data?.result?.files?.high;
    if (!video) throw new Error();

    await socket.sendMessage(sender, {
      video: { url: video },
      caption: `🔥 ${t}`
    }, { quoted: msg });

  } catch {
    await socket.sendMessage(sender, { text: '❌ XNXX download failed' });
  }
  break;
}

/* ===================== AI CHAT ===================== */
case 'ai':
case 'chat':
case 'gpt': {
  const q = getText(msg).replace(/^\S+\s*/, '').trim();
  if (!q) break;

  try {
    const res = await api.get(
      `https://hercai.onrender.com/v3/hercai?question=${encodeURIComponent(q)}`
    );

    await socket.sendMessage(sender, {
      text: res.data.reply || '❌ AI error'
    }, { quoted: msg });

  } catch {
    await socket.sendMessage(sender, { text: '❌ AI Server Down' });
  }
  break;
}

/* ===================== AI IMAGE ===================== */
case 'aiimg': {
  const prompt = getText(msg).replace(/^\S+\s*/, '').trim();
  if (!prompt) break;

  try {
    const res = await api.get(
      `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`,
      { responseType: 'arraybuffer' }
    );

    await socket.sendMessage(sender, {
      image: Buffer.from(res.data),
      caption: `🎨 ${prompt}`
    }, { quoted: msg });

  } catch {
    await socket.sendMessage(sender, { text: '❌ Image generation failed' });
  }
  break;
}

}
// ==========================================

case 'xnx1x':
case 'xnxxv1ideo': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = userCfg.botName || BOT_NAME_FANCY;

    const botMention = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_XNXX" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!Array.isArray(config.PREMIUM) || !config.PREMIUM.includes(senderNumber)) 
      return await socket.sendMessage(sender, { text: '❗ This command is for Premium users only.' }, { quoted: botMention });

    if (!text) return await socket.sendMessage(sender, { text: '❌ Provide a search name. Example: .xnxx <name>' }, { quoted: botMention });

    await socket.sendMessage(from, { react: { text: "🎥", key: msg.key } }, { quoted: botMention });

    const res = await axios.get(`https://api.genux.me/api/download/xnxx-download?query=${encodeURIComponent(text)}&apikey=GENUX-SANDARUX`);
    const d = res.data?.result;
    if (!d || !d.files) return await socket.sendMessage(sender, { text: '❌ No results.' }, { quoted: botMention });

    await socket.sendMessage(from, { image: { url: d.image }, caption: `💬 *Title*: ${d.title}\n👀 *Duration*: ${d.duration}\n🗯 *Desc*: ${d.description}\n💦 *Tags*: ${d.tags || ''}` }, { quoted: botMention });

    await socket.sendMessage(from, { video: { url: d.files.high, fileName: d.title + ".mp4", mimetype: "video/mp4", caption: "*Done ✅*" } }, { quoted: botMention });

    await socket.sendMessage(from, { text: "*Uploaded ✅*" }, { quoted: botMention });

  } catch (err) {
    console.error('xnxx error:', err);
    await socket.sendMessage(sender, { text: "❌ Error fetching video." }, { quoted: botMention });
  }
  break;
}
case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {
    // ✅ Owner check removed — now everyone can use it!

    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 Fetching group list..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    // Sort by creation time (oldest to newest)
    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ No groups found!" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY || "CHMA MD";

    // ✅ Pagination setup — 10 groups per message
    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {
      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      // ✅ Build message for this page
      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'Unnamed Group';
        const jid = group.id;
        return `*${globalIndex}. ${subject}*\n👥 Members: ${memberCount}\n🆔 ${jid}`;
      }).join('\n\n');

      const textMsg = `📝 *Group List - ${botName}*\n\n📄 Page ${page + 1}/${totalPages}\n👥 Total Groups: ${groupArray.length}\n\n${groupList}`;

      await socket.sendMessage(sender, {
        text: textMsg,
        footer: `🤖 Powered by ${botName}`
      });

      // Add short delay to avoid spam
      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ Failed to fetch group list. Please try again later." 
    }, { quoted: msg });
  }
  break;
}
case 'nanobanana': {
  const fs = require('fs');
  const path = require('path');
  const { GoogleGenAI } = require("@google/genai");

  // 🧩 Helper: Download quoted image
  async function downloadQuotedImage(socket, msg) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx || !ctx.quotedMessage) return null;

      const quoted = ctx.quotedMessage;
      const imageMsg = quoted.imageMessage || quoted[Object.keys(quoted).find(k => k.endsWith('Message'))];
      if (!imageMsg) return null;

      if (typeof socket.downloadMediaMessage === 'function') {
        const quotedKey = {
          remoteJid: msg.key.remoteJid,
          id: ctx.stanzaId,
          participant: ctx.participant || undefined
        };
        const fakeMsg = { key: quotedKey, message: ctx.quotedMessage };
        const stream = await socket.downloadMediaMessage(fakeMsg, 'image');
        const bufs = [];
        for await (const chunk of stream) bufs.push(chunk);
        return Buffer.concat(bufs);
      }

      return null;
    } catch (e) {
      console.error('downloadQuotedImage err', e);
      return null;
    }
  }

  // ⚙️ Main command logic
  try {
    const promptRaw = args.join(' ').trim();
    if (!promptRaw && !msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      return await socket.sendMessage(sender, {
        text: "📸 *Usage:* `.nanobanana <prompt>`\n💬 Or reply to an image with `.nanobanana your prompt`"
      }, { quoted: msg });
    }

    await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });

    const imageBuf = await downloadQuotedImage(socket, msg);
    await socket.sendMessage(sender, {
      text: `🔮 *Generating image...*\n🖊️ Prompt: ${promptRaw || '(no text)'}\n📷 Mode: ${imageBuf ? 'Edit (Image + Prompt)' : 'Text to Image'}`
    }, { quoted: msg });

    // 🧠 Setup Gemini SDK
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "AIzaSyB6ZQwLHZFHxDCbBFJtc0GIN2ypdlga4vw"
    });

    // 🧩 Build contents
    const contents = imageBuf
      ? [
          { role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imageBuf.toString("base64") } }, { text: promptRaw }] }
        ]
      : [
          { role: "user", parts: [{ text: promptRaw }] }
        ];

    // ✨ Generate Image using Gemini SDK
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
    });

    // 🖼️ Extract Image Data
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) {
      console.log('Gemini response:', response);
      throw new Error('⚠️ No image data returned from Gemini API.');
    }

    const imageData = part.inlineData.data;
    const buffer = Buffer.from(imageData, "base64");

    const tmpPath = path.join(__dirname, `gemini-nano-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buffer);

    await socket.sendMessage(sender, {
      image: fs.readFileSync(tmpPath),
      caption: `✅ *Here you go!*\n🎨 Prompt: ${promptRaw}`
    }, { quoted: msg });

    try { fs.unlinkSync(tmpPath); } catch {}

  } catch (err) {
    console.error('nanobanana error:', err);
    await socket.sendMessage(sender, { text: `❌ *Error:* ${err.message || err}` }, { quoted: msg });
  }
  break;
}


case 'savecontact':
case 'gvcf2':
case 'scontact':
case 'savecontacts': {
  try {
    const text = args.join(" ").trim(); // ✅ Define text variable

    if (!text) {
      return await socket.sendMessage(sender, { 
        text: "📌 *Usage:* .savecontact <group JID>\n📥 Example: .savecontact 9477xxxxxxx-123@g.us" 
      }, { quoted: msg });
    }

    const groupJid = text.trim();

    // ✅ Validate JID
    if (!groupJid.endsWith('@g.us')) {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID*. Must end with @g.us" 
      }, { quoted: msg });
    }

    let groupMetadata;
    try {
      groupMetadata = await socket.groupMetadata(groupJid);
    } catch {
      return await socket.sendMessage(sender, { 
        text: "❌ *Invalid group JID* or bot not in that group.*" 
      }, { quoted: msg });
    }

    const { participants, subject } = groupMetadata;
    let vcard = '';
    let index = 1;

    await socket.sendMessage(sender, { 
      text: `🔍 Fetching contact names from *${subject}*...` 
    }, { quoted: msg });

    // ✅ Loop through each participant
    for (const participant of participants) {
      const num = participant.id.split('@')[0];
      let name = num; // default name = number

      try {
        // Try to fetch from contacts or participant
        const contact = socket.contacts?.[participant.id] || {};
        if (contact?.notify) name = contact.notify;
        else if (contact?.vname) name = contact.vname;
        else if (contact?.name) name = contact.name;
        else if (participant?.name) name = participant.name;
      } catch {
        name = `Contact-${index}`;
      }

      // ✅ Add vCard entry
      vcard += `BEGIN:VCARD\n`;
      vcard += `VERSION:3.0\n`;
      vcard += `FN:${index}. ${name}\n`; // 👉 Include index number + name
      vcard += `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\n`;
      vcard += `END:VCARD\n`;
      index++;
    }

    // ✅ Create a safe file name from group name
    const safeSubject = subject.replace(/[^\w\s]/gi, "_");
    const tmpDir = path.join(os.tmpdir(), `contacts_${Date.now()}`);
    fs.ensureDirSync(tmpDir);

    const filePath = path.join(tmpDir, `contacts-${safeSubject}.vcf`);
    fs.writeFileSync(filePath, vcard.trim());

    await socket.sendMessage(sender, { 
      text: `📁 *${participants.length}* contacts found in group *${subject}*.\n💾 Preparing VCF file...`
    }, { quoted: msg });

    await delay(1500);

    // ✅ Send the .vcf file
    await socket.sendMessage(sender, {
      document: fs.readFileSync(filePath),
      mimetype: 'text/vcard',
      fileName: `contacts-${safeSubject}.vcf`,
      caption: `✅ *Contacts Exported Successfully!*\n👥 Group: *${subject}*\n📇 Total Contacts: *${participants.length}*\n\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝙲𝙷𝙼𝙰 𝙼𝙳`
    }, { quoted: msg });

    // ✅ Cleanup temp file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError);
    }

  } catch (err) {
    console.error('Save contact error:', err);
    await socket.sendMessage(sender, { 
      text: `❌ Error: ${err.message || err}` 
    }, { quoted: msg });
  }
  break;
}

case 'font': {
    const axios = require("axios");

    // ?? Load bot name dynamically
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    // 🔹 Fake contact for Meta AI mention
    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_FONT"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    const q =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';

    const text = q.trim().replace(/^.fancy\s+/i, ""); // remove .fancy prefix

    if (!text) {
        return await socket.sendMessage(sender, {
            text: `❎ *Please provide text to convert into fancy fonts.*\n\n📌 *Example:* \`.font yasas\``
        }, { quoted: botMention });
    }

    try {
        const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
        const response = await axios.get(apiUrl);

        if (!response.data.status || !response.data.result) {
            return await socket.sendMessage(sender, {
                text: "❌ *Error fetching fonts from API. Please try again later.*"
            }, { quoted: botMention });
        }

        const fontList = response.data.result
            .map(font => `*${font.name}:*\n${font.result}`)
            .join("\n\n");

        const finalMessage = `🎨 *Fancy Fonts Converter*\n\n${fontList}\n\n_© ${botName}_`;

        await socket.sendMessage(sender, {
            text: finalMessage
        }, { quoted: botMention });

    } catch (err) {
        console.error("Fancy Font Error:", err);
        await socket.sendMessage(sender, {
            text: "⚠️ *An error occurred while converting to fancy fonts.*"
        }, { quoted: botMention });
    }

    break;
}

case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1]; // .mediafire <link>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // ✅ Fake Meta contact message (like Facebook style)
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please send a MediaFire link.*\n\nExample: .mediafire <url>'
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Fetching MediaFire file info...*' }, { quoted: shonux });

        // 🔹 Call API
        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch MediaFire file.*' }, { quoted: shonux });
        }

        const result = data.result;
        const title = result.title || result.filename;
        const filename = result.filename;
        const fileSize = result.size;
        const downloadUrl = result.url;

        const caption = `📦 *${title}*\n\n` +
                        `📁 *Filename:* ${filename}\n` +
                        `📏 *Size:* ${fileSize}\n` +
                        `🌐 *From:* ${result.from}\n` +
                        `📅 *Date:* ${result.date}\n` +
                        `🕑 *Time:* ${result.time}\n\n` +
                        `✅ Downloaded by ${botName}`;

        // 🔹 Send file automatically (document type for .zip etc.)
        await socket.sendMessage(sender, {
            document: { url: downloadUrl },
            fileName: filename,
            mimetype: 'application/octet-stream',
            caption: caption
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in MediaFire downloader:", err);

        // ✅ In catch also send Meta mention style
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
case 'apksearch':
case 'apks':
case 'apkfind': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!query) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an app name to search.*\n\nExample: .apksearch whatsapp',
                buttons: [
                    { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
            }, { quoted: shonux });
        }

        await socket.sendMessage(sender, { text: '*⏳ Searching APKs...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/search/apksearch?query=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result || !data.result.length) {
            return await socket.sendMessage(sender, { text: '*❌ No APKs found for your query.*' }, { quoted: shonux });
        }

        // 🔹 Format results
        let message = `🔍 *APK Search Results for:* ${query}\n\n`;
        data.result.slice(0, 20).forEach((item, idx) => {
            message += `*${idx + 1}.* ${item.name}\n➡️ ID: \`${item.id}\`\n\n`;
        });
        message += `_© Powered by ${botName}_`;

        // 🔹 Send results
        await socket.sendMessage(sender, {
            text: message,
            buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
            ],
            contextInfo: { mentionedJid: [sender] }
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK search:", err);

        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APK"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}

case 'xvdl2':
case 'xvnew': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const query = text.split(" ").slice(1).join(" ").trim();

        if (!query) return await socket.sendMessage(sender, { text: '🚫 Please provide a search query.\nExample: .xv mia' }, { quoted: msg });

        // 1️⃣ Send searching message
        await socket.sendMessage(sender, { text: '*⏳ Searching XVideos...*' }, { quoted: msg });

        // 2️⃣ Call search API
        const searchRes = await axios.get(`https://tharuzz-ofc-api-v2.vercel.app/api/search/xvsearch?query=${encodeURIComponent(query)}`);
        const videos = searchRes.data.result?.xvideos?.slice(0, 10);
        if (!videos || videos.length === 0) return await socket.sendMessage(sender, { text: '*❌ No results found.*' }, { quoted: msg });

        // 3️⃣ Prepare list message
        let listMsg = `🔍 *XVideos Results for:* ${query}\n\n`;
        videos.forEach((vid, idx) => {
            listMsg += `*${idx + 1}.* ${vid.title}\n${vid.info}\n➡️ ${vid.link}\n\n`;
        });
        listMsg += '_Reply with the number to download the video._';

        await socket.sendMessage(sender, { text: listMsg }, { quoted: msg });

        // 4️⃣ Cache results for reply handling
        global.xvCache = global.xvCache || {};
        global.xvCache[sender] = videos.map(v => v.link);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ Error occurred.*' }, { quoted: msg });
    }
}
break;


// Handle reply to download selected video
case 'xvselect': {
    try {
        const replyText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const selection = parseInt(replyText);

        const links = global.xvCache?.[sender];
        if (!links || isNaN(selection) || selection < 1 || selection > links.length) {
            return await socket.sendMessage(sender, { text: '🚫 Invalid selection number.' }, { quoted: msg });
        }

        const videoUrl = links[selection - 1];

        await socket.sendMessage(sender, { text: '*⏳ Downloading video...*' }, { quoted: msg });

        // Call download API
        const dlRes = await axios.get(`https://tharuzz-ofc-api-v2.vercel.app/api/download/xvdl?url=${encodeURIComponent(videoUrl)}`);
        const result = dlRes.data.result;

        if (!result) return await socket.sendMessage(sender, { text: '*❌ Failed to fetch video.*' }, { quoted: msg });

        // Send video
        await socket.sendMessage(sender, {
            video: { url: result.dl_Links.highquality },
            caption: `🎥 *${result.title}*\n⏱ Duration: ${result.duration}s`,
            jpegThumbnail: result.thumbnail ? await axios.get(result.thumbnail, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: msg });

        // Clear cache
        delete global.xvCache[sender];

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ Error downloading video.*' }, { quoted: msg });
    }
}
break;

// ---------------- list saved newsletters (show emojis) ----------------
case 'newslist': {
  try {
    const docs = await listNewslettersFromMongo();
    if (!docs || docs.length === 0) {
      let userCfg = {};
      try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
      const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
      const shonux = {
          key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST" },
          message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '📭 No channels saved in DB.' }, { quoted: shonux });
    }

    let txt = '*📚 Saved Newsletter Channels:*\n\n';
    for (const d of docs) {
      txt += `• ${d.jid}\n  Emojis: ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : '(default)'}\n\n`;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('newslist error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to list channels.' }, { quoted: shonux });
  }
  break;
}
case 'cid': {
    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // ✅ Dynamic botName load
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    // ✅ Fake Meta AI vCard (for quoted msg)
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CID"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    // Clean command prefix (.cid, /cid, !cid, etc.)
    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    // Check if link is provided
    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: shonux });
    }

    // Validate link
    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
        }, { quoted: shonux });
    }

    const inviteId = match[1];

    try {
        // Send fetching message
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: shonux });

        // Get channel metadata
        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: shonux });
        }

        // Format details
        const infoText = `
📡 *WhatsApp Channel Info*

🆔 *ID:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Created on:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

_© Powered by ${botName}_
`;

        // Send preview if available
        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: shonux });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: '⚠️ An unexpected error occurred while fetching channel info.'
        }, { quoted: shonux });
    }

    break;
}

case 'owner': {
  try {
    // vCard with multiple details
    let vcard = 
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:YASAS\n' + // Name
      'ORG:WhatsApp Bot Developer;\n' + // Organization
      'TITLE:Founder & CEO of Dtec  Mini Bot;\n' + // Title / Role
      'EMAIL;type=INTERNET:dileepatechyt@gmail.com\n' + // Email
      'ADR;type=WORK:;;Colombo;;Sri Lanka\n' + // Address
      'URL:https://github.com\n' + // Website
      'TEL;type=CELL;type=VOICE;waid=94785316830\n' + // WhatsApp Number
      'TEL;type=CELL;type=VOICE;waid=94785316830\n' + // Second Number (Owner)
      'END:VCARD';

    await conn.sendMessage(
      m.chat,
      {
        contacts: {
          displayName: 'Nipun Harshana',
          contacts: [{ vcard }]
        }
      },
      { quoted: m }
    );

  } catch (err) {
    console.error(err);
    await conn.sendMessage(m.chat, { text: '⚠️ Owner info fetch error.' }, { quoted: m });
  }
}
break;

case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tagall': {
  try {
    if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

    let gm = null;
    try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
    if (!gm) return await socket.sendMessage(sender, { text: '❌ Failed to fetch group info.' }, { quoted: msg });

    const participants = gm.participants || [];
    if (!participants.length) return await socket.sendMessage(sender, { text: '❌ No members found in the group.' }, { quoted: msg });

    const text = args && args.length ? args.join(' ') : '📢 Announcement';

    let groupPP = 'https://i.ibb.co/9q2mG0Q/default-group.jpg';
    try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

    const mentions = participants.map(p => p.id || p.jid);
    const groupName = gm.subject || 'Group';
    const totalMembers = participants.length;

    const emojis = ['📢','🔊','🌐','🛡️','🚀','🎯','🧿','🪩','🌀','💠','🎊','🎧','📣','🗣️'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let caption = `╭───❰ *📛 Group Announcement* ❱───╮\n`;
    caption += `│ 📌 *Group:* ${groupName}\n`;
    caption += `│ 👥 *Members:* ${totalMembers}\n`;
    caption += `│ 💬 *Message:* ${text}\n`;
    caption += `╰────────────────────────────╯\n\n`;
    caption += `📍 *Mentioning all members below:*\n\n`;
    for (const m of participants) {
      const id = (m.id || m.jid);
      if (!id) continue;
      caption += `${randomEmoji} @${id.split('@')[0]}\n`;
    }
    caption += `\n━━━━━━⊱ *${botName}* ⊰━━━━━━`;

    await socket.sendMessage(from, {
      image: { url: groupPP },
      caption,
      mentions,
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('tagall error', err);
    await socket.sendMessage(sender, { text: '❌ Error running tagall.' }, { quoted: msg });
  }
  break;
}
case 'hidetag': {
    try {
        // 1. Group Check
        if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

        // 2. Admin Check (Optional: Remove if you want everyone to use it)
        const groupMetadata = await socket.groupMetadata(from);
        const participants = groupMetadata.participants || [];
        const botNumber = socket.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderId = msg.key.participant || msg.key.remoteJid;
        
        const groupAdmins = participants.filter(p => p.admin !== null).map(p => p.id);
        const isAdmin = groupAdmins.includes(senderId);
        const isBotAdmin = groupAdmins.includes(botNumber);

        if (!isAdmin) return await socket.sendMessage(sender, { text: '❌ Only Admins can use hidetag.' }, { quoted: msg });

        // 3. Prepare Mentions
        const mentions = participants.map(p => p.id || p.jid);
        
        // 4. Get Text (Message Content)
        // If user typed text after command, use it. Otherwise use a default text.
        const text = args.join(' ') || '📢 Hidden Announcement';

        // 5. Load Config for Fake Card
        const sanitized = (sender || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

        // Fake Meta Quote Card
        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_HIDETAG" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName}\nFN:${botName}\nEND:VCARD` } }
        };

        // 6. Handling Message Type (Text vs Image)
        // Check if the command is sent with an image (Caption)
        const isImage = msg.message?.imageMessage;
        
        if (isImage) {
            // If replying to image or sending image with caption
            // Note: Re-sending quoted image needs download logic. 
            // For simplicity, this handles if you ATTACH image with command.
            
            // But if you just want to send TEXT hidetag:
            await socket.sendMessage(from, { 
                text: text, 
                mentions: mentions 
            }, { quoted: metaQuote });

        } else {
            // Normal Text Hidetag
            await socket.sendMessage(from, { 
                text: text, 
                mentions: mentions // <--- This does the magic (Hidden Tag)
            }, { quoted: metaQuote });
        }

    } catch (err) {
        console.error('hidetag error', err);
        await socket.sendMessage(sender, { text: '❌ Error running hidetag.' }, { quoted: msg });
    }
    break;
}


case 'ig':
case 'insta':
case 'instagram': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    // Validate
    if (!q) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Please provide an Instagram post/reel link.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
      });
      return;
    }

    const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^\s]+/;
    if (!igRegex.test(q)) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Invalid Instagram link.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
      });
      return;
    }

    await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ Downloading Instagram media...*' });

    // 🔹 Load session bot name
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    // 🔹 Meta style fake contact
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_002"
      },
      message: {
        contactMessage: {
          displayName: botName, // dynamic bot name
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550003:+1 313 555 0003
END:VCARD`
        }
      }
    };

    // API request
    let apiUrl = `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(q)}`;
    let { data } = await axios.get(apiUrl).catch(() => ({ data: null }));

    // Backup API if first fails
    if (!data?.status || !data?.downloadUrl) {
      const backupUrl = `https://api.tiklydown.me/api/instagram?url=${encodeURIComponent(q)}`;
      const backup = await axios.get(backupUrl).catch(() => ({ data: null }));
      if (backup?.data?.video) {
        data = {
          status: true,
          downloadUrl: backup.data.video
        };
      }
    }

    if (!data?.status || !data?.downloadUrl) {
      await socket.sendMessage(sender, { 
        text: '*🚩 Failed to fetch Instagram video.*',
        buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
      });
      return;
    }

    // Caption (Dynamic Bot Name)
    const titleText = `*📸 ${botName} INSTAGRAM DOWNLOADER*`;
    const content = `┏━━━━━━━━━━━━━━━━\n` +
                    `┃📌 \`Source\` : Instagram\n` +
                    `┃📹 \`Type\` : Video/Reel\n` +
                    `┗━━━━━━━━━━━━━━━━`;

    const footer = `🤖 ${botName}`;
    const captionMessage = typeof formatMessage === 'function'
      ? formatMessage(titleText, content, footer)
      : `${titleText}\n\n${content}\n${footer}`;

    // Send video with fake contact quoted
    await socket.sendMessage(sender, {
      video: { url: data.downloadUrl },
      caption: captionMessage,
      contextInfo: { mentionedJid: [sender] },
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
      ]
    }, { quoted: shonux }); // 🔹 fake contact quoted

  } catch (err) {
    console.error("Error in Instagram downloader:", err);
    await socket.sendMessage(sender, { 
      text: '*❌ Internal Error. Please try again later.*',
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }]
    });
  }
  break;
}

case 'online': {
  try {
    if (!(from || '').endsWith('@g.us')) {
      await socket.sendMessage(sender, { text: '❌ This command works only in group chats.' }, { quoted: msg });
      break;
    }

    let groupMeta;
    try { groupMeta = await socket.groupMetadata(from); } catch (err) { console.error(err); break; }

    const callerJid = (nowsender || '').replace(/:.*$/, '');
    const callerId = callerJid.includes('@') ? callerJid : `${callerJid}@s.whatsapp.net`;
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const isOwnerCaller = callerJid.startsWith(ownerNumberClean);
    const groupAdmins = (groupMeta.participants || []).filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    const isGroupAdminCaller = groupAdmins.includes(callerId);

    if (!isOwnerCaller && !isGroupAdminCaller) {
      await socket.sendMessage(sender, { text: '❌ Only group admins or the bot owner can use this command.' }, { quoted: msg });
      break;
    }

    try { await socket.sendMessage(sender, { text: '🔄 Scanning for online members... please wait ~15 seconds' }, { quoted: msg }); } catch(e){}

    const participants = (groupMeta.participants || []).map(p => p.id);
    const onlineSet = new Set();
    const presenceListener = (update) => {
      try {
        if (update?.presences) {
          for (const id of Object.keys(update.presences)) {
            const pres = update.presences[id];
            if (pres?.lastKnownPresence && pres.lastKnownPresence !== 'unavailable') onlineSet.add(id);
            if (pres?.available === true) onlineSet.add(id);
          }
        }
      } catch (e) { console.warn('presenceListener error', e); }
    };

    for (const p of participants) {
      try { if (typeof socket.presenceSubscribe === 'function') await socket.presenceSubscribe(p); } catch(e){}
    }
    socket.ev.on('presence.update', presenceListener);

    const checks = 3; const intervalMs = 5000;
    await new Promise((resolve) => { let attempts=0; const iv=setInterval(()=>{ attempts++; if(attempts>=checks){ clearInterval(iv); resolve(); } }, intervalMs); });
    try { socket.ev.off('presence.update', presenceListener); } catch(e){}

    if (onlineSet.size === 0) {
      await socket.sendMessage(sender, { text: '⚠️ No online members detected (they may be hiding presence or offline).' }, { quoted: msg });
      break;
    }

    const onlineArray = Array.from(onlineSet).filter(j => participants.includes(j));
    const mentionList = onlineArray.map(j => j);

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ONLINE" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `🟢 *Online Members* — ${onlineArray.length}/${participants.length}\n\n`;
    onlineArray.forEach((jid, i) => {
      txt += `${i+1}. @${jid.split('@')[0]}\n`;
    });

    await socket.sendMessage(sender, {
      text: txt.trim(),
      mentions: mentionList
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (err) {
    console.error('Error in online command:', err);
    try { await socket.sendMessage(sender, { text: '❌ An error occurred while checking online members.' }, { quoted: msg }); } catch(e){}
  }
  break;
}



case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 9477xxxxxxx' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: shonux });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('deladmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: shonux });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: shonux });
  }
  break;
}
case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 this session logo.' }, { quoted: shonux });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`' }, { quoted: shonux });
      break;
    }

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
  } catch (e) {
    console.error('setlogo error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉'; // dynamic bot name

    const userNumber = sender.split('@')[0]; 

    // Reaction
    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `*🆔 Chat JID:* ${sender}\n*📞 Your Number:* +${userNumber}`,
    }, { quoted: shonux });
    break;
}

// use inside your switch(command) { ... } block

case 'block': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant; // replied user
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0]; // mentioned
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .block 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform block
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'block');
      } else {
        // some bailey builds use same method name; try anyway
        await socket.updateBlockStatus(targetJid, 'block');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Block error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to block the user. (Maybe invalid JID or API failure)' }, { quoted: msg });
    }

  } catch (err) {
    console.error('block command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' }, { quoted: msg });
  }
  break;
}

case 'unblock': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ ඔබට මෙය භාවිත කිරීමට අවසර නැත. (Owner හෝ මෙහි session owner විය යුතුයි)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ කරුණාකර reply කරන හෝ mention කරන හෝ number එක යොදන්න. උදාහරණය: .unblock 9477xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform unblock
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'unblock');
      } else {
        await socket.updateBlockStatus(targetJid, 'unblock');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `🔓 @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Unblock error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to unblock the user.' }, { quoted: msg });
    }

  } catch (err) {
    console.error('unblock command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' }, { quoted: msg });
  }
  break;
}

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 Bot Deploy Adming Only Command 😚📵 this session bot name.' }, { quoted: shonux });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname 🎉🎊 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 🎀🎉 - 01`' }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- Call Rejection Handler ----------------

// ---------------- Simple Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from MongoDB
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                // Reject the call
                await socket.rejectCall(id, from);
                
                // Send rejection message to caller
                await socket.sendMessage(from, {
                    text: '*🔕 𝐐𝐔𝐄𝐄𝐍 𝐑𝐀𝐒𝐇𝐔 𝐌𝐈𝐍𝐈 Auto call rejection is enabled. Calls are automatically rejected.*'
                });
                
                console.log(`✅ Auto-rejected call from ${from}`);

                // Send notification to bot user
                const userJid = jidNormalizedUser(socket.user.id);
                const rejectionMessage = formatMessage(
                    '📞 CALL REJECTED',
                    `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
                    BOT_NAME_FANCY
                );

                await socket.sendMessage(userJid, { 
                    image: { url: config.RCD_IMAGE_PATH }, 
                    caption: rejectionMessage 
                });
            }
        } catch (err) {
            console.error(`Call rejection error for ${sessionNumber}:`, err);
        }
    });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      // Read all messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      // Read only command messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
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
    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
socket.ev.on('creds.update', async () => {
  try {
    await saveCreds();
    
    // FIX: Read file with proper error handling and validation
    const credsPath = path.join(sessionPath, 'creds.json');
    
    // Check if file exists and has content
    if (!fs.existsSync(credsPath)) {
      console.warn('creds.json file not found at:', credsPath);
      return;
    }
    
    const fileStats = fs.statSync(credsPath);
    if (fileStats.size === 0) {
      console.warn('creds.json file is empty');
      return;
    }
    
    const fileContent = await fs.readFile(credsPath, 'utf8');
    
    // Validate JSON content before parsing
    const trimmedContent = fileContent.trim();
    if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') {
      console.warn('creds.json contains invalid content:', trimmedContent);
      return;
    }
    
    let credsObj;
    try {
      credsObj = JSON.parse(trimmedContent);
    } catch (parseError) {
      console.error('JSON parse error in creds.json:', parseError);
      console.error('Problematic content:', trimmedContent.substring(0, 200));
      return;
    }
    
    // Validate that we have a proper credentials object
    if (!credsObj || typeof credsObj !== 'object') {
      console.warn('Invalid creds object structure');
      return;
    }
    
    const keysObj = state.keys || null;
    await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
    console.log('✅ Creds saved to MongoDB successfully');
    
  } catch (err) { 
    console.error('Failed saving creds on creds.update:', err);
    
    // Additional debug information
    try {
      const credsPath = path.join(sessionPath, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const content = await fs.readFile(credsPath, 'utf8');
        console.error('Current creds.json content:', content.substring(0, 500));
      }
    } catch (debugError) {
      console.error('Debug read failed:', debugError);
    }
  }
});


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n🕒 Connecting: Bot will become active in a few seconds\n> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*`,
            useBotName
          );

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `✅ Successfully connected and ACTIVE!\n\n🔢 Number: ${sanitizedNumber}\n🩵 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}\n> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐐ᴜᴇᴇɴ 𝐑ᴀꜱʜᴜ 𝐌ɪɴɪ 🎊🎉💗🎈*`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)


router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🇱🇰CHATUWA  FREE BOT', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

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
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

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
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;
