import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import {ElementPlusResolver} from "unplugin-vue-components/resolvers";
import {defineConfig} from "vite";

export default defineConfig({
  root: "app/webgl-generator",
  plugins: [
    vue(),
    Components({
      dts: false,
      resolvers: [ElementPlusResolver({importStyle: "css"})]
    })
  ],
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
