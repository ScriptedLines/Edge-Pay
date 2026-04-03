/**
 * ensureBluetooth()
 * ─────────────────
 * On a real Android device: checks if BT is enabled; if not, shows the
 * system "Enable Bluetooth?" dialog and waits for the user to accept.
 * On web / iOS: no-op (Web Bluetooth has no enable API).
 *
 * Returns true if BT is (now) enabled, false otherwise.
 */
export async function ensureBluetooth(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return true; // nothing to do on web

    // Dynamically import so web builds don't break
    const { BleClient } = await import("@capacitor-community/bluetooth-le");

    // initialize (idempotent — safe to call multiple times)
    await BleClient.initialize({ androidNeverForLocation: true });

    const enabled = await BleClient.isEnabled();
    if (enabled) return true;

    // On Android this fires the system "Turn on Bluetooth?" intent
    await BleClient.requestEnable();

    // Check again after user interacted with the dialog
    return await BleClient.isEnabled();
  } catch (err) {
    console.warn("[EdgePay] ensureBluetooth failed:", err);
    return false; // non-fatal — let the flow continue
  }
}
