import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // POC identity: the debug APK must install alongside the production app.
  // The effective Android application ID is enforced in
  // android/app/build.gradle; this keeps the Capacitor project metadata aligned.
  appId: 'io.github.sami_gor.daymark.pocmultilingual',
  appName: 'Daymark',
  webDir: 'dist/public',
  server: {
    // Bundled production assets are always served from the local secure origin.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // Never mirror WebView console output (which can include native plugin
    // result payloads) into logcat. Do not rely on the debug-build default.
    loggingBehavior: 'none',
  },
};

export default config;
