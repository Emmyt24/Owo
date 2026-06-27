import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Mobile-first PWA that must run on 2GB Android and inside MiniPay (Section 1).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Owo',
        short_name: 'Owo',
        description: 'Spend and trade G$ in Nigeria.',
        theme_color: '#1B7F4B',
        background_color: '#0E1512',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
});
