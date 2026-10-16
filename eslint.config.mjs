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
      // The declarative settings API needs Obsidian 1.13; the classic tab
      // works back to minAppVersion. Two settings do not need search.
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
    },
  },

  // The Claude Code hook, its tests and the build scripts: plain Node.
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
