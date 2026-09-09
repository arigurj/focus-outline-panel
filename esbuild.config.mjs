import esbuild from 'esbuild';
import process from 'process';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', 'os', 'path', 'fs', 'crypto'],
  format: 'cjs',
  target: 'es2021',
  outfile: 'main.js',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
