import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig(({ mode }) => {
  const isLib = mode === "lib" || process.env.BUILD_MODE === "lib";

  return {
    plugins: isLib
      ? [
          dts({
            rollupTypes: true,
            include: ["src"],
            exclude: ["src/main.ts"],
          }),
        ]
      : [],
    build: isLib
      ? {
          lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            name: "KoreanKokoro",
            fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
            formats: ["es", "cjs"],
          },
          rollupOptions: {
            external: ["kokoro-js", "@huggingface/transformers"],
            output: {
              globals: {
                "kokoro-js": "KokoroTTS",
                "@huggingface/transformers": "Transformers",
              },
            },
          },
        }
      : {
          outDir: "dist",
        },
    server: {
      port: 5173,
      host: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    optimizeDeps: {
      exclude: ["@huggingface/transformers"],
    },
  };
});
