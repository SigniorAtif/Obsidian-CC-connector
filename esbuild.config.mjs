// Bundles src/main.ts into main.js, the file Obsidian loads.
//   node esbuild.config.mjs              watch mode, with source maps
//   node esbuild.config.mjs production   one minified build
import { builtinModules } from 'node:module';
import process from 'node:process';
import esbuild from 'esbuild';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  banner: { js: '/* Claude Code Connector: built file, edit src/main.ts instead. */' },
  entryPoints: ['src/main.ts'],
  bundle: true,
  // Obsidian provides these at runtime; bundling them would load a second copy.
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  minify: production,
  outfile: 'main.js',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
