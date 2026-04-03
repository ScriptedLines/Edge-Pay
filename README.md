# EdgePay: Frontend and Mobile Application

The EdgePay frontend is a high-performance, mobile-first application developed using Next.js 15+ and Capacitor. It provides a unified experience across web and native Android platforms.

---

## Core Frontend Functionality

- **Connectivity Management**: Real-time detection of network status for automatic switching between offline BLE and online FastAPI modes.
- **On-Device Risk Engine**: TensorFlow Lite integration for GRU and XGBoost model inference on the mobile device.
- **Refined User Experience**: Professional interface elements using Framer Motion animations and Lucide React iconography.
- **Synchronization Logic**: Manages local SQLite storage for offline transactions and synchronizes with the settlement server upon network recovery.

---

## Technical Stack

- **Framework**: Next.js 15+ (React 19)
- **Mobile Foundation**: Capacitor
- **Styling**: Tailwind CSS 4.0
- **Native APIs**:
  - `@capacitor-community/bluetooth-le` (Offline P2P protocol)
  - `@capacitor/barcode-scanner` (QR Payments)
  - `@capacitor/haptics` (Tactile feedback)

---

## Development and Deployment Commands

### Development Server
```bash
npm install
npm run dev
```

### Build and Synchronization (Android)
```bash
# Build the production application
npm run build

# Synchronize assets with the native Android project
npx cap sync android

# Open project in Android Studio
npx cap open android
```

---

## Directory Architecture

- `/app`: Next.js App Router (Logic and UI)
- `/components/ui`: Reusable, enterprise-grade UI components
- `/lib`: Core utilities including BLE communication, ML inference, and API clients
- `/android`: Native Android source code and Gradle build configurations

---

**Author**: Aaryaman Bisht
