/**
 * EdgePay BLE Soundbox Receiver — Node.js Companion Script
 * ──────────────────────────────────────────────────────────
 * Run this on the MERCHANT's device (laptop or Android via Termux).
 * It advertises itself as a BLE GATT peripheral with the Edge-Pay SERVICE_UUID,
 * waits for the payer's phone to connect and write a payment, then:
 *   1. Decodes the Base64 envelope
 *   2. Verifies the HMAC-SHA256 signature
 *   3. Speaks "Paytm par X rupaye prapt hue" using TTS
 *
 * INSTALL:
 *   npm install @abandonware/bleno node-gtts play-sound
 *
 * RUN:
 *   node soundbox_receiver.js
 *
 * On Windows: You may need to install WinRT Bluetooth drivers.
 *   See: https://github.com/abandonware/bleno
 * On Linux/Raspberry Pi: sudo node soundbox_receiver.js
 * On Android (Termux): pkg install nodejs && npm install && node soundbox_receiver.js
 */

const bleno  = require('@abandonware/bleno');
const crypto = require('crypto');
const gtts   = require('node-gtts')('hi'); // Hindi TTS
const player = require('play-sound')({});
const fs     = require('fs');
const path   = require('path');

// ── CONFIG — Must match EdgePayBleService.ts exactly ─────────────────────────
const SERVICE_UUID        = '12345678-1234-5678-1234-567812345678';
const CHARACTERISTIC_UUID = '87654321-4321-8765-4321-876543210987';
const EDGE_PAY_SECRET     = 'EDGE_PAY_SECRET_TRUST_KEY_V1';

// ── Colors for terminal output ────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

function log(msg, color = C.dim) {
  const time = new Date().toLocaleTimeString();
  console.log(`${color}[${time}] ${msg}${C.reset}`);
}

// ── HMAC-SHA256 Verification ──────────────────────────────────────────────────
function verifyHMAC(payload, signature) {
  const expected = crypto
    .createHmac('sha256', EDGE_PAY_SECRET)
    .update(payload)
    .digest('hex');
  return expected === signature;
}

// ── TTS: Speak the payment using Hindi gTTS → mp3 → play ────────────────────
function speakPayment(amount, merchant) {
  const text = `Paytm par ${amount} rupaye prapt hue`;
  const tmpFile = path.join(__dirname, '_payment_alert.mp3');

  log(`🔊 Speaking: "${text}"`, C.green);

  gtts.save(tmpFile, text, (err) => {
    if (err) {
      log(`TTS save error: ${err.message}`, C.red);
      return;
    }
    player.play(tmpFile, (err) => {
      if (err) log(`Audio play error: ${err}`, C.red);
      // Clean up temp file after playing
      setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 5000);
    });
  });
}

// ── BLE Characteristic Definition ────────────────────────────────────────────
const PaymentCharacteristic = new bleno.Characteristic({
  uuid: CHARACTERISTIC_UUID,
  properties: ['write', 'writeWithoutResponse'],

  onWriteRequest(data, offset, withoutResponse, callback) {
    try {
      const base64 = data.toString('utf8');
      log(`📡 Data received (${data.length} bytes)`, C.cyan);

      // Decode the Base64 envelope
      const envelopeStr = Buffer.from(base64, 'base64').toString('utf8');
      const envelope    = JSON.parse(envelopeStr);
      const { payload, signature, tokenId } = envelope;

      log(`🔐 Verifying HMAC for token: ${tokenId}`, C.yellow);

      if (!verifyHMAC(payload, signature)) {
        log(`❌ HMAC signature INVALID — payment rejected!`, C.red);
        callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
        return;
      }

      const txData = JSON.parse(payload);
      log(`${C.bold}${C.green}✅ Payment Verified!${C.reset}`, C.green);
      log(`   Amount  : ₹${txData.a}`, C.green);
      log(`   Merchant: ${txData.m}`, C.green);
      log(`   Token   : ${txData.tk}`, C.green);
      log(`   Time    : ${new Date(txData.t).toLocaleString()}`, C.green);

      // 🔊 Speak the payment alert
      speakPayment(txData.a, txData.m);

      callback(bleno.Characteristic.RESULT_SUCCESS);

    } catch (err) {
      log(`Parse error: ${err.message}`, C.red);
      callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
    }
  }
});

// ── BLE Service Definition ────────────────────────────────────────────────────
const PaymentService = new bleno.PrimaryService({
  uuid:            SERVICE_UUID,
  characteristics: [PaymentCharacteristic],
});

// ── Start Advertising ─────────────────────────────────────────────────────────
console.log(`\n${C.bold}${C.cyan}⚡ Edge-Pay Virtual Soundbox — BLE Receiver${C.reset}`);
console.log(`${C.dim}──────────────────────────────────────────────${C.reset}\n`);

bleno.on('stateChange', (state) => {
  log(`BLE adapter state: ${state}`, C.yellow);
  if (state === 'poweredOn') {
    bleno.startAdvertising('EdgePay-Soundbox', [SERVICE_UUID], (err) => {
      if (err) {
        log(`Advertising failed: ${err}`, C.red);
      } else {
        log(`📡 Advertising as "EdgePay-Soundbox"`, C.cyan);
        log(`   SERVICE_UUID: ${SERVICE_UUID}`, C.dim);
        log(`   Ready and waiting for payments...`, C.green);
      }
    });
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('advertisingStart', (err) => {
  if (!err) {
    bleno.setServices([PaymentService], (err) => {
      if (err) log(`setServices error: ${err}`, C.red);
      else log('GATT server is up. Services registered.', C.green);
    });
  }
});

bleno.on('accept', (address) => {
  log(`📱 Device connected: ${address}`, C.cyan);
});

bleno.on('disconnect', (address) => {
  log(`Device disconnected: ${address}`, C.dim);
});
