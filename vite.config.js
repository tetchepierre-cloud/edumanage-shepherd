import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174, // Fixe le port à 5174 pour Shepherd Mirrors Academy
    strictPort: true, // Force Vite à utiliser ce port ou à lever une erreur s'il est pris
  },
})