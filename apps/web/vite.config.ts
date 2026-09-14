import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4100", changeOrigin: false, rewrite: (path) => path.replace(/^\/api/, "") },
      "/signaling": { target: "ws://127.0.0.1:4100", ws: true, changeOrigin: false },
    },
  },
  preview: { port: 4173, strictPort: true },
});
