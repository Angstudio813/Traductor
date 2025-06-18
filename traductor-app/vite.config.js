import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Traductor/', // <--- ¡Agrega esta línea!
  plugins: [react()],
})
