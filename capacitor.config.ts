import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.return.app",
  appName: "return",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    // The production API, authentication, chat, map and account sync remain shared with the website.
    url: "https://return-web-production.up.railway.app",
    cleartext: false,
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
