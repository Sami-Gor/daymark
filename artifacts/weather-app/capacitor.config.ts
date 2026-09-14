import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.sami_gor.daymark',
  appName: 'Daymark',
  webDir: 'dist/public',
  server: {
    // Bundled production assets are always served from the local secure origin.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
