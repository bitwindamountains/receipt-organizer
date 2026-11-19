import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.snapsort.mobile',
  appName: 'Starlog',
  webDir: 'dist/snapsort/browser',
  backgroundColor: '#f8f7f2',
  android: {
    allowMixedContent: false,
  },
};

export default config;
