import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    noDiscovery: true,
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'lucide-react',
      '@tensorflow/tfjs',
      '@tensorflow-models/coco-ssd',
      'long',
    ],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
