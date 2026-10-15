// Заранее сжимает статику (brotli — максимальный уровень, и gzip) рядом с исходными файлами.
// Сервер отдаёт .br/.gz вместо сжатия «на лету» — на узком канале это экономит 20–30 % трафика.
// Использование: node scripts/precompress.mjs web/dist mobile/build/web
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { brotliCompressSync, constants, gzipSync } from 'zlib';

const EXT = new Set(['.js', '.mjs', '.wasm', '.css', '.html', '.json', '.svg', '.ttf', '.otf']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let before = 0;
let after = 0;
for (const dir of process.argv.slice(2)) {
  for (const file of walk(dir)) {
    if (!EXT.has(extname(file))) continue;
    const data = readFileSync(file);
    if (data.length < 1024) continue;
    const br = brotliCompressSync(data, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        [constants.BROTLI_PARAM_MODE]: extname(file) === '.wasm' ? constants.BROTLI_MODE_GENERIC : constants.BROTLI_MODE_TEXT,
      },
    });
    writeFileSync(file + '.br', br);
    writeFileSync(file + '.gz', gzipSync(data, { level: 9 }));
    before += data.length;
    after += br.length;
  }
}
console.log(`Сжато: ${(before / 1048576).toFixed(1)} МБ → ${(after / 1048576).toFixed(1)} МБ (brotli)`);
