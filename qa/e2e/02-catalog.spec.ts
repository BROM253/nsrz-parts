import { expect, test } from '@playwright/test';
import { apiAs, PARTS, partId, signedIn, USERS } from './helpers';

/** ТЗ п. 4.1.2 А–Б и сценарий 1 п. 4.2: поиск, фильтры, карточка, статусы наличия. */
test.describe('Каталог и карточка запчасти', () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page, USERS.owner1);
    await expect(page.getByRole('heading', { name: 'Какая деталь нужна?' })).toBeVisible();
  });

  const search = (page: import('@playwright/test').Page) => page.getByPlaceholder('Например: 6L20 FF 118 или «фильтр топливный»');

  test('ФТ-08. Поиск по номеру производителя без учёта пробелов и дефисов', async ({ page }) => {
    await search(page).fill('6l20ff 118');
    const card = page.locator('.part-card', { hasText: PARTS.filter.name });
    await expect(card).toBeVisible();
    await expect(page.getByText('1 запчасть', { exact: true })).toBeVisible();
    // в результате — наименование, номер, остаток и цена (критерий приёмки сценария 1)
    await expect(card.getByText(PARTS.filter.catalog)).toBeVisible();
    await expect(card.locator('.price')).toContainText('₽');
    await expect(card.getByText(/в наличии|доступно/i).first()).toBeVisible();
  });

  test('ФТ-09. Поиск по словам наименования и по каталожному номеру НСРЗ', async ({ page }) => {
    await search(page).fill('фильтр топливный');
    await expect(page.locator('.part-card', { hasText: PARTS.filter.name })).toBeVisible();

    await search(page).fill('нсрз-гд-01427');
    await expect(page.locator('.part-card', { hasText: PARTS.filter.name })).toBeVisible();
    await expect(page).toHaveURL(/q=/);
  });

  test('ФТ-10. Пустой результат — подсказка, а не ошибка', async ({ page }) => {
    await search(page).fill('несуществующая деталь zzz');
    await expect(page.getByText('Ничего не нашли.')).toBeVisible();
  });

  test('ФТ-11. Фильтры по категории и типу судна сужают выдачу и сбрасываются', async ({ page }) => {
    const total = page.locator('b', { hasText: /\d+ запчаст/ });
    await expect(total).toHaveText('36 запчастей');
    await page.getByRole('button', { name: /^Насосы/ }).click();
    await expect(total).toHaveText('4 запчасти');
    await expect(page).toHaveURL(/cat=/);
    await page.getByRole('button', { name: /^Буксир/ }).click();
    await expect(total).toHaveText(/^[1-3] запчаст/);
    await page.getByRole('button', { name: 'Все категории' }).click();
    await expect(page).not.toHaveURL(/cat=/);
  });

  test('ФТ-12. Переключатель «Только то, что можно заказать» убирает отсутствующие', async ({ page }) => {
    await search(page).fill('стартер');
    await expect(page.locator('.part-card', { hasText: PARTS.starter.name })).toBeVisible();
    await page.getByRole('switch').click();
    await expect(page.getByText('Ничего не нашли.')).toBeVisible();
    await expect(page).toHaveURL(/only=1/);
  });

  test('ФТ-13. Карточка: описание, остаток, резерв, время обновления; кнопка заказа у отсутствующей детали скрыта', async ({ page }) => {
    await search(page).fill(PARTS.filter.mpn);
    await page.locator('.part-card', { hasText: PARTS.filter.name }).click();
    await expect(page).toHaveURL(/\/parts\/\d+/);
    await expect(page.getByRole('heading', { name: PARTS.filter.name })).toBeVisible();
    for (const label of ['На складе', 'В резерве по заказам', 'Доступно для заказа', 'Остатки обновлены']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /В корзину ·/ })).toBeVisible();

    await page.goto('/');
    await search(page).fill('стартер');
    await page.locator('.part-card', { hasText: PARTS.starter.name }).click();
    await expect(page.getByRole('heading', { name: PARTS.starter.name })).toBeVisible();
    await expect(page.getByRole('button', { name: /В корзину ·/ })).toHaveCount(0);
  });

  test('ФТ-14. Степпер количества не выходит за свободный остаток', async ({ page }) => {
    // склад выставляет остаток так, чтобы свободно было ровно 2 шт.
    const staff = await apiAs(USERS.warehouse);
    const id = await partId(staff, 'Блок однорольный 5 т');
    const { stock } = await (await staff.get(`/api/parts/${id}`)).json();
    await staff.patch(`/api/panel/stock/${id}`, { data: { quantity: stock.reserved + 2, availability: 'IN_STOCK' } });
    await staff.dispose();

    await page.goto(`/parts/${id}`);
    const more = page.getByRole('button', { name: 'Больше' });
    const less = page.getByRole('button', { name: 'Меньше' });
    await expect(less).toBeDisabled(); // меньше 1 нельзя
    await more.click();
    await expect(page.getByRole('button', { name: /В корзину ·/ })).toContainText('24');
    await expect(more).toBeDisabled(); // больше свободного остатка нельзя
  });
});
