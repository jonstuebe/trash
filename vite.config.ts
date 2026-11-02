import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from '@cloudflare/vite-plugin'
import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

// The Cloudflare plugin writes the client build here instead of build.outDir,
// so vite-plugin-pwa must be pointed at it to emit and precache the right files.
const clientOutDir = '.cloudflare/output/v0/workers/default/assets'

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit(),
    VitePWA({
      // 'prompt': a new version waits until the player taps Update in the banner
      // (src/subscription.ts), so a deploy never reloads a game in progress.
      registerType: 'prompt',
      injectRegister: false,
      outDir: clientOutDir,
      pwaAssets: {
        config: true,
        overrideManifestIcons: true,
        // index.html links the favicon and touch icon itself, and already
        // sets theme-color.
        includeHtmlHeadLinks: false,
        injectThemeColor: false,
        integration: { outDir: resolve(clientOutDir) },
      },
      manifest: {
        name: 'Trash',
        short_name: 'Trash',
        description: 'Flip Ace through Ten before anyone else.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
      },
      workbox: {
        // No webmanifest here: the plugin precaches the manifest itself, and a
        // second entry with another revision makes Workbox reject the whole
        // precache, so nothing works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Turn alerts for friend games (Web Push).
        importScripts: ['/push-sw.js'],
      },
    }),
    cloudflare(),
  ],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
