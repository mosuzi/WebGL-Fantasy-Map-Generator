import vue from "@vitejs/plugin-vue";
import {defineConfig} from "vite";

export default defineConfig({
  root: "app/webgl-generator",
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5410,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 5410,
    strictPort: false
  },
  build: {
    outDir: "../../dist/webgl-generator",
    emptyOutDir: true
  }
});
