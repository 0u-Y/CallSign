import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { alias: { punycode: new URL("./src/lib/unicodeEscapes.ts", import.meta.url).pathname } },
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    proxy: {
      "/pbx/ws": { ws:true,target:process.env.VITE_PBX_WSS_PROXY??"wss://asterisk:8089",secure:true,rewrite:()=>"/ws" },
      "/api": { ws: true, target: "http://127.0.0.1:4100", changeOrigin: false, rewrite: (path) => path.replace(/^\/api/, "") },
      "/signaling": { target: "ws://127.0.0.1:4100", ws: true, changeOrigin: false },
    },
  },
  preview: { port: 4173, strictPort: true },
});
