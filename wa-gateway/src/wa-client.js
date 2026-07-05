/**
 * Baileys WhatsApp Client wrapper — stable version
 *
 * Fixes:
 * - Proper auth state persistence (wait for creds save before acting)
 * - No premature "connected" state
 * - Clean disconnect handling without false "loggedOut"
 * - Retry-safe reconnection
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

const logger = pino({ level: 'silent' });

async function createWAConnection({ onConnected, onDisconnected, onQR }) {
  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['Aethera', 'Desktop', '1.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Important: increase timeouts for slow connections
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 500,
  });

  // Save credentials IMMEDIATELY on any update
  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      onQR?.(qr);
    }

    if (connection === 'open') {
      // Wait a moment for creds to fully persist
      await new Promise(r => setTimeout(r, 1000));
      await saveCreds();
      onConnected?.();
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      // 401 = loggedOut (user removed device from phone)
      // 408 = timeout
      // 428 = connection replaced
      // 440 = connection replaced
      // 515 = restart required
      if (statusCode === DisconnectReason.loggedOut) {
        // Actually logged out — clear auth and don't reconnect
        if (fs.existsSync(AUTH_DIR)) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        onDisconnected?.('logged_out');
      } else {
        // Recoverable disconnect — let the caller decide to reconnect
        const reason = statusCode === 408 ? 'timeout'
          : statusCode === 428 ? 'replaced'
          : statusCode === 515 ? 'restart_required'
          : `disconnect_${statusCode || 'unknown'}`;
        onDisconnected?.(reason);
      }
    }
  });

  return sock;
}

module.exports = { createWAConnection };
