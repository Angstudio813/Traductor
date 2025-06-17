import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/<nombre-repo>/', // Cambia <nombre-repo> por el nombre de tu repo
  plugins: [react()],
})
