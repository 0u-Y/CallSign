import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { alias: { punycode: new URL("./src/lib/unicodeEscapes.ts", import.meta.url).pathname } },
  plugins: [react(), tailwindcss(), {name:"public-build-provenance",generateBundle(){this.emitFile({type:"asset",fileName:"build-meta.json",source:JSON.stringify({commit:process.env.VERCEL_GIT_COMMIT_SHA??process.env.VITE_BUILD_COMMIT??null,target:process.env.VERCEL_ENV??"local",publicPreview:process.env.VITE_PUBLIC_PREVIEW==="true"})});}}],
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
