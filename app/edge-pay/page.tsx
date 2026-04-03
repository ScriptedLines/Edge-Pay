"use client";

import NativePaytmClone from "../page";

export default function EdgePayPage() {
  // Reuse the main, fixed implementation so Bluetooth/offline dues
  // logic does not drift between routes.
  return <NativePaytmClone />;
}

