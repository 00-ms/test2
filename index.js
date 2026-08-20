require('dotenv').config();
const path = require('path');
const readline = require('readline');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const { lookupUser } = require('./lib/roblox');
const { toSticker, stickerToVideo } = require('./lib/media');

const PREFIX = process.env.PREFIX || '.';
const SESSION_DIR = path.join(__dirname, 'session');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['RobloxidBot', 'Chrome', '1.0.0']
  });

  // Pairing code login (good for mobile/headless) or fallback to QR
  if (process.env.PAIRING_NUMBER && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(process.env.PAIRING_NUMBER.replace(/[^0-9]/g, ''));
        console.log(`\nPairing code: ${code}\nEnter this in WhatsApp > Linked Devices > Link with phone number.\n`);
      } catch (e) {
        console.error('Failed to request pairing code:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && !process.env.PAIRING_NUMBER) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed.', shouldReconnect ? 'Reconnecting...' : 'Logged out.');
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!body.startsWith(PREFIX)) return;

    const [rawCmd, ...args] = body.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();

    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

    try {
      if (cmd === 'roblox' || cmd === 'r') {
        await handleRoblox(sock, jid, msg, args);
      } else if (cmd === 'vv') {
        await handleViewOnce(sock, jid, msg, quoted);
      } else if (cmd === 's' || cmd === 'sticker') {
        await handleSticker(sock, jid, msg, quoted);
      } else if (cmd === 'tovid' || cmd === 'toimg') {
        await handleToVideo(sock, jid, msg, quoted);
      } else if (cmd === 'menu' || cmd === 'help') {
        await sock.sendMessage(jid, { text: menuText() }, { quoted: msg });
      }
    } catch (err) {
      console.error(`Error handling ${cmd}:`, err);
      await sock.sendMessage(jid, { text: `⚠️ Error: ${err.message}` }, { quoted: msg });
    }
  });
}

function menuText() {
  return (
    `*Commands*\n` +
    `${PREFIX}roblox <username> - Roblox user info\n` +
    `${PREFIX}s - reply to image/video/sticker to make a sticker\n` +
    `${PREFIX}tovid - reply to a sticker to convert it to mp4\n` +
    `${PREFIX}vv - reply to a view-once photo/video to reveal & resend it`
  );
}

async function handleRoblox(sock, jid, msg, args) {
  const username = args[0];
  if (!username) {
    await sock.sendMessage(jid, { text: `Usage: ${PREFIX}roblox <username>` }, { quoted: msg });
    return;
  }
  await sock.sendMessage(jid, { text: '🔎 Looking up Roblox user...' }, { quoted: msg });

  const result = await lookupUser(username);
  if (!result) {
    await sock.sendMessage(jid, { text: `❌ No Roblox user found for "${username}".` }, { quoted: msg });
    return;
  }

  if (result.avatarUrl) {
    await sock.sendMessage(
      jid,
      { image: { url: result.avatarUrl }, caption: result.text },
      { quoted: msg }
    );
  } else {
    await sock.sendMessage(jid, { text: result.text }, { quoted: msg });
  }
}

async function handleViewOnce(sock, jid, msg, quoted) {
  if (!quoted) {
    await sock.sendMessage(jid, { text: `Reply to a view-once photo/video with ${PREFIX}vv` }, { quoted: msg });
    return;
  }

  const voMsg = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
  const type = voMsg.imageMessage ? 'imageMessage' : voMsg.videoMessage ? 'videoMessage' : null;

  if (!type) {
    await sock.sendMessage(jid, { text: '⚠️ The replied message is not a view-once photo/video.' }, { quoted: msg });
    return;
  }

  const fakeMsg = {
    key: msg.message.extendedTextMessage.contextInfo.stanzaId
      ? {
          remoteJid: jid,
          id: msg.message.extendedTextMessage.contextInfo.stanzaId,
          participant: msg.message.extendedTextMessage.contextInfo.participant
        }
      : msg.key,
    message: voMsg
  };

  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});

  if (type === 'imageMessage') {
    await sock.sendMessage(jid, { image: buffer, caption: '🔓 Revealed view-once' }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { video: buffer, caption: '🔓 Revealed view-once' }, { quoted: msg });
  }
}

async function handleSticker(sock, jid, msg, quoted) {
  const target = quoted || msg.message;
  const imageMsg = target.imageMessage;
  const videoMsg = target.videoMessage;
  const stickerMsg = target.stickerMessage;

  if (!imageMsg && !videoMsg && !stickerMsg) {
    await sock.sendMessage(
      jid,
      { text: `Send/reply to an image or short video with ${PREFIX}s` },
      { quoted: msg }
    );
    return;
  }

  const fakeMsg = quoted
    ? {
        key: {
          remoteJid: jid,
          id: msg.message.extendedTextMessage.contextInfo.stanzaId,
          participant: msg.message.extendedTextMessage.contextInfo.participant
        },
        message: quoted
      }
    : msg;

  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
  const stickerBuffer = await toSticker(
    buffer,
    !!videoMsg,
    process.env.STICKER_PACK,
    process.env.STICKER_AUTHOR
  );

  await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
}

async function handleToVideo(sock, jid, msg, quoted) {
  const stickerMsg = quoted?.stickerMessage;
  if (!stickerMsg) {
    await sock.sendMessage(jid, { text: `Reply to a sticker with ${PREFIX}tovid` }, { quoted: msg });
    return;
  }

  const fakeMsg = {
    key: {
      remoteJid: jid,
      id: msg.message.extendedTextMessage.contextInfo.stanzaId,
      participant: msg.message.extendedTextMessage.contextInfo.participant
    },
    message: quoted
  };

  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
  const videoBuffer = await stickerToVideo(buffer);

  await sock.sendMessage(jid, { video: videoBuffer, caption: '🎬 Converted' }, { quoted: msg });
}

startBot();
