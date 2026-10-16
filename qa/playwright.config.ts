import { defineConfig, devices } from '@playwright/test';

/**
 * Функциональные UI-тесты сайта (этап 5): кнопки, формы и сценарии ТЗ п. 4.2 в трёх движках —
 * Chrome, Firefox и Safari (WebKit), как требует ТЗ п. 4.5.
 * Работают с QA-стендом (порт 3100, база nsrz_qa): npm run stand.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // тесты меняют общие данные (корзина, заказы, остатки) — по одному, по порядку
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.QA_URL ?? 'http://localhost:3100',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1366, height: 860 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // движок Chrome — установленный в Windows Microsoft Edge (тот же Chromium), скачивать не нужно
    { name: 'chromium', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1366, height: 860 } } },
    // движок Safari — то же, что у iPhone
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 860 } } },
    // Firefox 155 из комплекта Playwright на этом ПК не запускается из Node (Windows: «side-by-side configuration»,
    // сборка mozglue) — включается вручную: QA_FIREFOX=1 npx playwright test --project=firefox
    ...(process.env.QA_FIREFOX ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 860 } } }] : []),
  ],
});
