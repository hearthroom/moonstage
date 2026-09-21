import { cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function copyPlaygroundSandbox(source, webRoot) {
  const page = readFileSync(join(source, 'index.html'), 'utf8');
  if (!page.includes('<title>chat sandbox</title>') ||
      !['sandbox.js', 'sandbox.css'].every(name => existsSync(join(source, name)))) {
    throw new Error('Sandbox build is incomplete');
  }
  const target = join(webRoot, 'sandbox');
  mkdirSync(target, { recursive: true });
  for (const name of ['index.html', 'sandbox.js', 'sandbox.css'])
    cpSync(join(source, name), join(target, name));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  copyPlaygroundSandbox(join(root, 'dist-sandbox'), join(root, 'dist/build/h5'));
}
