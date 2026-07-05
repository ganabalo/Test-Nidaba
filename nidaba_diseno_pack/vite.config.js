import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(process.cwd(), "html/nidaba"),
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: false,
    proxy: {
      "/nidaba-api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: false
  },
  build: {
    outDir: resolve(process.cwd(), "dist/nidaba"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), "html/nidaba/index.html"),
        usuarios: resolve(process.cwd(), "html/nidaba/usuarios.html"),
        personas: resolve(process.cwd(), "html/nidaba/personas.html"),
        asignacion_presupuestaria: resolve(process.cwd(), "html/nidaba/asignacion_presupuestaria.html")
      }
    }
  }
});
