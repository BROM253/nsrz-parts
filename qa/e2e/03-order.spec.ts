import { expect, test } from '@playwright/test';
import { apiAs, PARTS, partId, resetOwner, signedIn, USERS } from './helpers';

/** ТЗ п. 4.1.2 В–Г и сценарий 2 п. 4.2: корзина, оформление, защита от повторов, история. */
test.describe('Корзина и оформление заказа', () => {
  test.beforeEach(async () => {
    await resetOwner(USERS.owner1);
  });

  test('ФТ-15. «В корзину» из каталога: счётчик на иконке корзины растёт', async ({ page }) => {
    await signedIn(page, USERS.owner1);
    await page.getByPlaceholder('Например: 6L20 FF 118 или «фильтр топливный»').fill(PARTS.bearing.mpn);
    const card = page.locator('.part-card', { hasText: PARTS.bearing.name });
    await card.getByRole('button', { name: 'В корзину' }).click();
    await expect(card.getByRole('button', { name: 'Добавлено' })).toBeVisible();
    await expect(page.getByLabel('Корзина')).toContainText('1');
  });

  test('ФТ-16. Корзина: изменить количество, удалить позицию, пустая корзина', async ({ page }) => {
    const owner = await apiAs(USERS.owner1);
    await owner.post('/api/cart/items', { data: { partId: await partId(owner, PARTS.bearing.name), quantity: 2 } });
    await signedIn(page, USERS.owner1, '/cart');
    await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible();
    const line = page.locator('.card', { hasText: PARTS.bearing.name }).first();
    await line.getByRole('button', { name: 'Больше' }).click();
    await expect(line.getByLabel('Количество')).toContainText('3');
    await expect.poll(async () => (await (await owner.get('/api/cart')).json()).items[0]?.quantity).toBe(3);

    await line.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText(PARTS.bearing.name)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Оформить заказ' })).toHaveCount(0);
    await owner.dispose();
  });

  test('ФТ-17. Оформление: судно, доставка, комментарий → «Заказ отправлен» с номером', async ({ page }) => {
    const owner = await apiAs(USERS.owner1);
    await owner.post('/api/cart/items', { data: { partId: await partId(owner, PARTS.bearing.name), quantity: 1 } });
    await signedIn(page, USERS.owner1, '/cart');
    await page.getByRole('button', { name: 'Оформить заказ' }).click();
    await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();

    const vessels = page.locator('section', { hasText: '1. Судно' }).getByRole('button');
    await vessels.last().click();
    await page.locator('section', { hasText: '2. Доставка' }).getByRole('button').last().click();
    await page.getByPlaceholder('Например: нужно до отхода судна в пятницу').fill('Автотест: доставка к причалу');
    await page.getByRole('button', { name: 'Отправить заказ' }).click();

    await expect(page.getByRole('heading', { name: 'Заказ отправлен' })).toBeVisible();
    const number = (await page.locator('.mono', { hasText: /НСРЗ-\d{6}/ }).textContent())!.trim();
    await expect(page.getByText('«Ожидает подтверждения»')).toBeVisible();

    await page.getByRole('button', { name: 'Следить за заказом' }).click();
    await expect(page.getByText(number).first()).toBeVisible();
    await expect(page.getByText('Автотест: доставка к причалу')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Повторить заказ' })).toBeVisible();
    await owner.dispose();
  });

  test('ФТ-18. Двойное нажатие «Отправить заказ» создаёт ровно один заказ', async ({ page }) => {
    const owner = await apiAs(USERS.owner1);
    const before = (await (await owner.get('/api/orders', { params: { status: 'ALL' } })).json()).total;
    await owner.post('/api/cart/items', { data: { partId: await partId(owner, PARTS.bearing.name), quantity: 1 } });
    await signedIn(page, USERS.owner1, '/checkout');
    const send = page.getByRole('button', { name: 'Отправить заказ' });
    await expect(send).toBeEnabled();
    await send.dblclick();
    await expect(page.getByRole('heading', { name: 'Заказ отправлен' })).toBeVisible();
    await expect.poll(async () => (await (await owner.get('/api/orders', { params: { status: 'ALL' } })).json()).total).toBe(before + 1);
    await owner.dispose();
  });

  test('ФТ-19. Точная копия ожидающего заказа не создаётся — предупреждение со ссылкой', async ({ page }) => {
    const owner = await apiAs(USERS.owner1);
    const id = await partId(owner, PARTS.bearing.name);
    const me = await (await owner.get('/api/me')).json();
    await owner.post('/api/cart/items', { data: { partId: id, quantity: 1 } });
    const first = await owner.post('/api/orders', { data: { vesselId: me.vessels[0].id, deliveryMethod: 'PICKUP' } });
    expect(first.status()).toBe(201);

    await owner.post('/api/cart/items', { data: { partId: id, quantity: 1 } });
    await signedIn(page, USERS.owner1, '/checkout');
    await page.getByRole('button', { name: 'Отправить заказ' }).click();
    await expect(page.getByText(/Точно такой же заказ для этого судна уже ждёт подтверждения/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Открыть' })).toBeVisible();
    await owner.dispose();
  });

  test('ФТ-20. Нельзя заказать больше свободного остатка: резерв другого заказчика учитывается', async ({ page }) => {
    await resetOwner(USERS.owner2);
    const owner1 = await apiAs(USERS.owner1);
    const owner2 = await apiAs(USERS.owner2);
    const id = await partId(owner1, PARTS.bearing.name);
    const free = (await (await owner1.get(`/api/parts/${id}`)).json()).stock.available as number;
    expect(free).toBeGreaterThan(1);

    // заказчик 1 кладёт в корзину весь свободный остаток, но пока не оформляет
    expect((await owner1.post('/api/cart/items', { data: { partId: id, quantity: free } })).status()).toBe(201);
    // заказчик 2 успевает оформить 1 штуку — она уходит в резерв
    const me2 = await (await owner2.get('/api/me')).json();
    await owner2.post('/api/cart/items', { data: { partId: id, quantity: 1 } });
    expect((await owner2.post('/api/orders', { data: { vesselId: me2.vessels[0].id, deliveryMethod: 'PICKUP' } })).status()).toBe(201);

    // в корзине заказчика 1 позиция подсвечена, оформить нельзя
    await signedIn(page, USERS.owner1, '/cart');
    await expect(page.getByText(/Уменьшите количество или удалите позицию/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Оформить заказ' })).toBeDisabled();
    await owner1.dispose();
    await owner2.dispose();
  });

  test('ФТ-21. История заказов: фильтр по статусу и экспорт детализации в CSV', async ({ page }) => {
    await signedIn(page, USERS.owner1, '/orders');
    await expect(page.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
    await page.getByText('Завершённые', { exact: true }).click();
    const first = page.locator('.card', { hasText: /НСРЗ-\d{6}/ }).first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.getByText('Завершён').first()).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Экспорт в Excel (CSV)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/НСРЗ-\d{6}\.csv/);
  });
});
