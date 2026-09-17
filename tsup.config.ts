import { defineConfig } from 'tsup'

export default defineConfig({
  // loader 是独立 entry：它依赖运行时计算的动态 import()，
  // 与主入口图隔离后，不用自定义算子的打包场景（浏览器）不会遇到
  // "dynamic import cannot be analyzed" 的告警或 context module。
  entry: {
    index: 'src/index.ts',
    loader: 'src/loader.ts',
  },
  format: ['cjs', 'esm'],
  // Inject cjs and esm shims:https://tsup.egoist.dev/#inject-cjs-and-esm-shims
  shims: true,
  // 双 entry 共享 chunk（仅 ESM 生效；CJS 各自独立打包）
  splitting: true,
  // sourcemap: true,
  clean: true,
  minify: 'terser',
  terserOptions: {
    // https://terser.org/docs/options/#mangle-options
    "mangle": {
      "properties": {
        "regex": /^_[$]/,
        // "undeclared": true, // Mangle those names when they are accessed as properties of known top level variables but their declarations are never found in input code.
      },
      "toplevel": true,
      "reserved": [
        // # expected names in web-extension content
        "WeakSet", "Set",
        // # expected names in 3rd-party extensions' contents
        "requestIdleCallback",
        // # content global names:
        "browser",
      ],
    }
  },
})
