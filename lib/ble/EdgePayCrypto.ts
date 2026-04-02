/**
 * EdgePay Cryptographic Envelope Generator
 * Generates a signed, Base64-encoded payment bundle for BLE transmission.
 * Uses Web Crypto API (available in all modern browsers and Node.js 15+).
 */

const EDGE_PAY_SECRET = "EDGE_PAY_SECRET_TRUST_KEY_V1"; // In production, derive from Secure Enclave / TEE

/**
 * HMAC-SHA256 sign a string using Web Crypto API
 */
async function hmacSign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PaymentEnvelope {
  payload: string;        // JSON stringified payment data
  signature: string;      // HMAC-SHA256 hex signature
  tokenId: string;        // Unique transaction token
}

/**
 * Generate a signed, Base64-encoded payment bundle.
 * Matches the structure from the reference EdgePayService code.
 */
export async function generateEnvelope(
  amount: number,
  merchantId: string,
  userId: string = "EDGE_USER_01"
): Promise<{ base64: string; tokenId: string; ts: number }> {
  const ts = Date.now();
  const nonce = Math.floor(Math.random() * 100000);
  const tokenId = `EP-${ts.toString(36).toUpperCase()}-${nonce}`;

  const payloadObj = {
    u: userId,       // User ID
    m: merchantId,   // Merchant ID
    a: amount,       // Amount in INR
    t: ts,           // Timestamp (replay protection)
    n: nonce,        // Nonce (duplicate detection)
    tk: tokenId,     // Transaction token
  };

  const payloadStr = JSON.stringify(payloadObj);
  const signature = await hmacSign(payloadStr, EDGE_PAY_SECRET);

  const envelope: PaymentEnvelope = {
    payload: payloadStr,
    signature,
    tokenId,
  };

  // Base64-encode the complete envelope for BLE transmission
  const envelopeStr = JSON.stringify(envelope);
  const base64 = btoa(unescape(encodeURIComponent(envelopeStr)));

  return { base64, tokenId, ts };
}

/**
 * Verify a received envelope on the receiver side.
 * The Soundbox will call this to ensure the payment is authentic.
 */
export async function verifyEnvelope(base64: string): Promise<{
  valid: boolean;
  amount?: number;
  merchantId?: string;
  tokenId?: string;
  ts?: number;
}> {
  try {
    const envelopeStr = decodeURIComponent(escape(atob(base64)));
    const envelope: PaymentEnvelope = JSON.parse(envelopeStr);
    const expectedSignature = await hmacSign(envelope.payload, EDGE_PAY_SECRET);

    if (expectedSignature !== envelope.signature) {
      return { valid: false };
    }

    const payload = JSON.parse(envelope.payload);
    return {
      valid: true,
      amount: payload.a,
      merchantId: payload.m,
      tokenId: payload.tk,
      ts: payload.t,
    };
  } catch {
    return { valid: false };
  }
}
