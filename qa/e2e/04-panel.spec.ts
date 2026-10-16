import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { apiAs, PARTS, partId, resetOwner, signedIn, USERS } from './helpers';

/** Создать заказ судовладельца 1 через API — для проверок обработки в панели. */
async function makeOrder(quantity = 1) {
  await resetOwner(USERS.owner1);
  const owner = await apiAs(USERS.owner1);
  const me = await (await owner.get('/api/me')).json();
  await owner.post('/api/cart/items', { data: { partId: await partId(owner, PARTS.bearing.name), quantity } });
  const res = await owner.post('/api/orders', { data: { vesselId: me.vessels[0].id, deliveryMethod: 'PICKUP' } });
  expect(res.status()).toBe(201);
  const order = await res.json();
  return { owner, order: order as { id: number; number: string } };
}

/** ТЗ п. 4.1.2 Д, сценарий 3 п. 4.2, статусная модель п. 4.3. */
test.describe('Панель НСРЗ', () => {
  test('ФТ-22. Новый заказ в очереди → «Подтвердить наличие» → заказчик видит новый статус', async ({ page }) => {
    const { owner, order } = await makeOrder();
    await signedIn(page, USERS.sales, '/panel');
    await page.getByPlaceholder('Номер, компания или судно').fill(order.number.replace(/\D/g, ''));
    await page.getByRole('row', { name: new RegExp(order.number) }).click();
    await expect(page).toHaveURL(new RegExp(`/panel/orders/${order.id}`));

    await page.getByRole('button', { name: 'Подтвердить наличие' }).click();
    await expect(page.getByRole('button', { name: 'Начать комплектацию' })).toBeVisible();
    // пропустить шаг нельзя: кнопки «Завершить» на этом этапе нет
    await expect(page.getByRole('button', { name: /Завершить/ })).toHaveCount(0);

    const seen = await (await owner.get(`/api/orders/${order.id}`)).json();
    expect(seen.status).toBe('CONFIRMED');
    await owner.dispose();
  });

  test('ФТ-23. Отклонение требует причину; резерв снимается', async ({ page }) => {
    const { owner, order } = await makeOrder(2);
    const id = await partId(owner, PARTS.bearing.name);
    const reservedBefore = (await (await owner.get(`/api/parts/${id}`)).json()).stock.reserved as number;

    await signedIn(page, USERS.sales, `/panel/orders/${order.id}`);
    await page.getByRole('button', { name: /Отклонить$/ }).click();
    const dialog = page.getByRole('dialog');
    const ok = dialog.getByRole('button', { name: 'Отклонить заказ' });
    await expect(ok).toBeDisabled();
    await dialog.getByText('Другое', { exact: true }).click();
    await expect(ok).toBeDisabled(); // «Другое» без описания нельзя
    await dialog.getByPlaceholder('Опишите причину').fill('Автотест: проверка отклонения');
    await ok.click();
    await expect(page.getByText('Автотест: проверка отклонения').first()).toBeVisible();

    const after = await (await owner.get(`/api/parts/${id}`)).json();
    expect(after.stock.reserved).toBe(reservedBefore - 2);
    const seen = await (await owner.get(`/api/orders/${order.id}`)).json();
    expect(seen.status).toBe('REJECTED');
    expect(seen.rejectReason).toBe('Автотест: проверка отклонения');
    await owner.dispose();
  });

  test('ФТ-24. Сценарий 3: склад меняет остаток → судовладелец сразу видит новое число', async ({ page }) => {
    const owner = await apiAs(USERS.owner1);
    const id = await partId(owner, PARTS.filter.name);
    const before = (await (await owner.get(`/api/parts/${id}`)).json()).stock.quantity as number;
    const next = before + 5;

    await signedIn(page, USERS.warehouse, '/panel/stock');
    await page.getByPlaceholder('Номер или наименование').fill(PARTS.filter.catalog);
    const row = page.getByRole('row', { name: new RegExp(PARTS.filter.name) });
    await expect(page.getByRole('row')).toHaveCount(2); // заголовок + найденная строка
    const qty = row.getByRole('spinbutton');
    await qty.fill(String(next));
    await row.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('остаток сохранён').first()).toBeVisible();

    const seen = await (await owner.get(`/api/parts/${id}`)).json();
    expect(seen.stock.quantity).toBe(next);
    await owner.dispose();
  });

  test('ФТ-25. Загрузка остатков из CSV: верные строки применяются, ошибки показываются построчно', async ({ page }, info) => {
    mkdirSync(info.outputDir, { recursive: true });
    const file = join(info.outputDir, 'остатки.csv');
    writeFileSync(
      file,
      '﻿каталожный номер;количество;статус\r\n' +
        'НСРЗ-НС-03045;77;в наличии\r\n' + // подшипник насоса — верная строка
        'НСРЗ-XX-00000;5;в наличии\r\n' + // такого номера нет
        'НСРЗ-ГД-00981;-3;в наличии\r\n', // отрицательное количество
    );
    await signedIn(page, USERS.warehouse, '/panel/stock');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Загрузить файл' }).click();
    await (await chooser).setFiles(file);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Файл «остатки.csv» обработан')).toBeVisible();
    await expect(dialog.getByText('не найден в каталоге')).toBeVisible();
    await expect(dialog.getByText(/нужно целое число от 0/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Готово' }).click();

    const api = await apiAs(USERS.warehouse);
    const part = await (await api.get(`/api/parts/${await partId(api, PARTS.bearing.name)}`)).json();
    expect(part.stock.quantity).toBe(77);
    await api.dispose();
  });

  test('ФТ-26. Неподдерживаемый файл отклоняется с понятным сообщением', async ({ page }, info) => {
    mkdirSync(info.outputDir, { recursive: true });
    const file = join(info.outputDir, 'фото.png');
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await signedIn(page, USERS.warehouse, '/panel/stock');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Загрузить файл' }).click();
    await (await chooser).setFiles(file);
    await expect(page.getByText('Поддерживаются файлы .csv и .xlsx')).toBeVisible();
  });

  test('ФТ-27. Статистика и справочники открываются, у склада нет кнопки создания пользователя', async ({ page }) => {
    await signedIn(page, USERS.warehouse, '/panel/stats');
    await expect(page.getByText(/заказ/i).first()).toBeVisible();
    await page.goto('/panel/admin');
    await expect(page.getByText('Пользователи', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить пользователя' })).toHaveCount(0);
  });

  test('ФТ-29. HTML в комментарии заказчика показывается текстом и не исполняется (XSS), CSP не мешает сайту', async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy|Content-Security-Policy/i.test(m.text())) cspErrors.push(m.text());
    });
    await resetOwner(USERS.owner1);
    const owner = await apiAs(USERS.owner1);
    const me = await (await owner.get('/api/me')).json();
    await owner.post('/api/cart/items', { data: { partId: await partId(owner, PARTS.bearing.name), quantity: 1 } });
    const payload = '<img src=x onerror="window.__xss=1">Проверка';
    const res = await owner.post('/api/orders', { data: { vesselId: me.vessels[0].id, deliveryMethod: 'PICKUP', comment: payload } });
    const order = await res.json();

    await signedIn(page, USERS.sales, `/panel/orders/${order.id}`);
    await expect(page.getByText(payload)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(cspErrors).toEqual([]);
    await owner.dispose();
  });

  test('ФТ-28. Администратор: форма нового пользователя проверяет обязательные поля', async ({ page }) => {
    await signedIn(page, USERS.admin, '/panel/admin');
    await page.getByRole('button', { name: 'Добавить пользователя' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый пользователь' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(dialog.locator('.ant-form-item-explain-error').first()).toBeVisible(); // пустую форму отправить нельзя
    await expect(dialog).toBeVisible();
  });
});
