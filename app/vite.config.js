import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Nodig om de bestaande pijplijn-modules in ../src/ te kunnen
      // hergebruiken zonder ze te dupliceren in app/.
      allow: ['..'],
    },
  },
})
