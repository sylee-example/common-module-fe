import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 예제 전용 설정. 루트의 vite.config.ts 는 라이브러리 빌드용이라 여기서 쓰지 않는다
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { port: 5173 },
});
