import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Enable Fast Refresh with better error recovery
      fastRefresh: true,
    })
  ],
  // Set cache directory to project root for easier clearing
  cacheDir: '.vite',
  server: {
    port: 3000,
    open: true,
    // Improve HMR reliability
    hmr: {
      overlay: true, // Show error overlay for better debugging
    },
    // Ensure files are always fresh
    fs: {
      // Allow serving files from project root
      strict: false,
      // Allow access to files outside root if needed
      allow: ['..'],
    },
    // Disable caching in dev mode to prevent stale code
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    // Configure file watching to avoid conflicts
    watch: {
      usePolling: false,
      // Ignore patterns that might cause unnecessary reloads
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.vite/**',
      ],
    },
  },
  // Better dependency optimization
  optimizeDeps: {
    // Force re-optimization when dependencies change
    force: false, // Set to true temporarily if having cache issues
    // Include dependencies that might need explicit optimization
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@instantdb/react',
    ],
  },
  // Better error handling
  build: {
    // Source maps for better debugging
    sourcemap: true,
  },
})

