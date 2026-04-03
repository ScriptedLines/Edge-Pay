import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.paytmintent',
  appName: 'paytm-intent',
  webDir: 'out',
  android: {
    allowMixedContent: true
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ["*"]
  }
};

export default config;
