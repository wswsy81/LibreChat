import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { createRequire } from 'module';
import { VitePWA } from 'vite-plugin-pwa';
import { compression } from 'vite-plugin-compression2';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

/**
 * vite-plugin-node-polyfills uses @rollup/plugin-inject to replace bare globals (e.g. `process`)
 * with imports like `import process from 'vite-plugin-node-polyfills/shims/process'`. When the
 * consuming module (e.g. recoil) is hoisted to the monorepo root, Vite's ESM resolver walks up
 * from there and never finds the shims (installed only in client/node_modules). This map resolves
 * the shim specifiers to absolute paths via CJS require.resolve anchored to the client directory.
 */
const NODE_POLYFILL_SHIMS: Record<string, string> = {
  'vite-plugin-node-polyfills/shims/process': require.resolve(
    'vite-plugin-node-polyfills/shims/process',
  ),
  'vite-plugin-node-polyfills/shims/buffer': require.resolve(
    'vite-plugin-node-polyfills/shims/buffer',
  ),
  'vite-plugin-node-polyfills/shims/global': require.resolve(
    'vite-plugin-node-polyfills/shims/global',
  ),
};

// https://vitejs.dev/config/
const backendPort = (process.env.BACKEND_PORT && Number(process.env.BACKEND_PORT)) || 3080;
const backendURL = process.env.HOST
  ? `http://${process.env.HOST}:${backendPort}`
  : `http://localhost:${backendPort}`;
const buildSourceMap = process.env.NODE_ENV === 'development';
const QUERY_DEVTOOLS_CHUNK_MODULES = [
  '@tanstack/react-query-devtools',
  '@tanstack/match-sorter-utils',
  'node_modules/superjson',
  'node_modules/copy-anything',
  'node_modules/is-what',
];

export default defineConfig(({ command }) => ({
  base: '',
  server: {
    allowedHosts:
      (process.env.VITE_ALLOWED_HOSTS && process.env.VITE_ALLOWED_HOSTS.split(',')) || [],
    host: process.env.HOST || 'localhost',
    port: (process.env.PORT && Number(process.env.PORT)) || 3090,
    strictPort: false,
    proxy: {
      '/api': {
        target: backendURL,
        changeOrigin: true,
      },
      '/oauth': {
        target: backendURL,
        changeOrigin: true,
      },
    },
  },
  // Set the directory where environment variables are loaded from and restrict prefixes
  envDir: '../',
  envPrefix: ['VITE_', 'SCRIPT_', 'DOMAIN_', 'ALLOW_'],
  plugins: [
    react(),
    {
      name: 'node-polyfills-shims-resolver',
      resolveId(id) {
        return NODE_POLYFILL_SHIMS[id] ?? null;
      },
    },
    nodePolyfills(),
    {
      name: 'emit-sw-heal',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'sw-heal.js',
          source: fs.readFileSync(path.resolve(__dirname, 'sw/heal.js'), 'utf8'),
        });
      },
    },
    VitePWA({
      injectRegister: 'auto', // 'auto' | 'manual' | 'disabled'
      registerType: 'autoUpdate', // 'prompt' | 'autoUpdate'
      devOptions: {
        enabled: false, // disable service worker registration in development mode
      },
      useCredentials: true,
      includeManifestIcons: false,
      workbox: {
        globPatterns: [
          '**/*.{js,css,html}',
          'assets/favicon*.png',
          'assets/icon-*.png',
          'assets/apple-touch-icon*.png',
          'assets/maskable-icon.png',
          'manifest.webmanifest',
        ],
        globIgnores: [
          'images/**/*',
          '**/*.map',
          'index.html',
          'sw-heal.js',
          'assets/rum.*.js',
          'assets/locale-*.js',
          'assets/query-devtools*.js',
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        /** LibreChat mutates index.html per request for subpath and language support. */
        navigateFallback: null,
        /** Reloads window clients that are silent or report a different build ID.
         * A responsive old SPA is still stale and must not survive a release. */
        importScripts: ['sw-heal.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/locale-[^/]+\.js$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'locale-chunks',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      includeAssets: [],
      manifest: {
        name: '未来线',
        short_name: '未来线',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#009688',
        icons: [
          {
            src: 'assets/favicon-32x32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: 'assets/favicon-16x16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: 'assets/apple-touch-icon-180x180.png',
            sizes: '180x180',
            type: 'image/png',
          },
          {
            src: 'assets/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'assets/maskable-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    ...(buildSourceMap ? [sourcemapExclude({ excludeNodeModules: true })] : []),
    compression({
      threshold: 10240,
    }),
  ],
  publicDir: command === 'serve' ? './public' : false,
  build: {
    sourcemap: buildSourceMap,
    outDir: './dist',
    minify: 'oxc',
    // Mermaid 与 Sandpack 已恢复为 Rolldown 的自然动态边界；重新开启入口预加载，
    // 避免高延迟网络下原生 ESM 逐层发现依赖形成数秒瀑布。首屏预算与浏览器
    // production smoke 会同时阻止重块重新被拉回入口或跨块求值再次退化。
    modulePreload: true,
    rolldownOptions: {
      preserveEntrySignatures: 'strict',
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'preload-runtime',
              test: (id: string) => id.includes('\0vite/preload-helper.js'),
              priority: 100,
            },
            {
              name(id: string) {
                const normalizedId = id.replace(/\\/g, '/');
                if (normalizedId.includes('node_modules')) {
                  if (normalizedId.includes('/node_modules/regenerator-runtime/')) {
                    return 'polyfills';
                  }

                  if (normalizedId.includes('@hyperdx/')) {
                    return 'rum';
                  }

                  // 人生设计室:lodash-es 首屏到处在用,原来它被塞进 mermaid chunk,
                  // 导致 2.7MB 的 mermaid 被 modulepreload 拉上首屏。拆成独立块,
                  // mermaid(只在渲染图时懒加载)就掉出首屏关键路径。
                  if (normalizedId.includes('lodash-es')) {
                    return 'lodash-es';
                  }
                  // Mermaid is loaded with import() by the renderer. Forcing Mermaid and its
                  // helpers into a named chunk creates a static back-edge to the shared hooks
                  // chunk under strict ESM signatures, pulling 700KB+ gzip into startup.
                  // Leave the whole graph to Rolldown so the dynamic boundary stays dynamic.
                  if (
                    normalizedId.includes('node_modules/mermaid') ||
                    normalizedId.includes('dagre-d3-es') ||
                    normalizedId.includes('chevrotain') ||
                    normalizedId.includes('langium')
                  ) {
                    return null;
                  }

                  // Sandpack and nodebox share runtime helpers with the artifact UI. Forcing
                  // any @codesandbox package into a named chunk creates cross-chunk ESM cycles
                  // whose exports may still be uninitialized when the app starts. Leave this
                  // strongly connected subgraph to Rolldown's route-aware splitter.
                  if (normalizedId.includes('@codesandbox/')) {
                    return null;
                  }
                  if (normalizedId.includes('react-vtree')) {
                    return 'react-vtree';
                  }
                  if (normalizedId.includes('react-virtualized')) {
                    return 'virtualization';
                  }
                  if (normalizedId.includes('i18next') || normalizedId.includes('react-i18next')) {
                    return 'i18n';
                  }
                  // Only regular lodash (not lodash-es which goes to mermaid chunk)
                  if (normalizedId.includes('/lodash/')) {
                    return 'utilities';
                  }
                  if (normalizedId.includes('date-fns')) {
                    return 'date-utils';
                  }
                  if (normalizedId.includes('@dicebear')) {
                    return 'avatars';
                  }
                  if (
                    normalizedId.includes('react-dnd') ||
                    normalizedId.includes('dnd-core') ||
                    normalizedId.includes('react-flip-toolkit') ||
                    normalizedId.includes('flip-toolkit')
                  ) {
                    return 'react-interactions';
                  }
                  if (normalizedId.includes('react-hook-form')) {
                    return 'forms';
                  }
                  if (normalizedId.includes('react-router-dom')) {
                    return 'routing';
                  }
                  if (
                    normalizedId.includes('qrcode.react') ||
                    normalizedId.includes('@marsidev/react-turnstile')
                  ) {
                    return 'security-ui';
                  }

                  if (normalizedId.includes('@codemirror/view')) {
                    return 'codemirror-view';
                  }
                  if (normalizedId.includes('@codemirror/state')) {
                    return 'codemirror-state';
                  }
                  if (normalizedId.includes('@codemirror/language')) {
                    return 'codemirror-language';
                  }
                  if (normalizedId.includes('@codemirror')) {
                    return 'codemirror-core';
                  }

                  if (
                    normalizedId.includes('react-markdown') ||
                    normalizedId.includes('remark-') ||
                    normalizedId.includes('rehype-')
                  ) {
                    return 'markdown-processing';
                  }
                  if (
                    normalizedId.includes('monaco-editor') ||
                    normalizedId.includes('@monaco-editor')
                  ) {
                    return 'code-editor';
                  }
                  if (
                    normalizedId.includes('react-window') ||
                    normalizedId.includes('react-virtual')
                  ) {
                    return 'virtualization';
                  }
                  if (
                    normalizedId.includes('zod') ||
                    normalizedId.includes('yup') ||
                    normalizedId.includes('joi')
                  ) {
                    return 'validation';
                  }
                  if (
                    normalizedId.includes('axios') ||
                    normalizedId.includes('ky') ||
                    normalizedId.includes('fetch')
                  ) {
                    return 'http-client';
                  }
                  if (
                    normalizedId.includes('react-spring') ||
                    normalizedId.includes('react-transition-group')
                  ) {
                    return 'animations';
                  }
                  if (normalizedId.includes('react-select') || normalizedId.includes('downshift')) {
                    return 'advanced-inputs';
                  }
                  if (normalizedId.includes('heic-to')) {
                    return 'heic-converter';
                  }

                  // Existing chunks
                  if (normalizedId.includes('@radix-ui')) {
                    return 'radix-ui';
                  }
                  if (normalizedId.includes('framer-motion')) {
                    return 'framer-motion';
                  }
                  if (
                    normalizedId.includes('node_modules/highlight.js') ||
                    normalizedId.includes('node_modules/lowlight')
                  ) {
                    return 'markdown_highlight';
                  }
                  if (
                    normalizedId.includes('katex') ||
                    normalizedId.includes('node_modules/katex')
                  ) {
                    return 'math-katex';
                  }
                  if (normalizedId.includes('node_modules/hast-util-raw')) {
                    return 'markdown_large';
                  }
                  if (
                    QUERY_DEVTOOLS_CHUNK_MODULES.some((moduleName) =>
                      normalizedId.includes(moduleName),
                    )
                  ) {
                    return 'query-devtools';
                  }
                  if (normalizedId.includes('@tanstack')) {
                    return 'tanstack-vendor';
                  }
                  if (normalizedId.includes('@headlessui')) {
                    return 'headlessui';
                  }

                  if (normalizedId.includes('@icons-pack/react-simple-icons/icons/')) {
                    return null;
                  }

                  // Unknown dependencies stay on Rolldown's route-aware graph. A single generic
                  // vendor bucket made React's startup chunk statically import Mermaid/CodeMirror.
                  return null;
                }
                if (normalizedId.includes('/src/polyfills/')) {
                  return 'polyfills';
                }
                // Keep lazy-loaded locale files in one chunk per locale.
                const localeMatch = normalizedId.match(
                  /\/src\/locales\/([^/]+)\/translation\.json$/,
                );
                if (localeMatch) {
                  return localeMatch[1] === 'en' ? null : `locale-${localeMatch[1]}`;
                }
                // Let Rolldown decide automatically for any other files.
                return null;
              },
            },
          ],
        },
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.[0] && /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.names[0])) {
            return 'assets/fonts/[name][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
      },
      /**
       * Ignore "use client" warning since we are not using SSR
       * @see {@link https://github.com/TanStack/query/pull/5161#issuecomment-1477389761 Preserve 'use client' directives TanStack/query#5161}
       */
      onwarn(warning, warn) {
        if (warning.message.includes('Error when using sourcemap')) {
          return;
        }
        warn(warning);
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '~': path.join(__dirname, 'src/'),
      $fonts: path.resolve(__dirname, 'public/fonts'),
      'micromark-extension-math': 'micromark-extension-llm-math',
    },
  },
}));

interface SourcemapExclude {
  excludeNodeModules?: boolean;
}

export function sourcemapExclude(opts?: SourcemapExclude): Plugin {
  return {
    name: 'sourcemap-exclude',
    transform(code: string, id: string) {
      if (opts?.excludeNodeModules && id.includes('node_modules')) {
        return {
          code,
          // https://github.com/rollup/rollup/blob/master/docs/plugin-development/index.md#source-code-transformations
          map: { mappings: '' },
        };
      }
    },
  };
}
