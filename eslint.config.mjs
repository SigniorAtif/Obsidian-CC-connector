import js from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['node_modules/', 'main.js']),

  // The Obsidian plugin: the same rules Obsidian's review bot applies.
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'obsidianmd/ui/sentence-case': ['warn', { brands: ['Claude Code', 'Claude'] }],
    },
  },

  // The Claude Code hook, its tests and the build scripts: plain Node.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
