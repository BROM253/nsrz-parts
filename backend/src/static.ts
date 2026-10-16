import { NestExpressApplication } from '@nestjs/platform-express';
import express, { NextFunction, Request, Response } from 'express';
import { existsSync, statSync } from 'fs';
import { extname, join, normalize, sep } from 'path';

/**
 * Раздача клиентов с того же сервера, что и API (один адрес — один туннель):
 *   /          — сайт для ПК (React), включая панель /panel;
 *   /m/        — веб-сборка мобильного приложения (Flutter) для iPhone;
 *   /download/ — готовые APK.
 *
 * Канал до домашнего сервера узкий (туннель через VPN, ~30 КБ/с), поэтому:
 *  - файлы заранее сжаты brotli/gzip (scripts/precompress.mjs) и отдаются без сжатия «на лету»;
 *  - файлы с хэшем в имени и движок Flutter кэшируются надолго — второй раз не скачиваются;
 *  - HTML и точки входа всегда проверяются на свежесть (304, если не изменились).
 */

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const YEAR = 'public, max-age=31536000, immutable';
const MONTH = 'public, max-age=2592000';
const REVALIDATE = 'no-cache';

type CachePolicy = (relPath: string) => string;

const DAY = 'public, max-age=86400';
const webCache: CachePolicy = (p) => (p.startsWith('/assets/') ? YEAR : p.startsWith('/img/') ? DAY : REVALIDATE);
// движок CanvasKit и шрифты меняются только с версией Flutter; main.dart.js — при каждой сборке
const mobileCache: CachePolicy = (p) => (p.startsWith('/canvaskit/') || p.startsWith('/assets/fonts/') || p.startsWith('/icons/') ? MONTH : REVALIDATE);

/** Отдаёт file.br / file.gz, если браузер их понимает и они есть рядом с файлом. */
function precompressed(root: string, cache: CachePolicy) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const type = TYPES[extname(rel)];
    if (!type) return next();
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep)) return next();
    const accept = String(req.headers['accept-encoding'] ?? '');
    for (const [encoding, ext] of [
      ['br', '.br'],
      ['gzip', '.gz'],
    ] as const) {
      if (!accept.includes(encoding)) continue;
      const packed = file + ext;
      if (!existsSync(packed) || !statSync(packed).isFile()) continue;
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Content-Type', type);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', cache(rel));
      return res.sendFile(packed);
    }
    next();
  };
}

function staticDir(root: string, cache: CachePolicy, index: boolean) {
  return express.static(root, {
    index: index ? 'index.html' : false,
    setHeaders: (res, path) => res.setHeader('Cache-Control', cache('/' + path.slice(root.length + 1).split(sep).join('/'))),
  });
}

export function serveClients(app: NestExpressApplication) {
  const root = join(__dirname, '..', '..');
  const webDist = process.env.WEB_DIST ?? join(root, 'web', 'dist');
  const mobileWeb = process.env.MOBILE_WEB_DIST ?? join(root, 'mobile', 'build', 'web');
  const release = process.env.RELEASE_DIR ?? join(root, 'release');
  const isApi = (req: Request) => req.path === '/api' || req.path.startsWith('/api/');

  if (existsSync(release)) {
    app.use('/download', staticDir(release, () => REVALIDATE, false));
  }

  if (existsSync(mobileWeb)) {
    app.use('/m', (req: Request, res: Response, next: NextFunction) => {
      // /m → /m/, иначе относительные пути Flutter-сборки поедут
      if (req.originalUrl === '/m') return res.redirect(301, '/m/');
      next();
    });
    app.use('/m', precompressed(mobileWeb, mobileCache), staticDir(mobileWeb, mobileCache, true));
  }

  if (existsSync(webDist)) {
    const pre = precompressed(webDist, webCache);
    const files = staticDir(webDist, webCache, false);
    const indexHtml = join(webDist, 'index.html');
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (isApi(req) || req.path.startsWith('/m/') || req.path.startsWith('/download/')) return next();
      pre(req, res, () =>
        files(req, res, () => {
          // SPA: любой другой адрес (например, /panel/stock) — это страница React-приложения
          if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts('html')) {
            res.setHeader('Cache-Control', REVALIDATE);
            return res.sendFile(indexHtml);
          }
          next();
        }),
      );
    });
  }
}
