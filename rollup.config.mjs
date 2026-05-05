import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import alias from "@rollup/plugin-alias";
import {sveltePreprocess} from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const production = !process.env.ROLLUP_WATCH;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function suppressSvelteCircularDependencyWarnings(warning, warn) {
  if (
    warning.code === "CIRCULAR_DEPENDENCY" &&
    warning.ids?.every((id) => id.includes("node_modules") && id.includes("/svelte/"))
  ) {
    return;
  }

  warn(warning);
}

export default fs
  .readdirSync(path.join(__dirname, "webviews", "pages"))
  .filter((input) => input.endsWith(".ts"))
  .map((input) => {
    const name = input.split(".")[0];
    return {
      input: "webviews/pages/" + input,
      output: {
        sourcemap: !production,
        format: "iife",
        name: "app",
        file: "out/compiled/" + name + ".js",
      },
      onwarn: suppressSvelteCircularDependencyWarnings,
      plugins: [
        alias({
          entries: [
            { find: "@", replacement: path.resolve(__dirname, "webviews") },
          ],
        }),
        postcss({
          minimize: true,
          extract: true,
          extensions: ['.css'],
        }),
        svelte({
          // enable run-time checks when not in production
          compilerOptions:{
            dev: !production,
          },
          preprocess: sveltePreprocess({
            postcss: true
          }),
        }),
        // If you have external dependencies installed from
        // npm, you'll most likely need these plugins. In
        // some cases you'll need additional configuration -
        // consult the documentation for details:
        // https://github.com/rollup/plugins/tree/master/packages/commonjs

        resolve({
          browser: true,
          dedupe: ["svelte"],
          extensions: [".mjs", ".js", ".ts", ".svelte", ".json"],
        }),
        commonjs(),
        typescript({
          tsconfig: "webviews/tsconfig.json",
          sourceMap: !production,
          inlineSources: !production,
        }),

        // In dev mode, call `npm run start` once
        // the bundle has been generated
        // !production && serve(),

        // Watch the `public` directory and refresh the
        // browser on changes when not in production
        // !production && livereload("public"),

        // If we're building for production (npm run build
        // instead of npm run dev), minify
        production && terser(),
      ],
      watch: {
        clearScreen: false,
      },
    };
  });
