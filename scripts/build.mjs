import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'favicon.svg', 'src']) {
  await cp(new URL(entry, root), new URL(entry, output), { recursive: true });
}
console.log(`Built Forma into ${fileURLToPath(output)}`);
