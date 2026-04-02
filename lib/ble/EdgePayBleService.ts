/**
 * EdgePay Web Bluetooth Service
 * Handles the real BLE "Reverse Handshake" — payer's phone → merchant's soundbox device.
 *
 * Uses the standard Web Bluetooth API (Chrome/Edge on Android, Windows, macOS).
 * No native SDK, no installation required on the payer's device.
 */

import { generateEnvelope } from "./EdgePayCrypto";

// ── BLE Service / Characteristic UUIDs (must match the Receiver) ─────────────
// These are the same UUIDs from your reference EdgePayService code.
export const SERVICE_UUID       = "12345678-1234-5678-1234-567812345678";
export const CHARACTERISTIC_UUID = "87654321-4321-8765-4321-876543210987";

export type BlePhase =
  | "idle"
  | "scanning"      // Browser popup open, scanning for devices
  | "connecting"    // Device selected, establishing GATT connection
  | "transmitting"  // Writing the encrypted envelope
  | "success"       // Data sent, device can speak
  | "error";        // Something failed

export interface BleTransmitResult {
  success: boolean;
  tokenId?: string;
  ts?: number;
  error?: string;
  deviceName?: string;
}

type PhaseCallback = (phase: BlePhase, detail?: string) => void;

/**
 * Transmit an Edge-Pay payment bundle to a nearby BLE receiver (soundbox).
 *
 * @param amount       - Payment amount in INR
 * @param merchantId   - Merchant identifier (name/UPI ID)
 * @param onPhase      - Callback that receives real-time phase updates for the UI
 * @returns            - Result object with success flag and transaction token
 */
export async function transmitPayment(
  amount: number,
  merchantId: string,
  onPhase: PhaseCallback
): Promise<BleTransmitResult> {
  // Check Web Bluetooth availability
  if (typeof navigator === "undefined" || !navigator.bluetooth) {
    return {
      success: false,
      error: "Web Bluetooth is not supported in this browser. Please use Chrome or Edge.",
    };
  }

  let device: BluetoothDevice | null = null;

  try {
    // ── PHASE 1: SCANNING ───────────────────────────────────────────────────
    // This triggers the REAL browser Bluetooth popup.
    // The user will see a list of nearby BLE devices advertising our SERVICE_UUID.
    onPhase("scanning", "Opening Bluetooth scanner...");

    device = await navigator.bluetooth.requestDevice({
      filters: [
        {
          services: [SERVICE_UUID],
        },
      ],
      // Also accept devices that just have the service (no name filter needed)
      optionalServices: [SERVICE_UUID],
    });

    const deviceName = device.name || "Edge-Pay Soundbox";

    // ── PHASE 2: CONNECTING ─────────────────────────────────────────────────
    onPhase("connecting", `Connecting to ${deviceName}...`);

    if (!device.gatt) {
      throw new Error("GATT not available on selected device.");
    }

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    // ── PHASE 3: GENERATE ENCRYPTED ENVELOPE ───────────────────────────────
    onPhase("transmitting", "Encrypting & transmitting payment bundle...");

    const { base64, tokenId, ts } = await generateEnvelope(amount, merchantId);

    // Write the Base64 payload to the BLE characteristic
    // The soundbox receiver will decode, verify HMAC, and speak the voice alert.
    const encoder = new TextEncoder();
    const data = encoder.encode(base64);

    // For large payloads, split into MTU-sized chunks (default MTU is 20 bytes for BLE)
    // Most modern BLE stacks support 512-byte MTU after negotiation
    await characteristic.writeValueWithResponse(data);

    // ── PHASE 4: SUCCESS ────────────────────────────────────────────────────
    onPhase("success", `Payment of ₹${amount} transmitted to ${deviceName}`);

    // Gracefully disconnect — the soundbox received the data, it doesn't need to stay connected
    device.gatt.disconnect();

    return { success: true, tokenId, ts, deviceName };

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Handle user cancelling the device picker
    if (errMsg.includes("User cancelled") || errMsg.includes("chooser")) {
      onPhase("idle");
      return { success: false, error: "Cancelled" };
    }

    onPhase("error", errMsg);

    // Cleanup: disconnect if still connected
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }

    return { success: false, error: errMsg };
  }
}
