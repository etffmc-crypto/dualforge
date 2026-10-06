// One-off: print the DUALFORGE: share code for a profile JSON file (so a profile can be moved between data folders
// or PCs through the app's Import). Usage: npx tsx scripts/share-code-from-file.mjs <profile.json> [out.txt]
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { ProfileSchema } from '../packages/shared/src/profile.ts';
import { encodeShareCode } from '../packages/engine/src/share-code.ts';

const [file, out] = process.argv.slice(2);
if (!file) throw new Error('usage: share-code-from-file.mjs <profile.json> [out.txt]');
const profile = ProfileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
const code = encodeShareCode(profile, (buf) => deflateRawSync(buf));
if (out) writeFileSync(out, code + '\n');
console.log(`${profile.name}: ${code.length} chars${out ? ` → ${out}` : ''}`);
if (!out) console.log(code);
