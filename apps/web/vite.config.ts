import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    minify: true,
  },
  server: {
    hmr: false,
    port: 5072,
  },
  resolve: {
    alias: [
      {find: '@ulugo/sgf-core', replacement: path.resolve(__dirname, '../../packages/sgf-core/src')},
      {find: '@ulugo/go-core', replacement: path.resolve(__dirname, '../../packages/go-core/src')},
      {find: '@ulugo/ui-shared', replacement: path.resolve(__dirname, '../../packages/ui-shared/src')},
      {find: '@ulugo/analysis-core', replacement: path.resolve(__dirname, '../../packages/analysis-core/src')},
      {find: '@ulugo/sgf-analysis-tree', replacement: path.resolve(__dirname, '../../packages/sgf-analysis-tree/src')},
      {find: '@ulugo/katago-core', replacement: path.resolve(__dirname, '../../packages/katago-core/src')},
    ],
  },
});
