import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

// 소비 프로젝트가 이미 갖고 있는 라이브러리는 번들에 포함하지 않는다 (중복 인스턴스 방지)
const external = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'antd',
  '@ant-design/icons',
  'ag-grid-community',
  'ag-grid-react',
  '@ag-grid-community/locale',
  '@tanstack/react-query',
  'axios',
  'zustand',
  'react-hook-form',
  '@hookform/resolvers',
  '@hookform/resolvers/zod',
  'zod',
];

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], exclude: ['src/__tests__'] })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReactCommonModule',
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
    },
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
