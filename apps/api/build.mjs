import { build } from 'esbuild';

// One self-contained file per entry: the server and the migration command.
await build({
  entryPoints: { server: 'src/server.ts', migrate: '../../packages/db/src/cli.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['pg-native'],
  // Some dependencies are CommonJS and call require() at run time.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
