import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "Schrödinger's Chess",
        short_name: 'Schrödinger Chess',
        description: 'Human versus AI chess with hidden movement powers.',
        theme_color: '#1d2733',
        background_color: '#101820',
        display: 'standalone',
        start_url: '/'
      }
    })
  ]
});
