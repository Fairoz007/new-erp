import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose NEXT_PUBLIC_* vars (Supabase dashboard naming) alongside Vite's default VITE_*
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
