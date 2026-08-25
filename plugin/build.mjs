import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

// The demo page is served by the Worker alongside this package in the monorepo
// that authors it. The standalone public mirror has no Worker, so this skips
// rather than creating a stray api/ directory there.
const MONOREPO = existsSync('../api/wrangler.jsonc');

const common = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	minify: true,
	sourcemap: true,
	target: ['es2020'],
	// The shared encoding module is imported across the workspace; bundling it
	// keeps the published package self-contained with no workspace dependency.
	logLevel: 'info',
};

await build({ ...common, format: 'esm', outfile: 'dist/index.js' });
await build({ ...common, format: 'iife', globalName: 'jusho', outfile: 'dist/jusho.global.js' });

// The demo page at / loads the plugin from the same origin, so the deployed
// bundle is always the one built from this commit rather than a stale CDN copy.
if (MONOREPO) {
	await mkdir('../api/assets', { recursive: true });
	await build({ ...common, format: 'esm', outfile: '../api/assets/jusho.js' });
}

// tsc emits declarations under dist/plugin/src and dist/shared/src, because the
// shared encoding module lives outside this package and rootDir has to span
// both. Consumers should never see that: this shim is the flat public entry
// that package.json points "types" at.
await writeFile('dist/index.d.ts', "export * from './plugin/src/index.js';\n");
