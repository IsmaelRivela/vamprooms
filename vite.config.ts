import { defineConfig } from 'vite';
import { resolve } from 'path';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'vamprooms';
const pagesBase = process.env.VITE_PAGES === 'true' ? `/${repoName}/` : './';

export default defineConfig({
  base: pagesBase,
  server: {
    host: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'layout-editor.html'),
      },
    },
  },
});
