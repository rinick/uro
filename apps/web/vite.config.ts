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
  },
  resolve: {
    alias: [
      {find: '@uro/sgf-core', replacement: path.resolve(__dirname, '../../packages/sgf-core/src')},
      {find: '@uro/go-core', replacement: path.resolve(__dirname, '../../packages/go-core/src')},
      {find: '@uro/ui-shared', replacement: path.resolve(__dirname, '../../packages/ui-shared/src')},
      {find: '@uro/analysis-core', replacement: path.resolve(__dirname, '../../packages/analysis-core/src')},
      {find: '@uro/sgf-analysis-tree', replacement: path.resolve(__dirname, '../../packages/sgf-analysis-tree/src')},
      {find: '@uro/katago-core', replacement: path.resolve(__dirname, '../../packages/katago-core/src')},
    ],
  },
});
