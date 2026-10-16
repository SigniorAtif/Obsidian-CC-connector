// Runs from `npm version <patch|minor|major>`: copies the new package.json
// version into both plugin manifests and records which Obsidian version it
// needs in versions.json.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const version = process.env.npm_package_version;
if (!version) throw new Error('Run this through `npm version`, which sets npm_package_version.');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

const manifest = readJson('manifest.json');
manifest.version = version;
writeJson('manifest.json', manifest);

const versions = readJson('versions.json');
versions[version] = manifest.minAppVersion;
writeJson('versions.json', versions);

const claudePlugin = readJson('claude-code/.claude-plugin/plugin.json');
claudePlugin.version = version;
writeJson('claude-code/.claude-plugin/plugin.json', claudePlugin);
