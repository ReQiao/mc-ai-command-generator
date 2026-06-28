import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // 前端源码（webview）根目录；index.html 仍在 src/renderer 下
  root: resolve(__dirname, "src/renderer"),
  plugins: [vue()],

  // Tauri 开发相关：
  // 1. 不要遮挡 Rust 错误输出
  clearScreen: false,
  // 2. Tauri 期望固定端口
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. 忽略 src-tauri 变更
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
}));
