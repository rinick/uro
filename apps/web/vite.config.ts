import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      {find: '@uro/sgf-core', replacement: path.resolve(__dirname, '../../packages/sgf-core/src')},
      {find: '@uro/go-core', replacement: path.resolve(__dirname, '../../packages/go-core/src')},
      {find: '@uro/ui-shared', replacement: path.resolve(__dirname, '../../packages/ui-shared/src')},
    ],
  },
});
