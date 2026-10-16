import { readFileSync } from 'fs';
import { join } from 'path';

/** Версия сервера — из backend/package.json (одна точка правды для /api/health и Swagger). */
export const APP_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();
