import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  base: process.env.GITHUB_PAGES === 'true' ? '/my2do/' : '/',
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '2Do – Aufgaben-App',
        short_name: '2Do',
        description: '2Do – Deine ultimative Aufgaben-App',
        display: 'standalone',
        background_color: '#e0e7ff',
        theme_color: '#3b82f6',
        orientation: 'portrait',
        // start_url/scope weggelassen: das Plugin nimmt automatisch die
        // Vite-base ('/my2do/' im Pages-Build, '/' lokal)
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Der Haupt-Chunk (three, jspdf, recharts, …) liegt über dem
        // Workbox-Default von 2 MiB und würde sonst stillschweigend
        // nicht precached -> App würde offline nicht laden
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // navigateFallback bleibt Default (`${base}index.html`) – korrekt für HashRouter
      },
    }),
  ]
});
