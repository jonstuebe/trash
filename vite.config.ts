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
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
    cloudflare(),
  ],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
