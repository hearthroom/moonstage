// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyPlaygroundSandbox } from '../../scripts/copy-playground-sandbox.mjs';
it('ships real sandbox assets without overwriting the standalone app', () => {
 const root=mkdtempSync(join(tmpdir(),'playground-sandbox-'));
 try {
  const src=join(root,'shell'), web=join(root,'web');mkdirSync(src);mkdirSync(web);
  writeFileSync(join(web,'index.html'),'<title>Moonstage</title>');
  writeFileSync(join(src,'index.html'),'<title>chat sandbox</title>');
  expect(()=>copyPlaygroundSandbox(src,web)).toThrow('incomplete');
  expect(existsSync(join(web,'sandbox'))).toBe(false);
  writeFileSync(join(src,'sandbox.js'),'shell()');writeFileSync(join(src,'sandbox.css'),'body{}');
  copyPlaygroundSandbox(src,web);
  expect(readFileSync(join(web,'sandbox/index.html'),'utf8')).toContain('<title>chat sandbox</title>');
  expect(readFileSync(join(web,'sandbox/sandbox.js'),'utf8')).toBe('shell()');
  expect(readFileSync(join(web,'index.html'),'utf8')).toBe('<title>Moonstage</title>');
 } finally {rmSync(root,{recursive:true,force:true});}
});
it('packages the sandbox after building it in CI and the deployment workflow', () => {
 for(const file of ['ci.yml','deploy.yml']) {
  const workflow=readFileSync(new URL(`../../.github/workflows/${file}`,import.meta.url),'utf8');
  expect(workflow.indexOf('node scripts/copy-playground-sandbox.mjs')).toBeGreaterThan(workflow.indexOf('npm run build:sandbox'));
 }
});
