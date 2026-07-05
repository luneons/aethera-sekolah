/**
 * Aethera WhatsApp Gateway
 *
 * Local WA gateway using Baileys with:
 * - Message queue with configurable delay (3-5s between messages)
 * - No concurrent sends
 * - Random delay variation to appear natural
 * - REST API for the Python backend to call
 * - QR code served via API (no terminal needed)
 * - Full web-based control (connect, disconnect, status)
 */

const express = require('express');
const cors = require('cors');
const { createWAConnection } = require('./wa-client');
const { MessageQueue } = require('./queue');

const PORT = process.env.WA_GATEWAY_PORT || 3001;
const MIN_DELAY = parseInt(process.env.WA_MIN_DELAY || '3000', 10);
const MAX_DELAY = parseInt(process.env.WA_MAX_DELAY || '6000', 10);

const app = express();
app.use(express.json());
app.use(cors());

let waClient = null;
let isConnected = false;
let currentQR = null;
let connectionState = 'disconnected'; // disconnected | connecting | connected
let connectedPhone = null;
let connectedName = null;
let lastError = null;

const queue = new MessageQueue(MIN_DELAY, MAX_DELAY);

// --- WA Connection ---

let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

async function initWA() {
  connectionState = 'connecting';
  currentQR = null;
  lastError = null;

  // Clean up old client if exists
  if (waClient) {
    try { waClient.end(undefined); } catch (e) {}
    waClient = null;
  }

  // Small delay to let old socket fully close
  await new Promise(r => setTimeout(r, 500));

  try {
    const client = await createWAConnection({
      onConnected: () => {
        isConnected = true;
        connectionState = 'connected';
        currentQR = null;
        reconnectAttempts = 0;
        connectedPhone = client.user?.id?.split(':')[0] || null;
        connectedName = client.user?.name || null;
        console.log(`✅ WhatsApp connected: ${connectedName} (${connectedPhone})`);
      },
      onDisconnected: (reason) => {
        isConnected = false;
        currentQR = null;

        if (reason === 'logged_out') {
          connectionState = 'disconnected';
          lastError = 'Session dihapus dari HP. Klik "Hubungkan WhatsApp" untuk scan ulang.';
          console.log('❌ Logged out — session cleared');
          waClient = null;
          connectedPhone = null;
          connectedName = null;
        } else if (reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = Math.min(2000 * reconnectAttempts, 10000);
          connectionState = 'connecting';
          lastError = `Reconnecting (${reason})... ${reconnectAttempts}/${MAX_RECONNECT}`;
          console.log(`🔄 Reconnect in ${delay/1000}s (${reason}, attempt ${reconnectAttempts})`);
          setTimeout(initWA, delay);
        } else {
          connectionState = 'disconnected';
          lastError = `Gagal setelah ${MAX_RECONNECT}x. Klik "Hubungkan WhatsApp".`;
          console.log('❌ Max reconnect reached');
          reconnectAttempts = 0;
          connectedPhone = null;
          connectedName = null;
        }
      },
      onQR: (qr) => {
        currentQR = qr;
        connectionState = 'connecting';
        reconnectAttempts = 0; // QR means fresh start, reset counter
        console.log('📱 QR code ready');
      },
    });
    waClient = client;
  } catch (err) {
    connectionState = 'disconnected';
    lastError = err.message;
    console.error('Failed to init WA:', err.message);
  }
}

// --- API Endpoints ---

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: isConnected,
    connection_state: connectionState,
    queue_size: queue.size(),
    uptime: process.uptime(),
  });
});

// Full status (for frontend dashboard)
app.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      connection_state: connectionState,
      connected: isConnected,
      phone: connectedPhone,
      name: connectedName,
      qr: currentQR,
      last_error: lastError,
      queue_size: queue.size(),
      queue_processing: queue.isProcessing(),
    },
  });
});

// Connect (start WA connection)
app.post('/connect', async (req, res) => {
  if (isConnected) {
    return res.json({ success: true, message: 'Sudah terhubung' });
  }
  if (connectionState === 'connecting' && currentQR) {
    return res.json({ success: true, message: 'QR sudah tersedia, silakan scan' });
  }

  // Reset state
  reconnectAttempts = 0;
  if (waClient) {
    try { waClient.end(undefined); } catch (e) {}
    waClient = null;
  }

  await initWA();
  res.json({
    success: true,
    message: 'Memulai koneksi WhatsApp...',
    data: { connection_state: connectionState },
  });
});

// Disconnect
app.post('/disconnect', async (req, res) => {
  reconnectAttempts = MAX_RECONNECT; // Prevent auto-reconnect
  if (waClient) {
    try {
      waClient.end(undefined);
    } catch (e) {}
    waClient = null;
  }
  isConnected = false;
  connectionState = 'disconnected';
  currentQR = null;
  connectedPhone = null;
  connectedName = null;
  lastError = null;
  reconnectAttempts = 0;
  res.json({ success: true, message: 'Disconnected' });
});

// Logout (remove session, will need re-scan)
app.post('/logout', async (req, res) => {
  reconnectAttempts = MAX_RECONNECT; // Prevent auto-reconnect
  if (waClient) {
    try {
      await waClient.logout();
    } catch (e) {}
    waClient = null;
  }
  isConnected = false;
  connectionState = 'disconnected';
  currentQR = null;
  connectedPhone = null;
  connectedName = null;
  lastError = null;
  reconnectAttempts = 0;

  // Remove auth files
  const fs = require('fs');
  const path = require('path');
  const authDir = path.join(__dirname, '..', 'auth_info');
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }

  res.json({ success: true, message: 'Logged out, session dihapus' });
});

// Send message (queued)
app.post('/send', (req, res) => {
  const { target, message } = req.body;

  if (!target || !message) {
    return res.status(400).json({
      success: false,
      error: 'target dan message wajib diisi',
    });
  }

  if (!isConnected) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp belum terhubung',
    });
  }

  const phone = normalizePhone(target);
  const queueId = queue.enqueue({
    phone,
    message,
    addedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    data: {
      queue_id: queueId,
      queue_position: queue.size(),
    },
    message: 'Pesan masuk antrian',
  });
});

// Send message (immediate, bypass queue - for testing)
app.post('/send-now', async (req, res) => {
  const { target, message } = req.body;

  if (!target || !message) {
    return res.status(400).json({ success: false, error: 'target dan message wajib diisi' });
  }

  if (!isConnected || !waClient) {
    return res.status(503).json({ success: false, error: 'WhatsApp belum terhubung' });
  }

  try {
    const phone = normalizePhone(target);
    await sendMessage(phone, message);
    res.json({ success: true, message: 'Pesan terkirim' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Queue status + history
app.get('/queue', (req, res) => {
  res.json({
    success: true,
    data: {
      size: queue.size(),
      processing: queue.isProcessing(),
      history: queue.getHistory(20),
    },
  });
});

// --- Message Sending ---

async function sendMessage(phone, message) {
  if (!waClient) throw new Error('WA client not initialized');

  const jid = `${phone}@s.whatsapp.net`;

  // Typing simulation
  try {
    await waClient.presenceSubscribe(jid);
    await waClient.sendPresenceUpdate('composing', jid);
    await sleep(1000 + Math.random() * 1500);
    await waClient.sendPresenceUpdate('paused', jid);
  } catch (e) {
    // Presence errors are non-fatal
  }

  await waClient.sendMessage(jid, { text: message });
}

// --- Queue Processor ---

queue.onProcess(async (item) => {
  try {
    await sendMessage(item.phone, item.message);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to send to ${item.phone}:`, err.message);
    return { success: false, error: err.message };
  }
});

// --- Utilities ---

function normalizePhone(phone) {
  let cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '62' + cleaned.slice(1);
  }
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Start ---

app.listen(PORT, () => {
  console.log(`\n🚀 WA Gateway running on http://localhost:${PORT}`);
  console.log(`   Delay: ${MIN_DELAY}-${MAX_DELAY}ms between messages`);
  console.log(`   Control via web: POST /connect, GET /status, POST /disconnect\n`);
});
