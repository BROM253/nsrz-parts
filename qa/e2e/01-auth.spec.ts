import { expect, test } from '@playwright/test';
import { apiLogin, signedIn, USERS } from './helpers';

/** ТЗ п. 4.6: вход по номеру телефона и SMS-коду либо по корпоративной почте. */
test.describe('Вход и выход', () => {
  test('ФТ-01. Кнопка «Получить код» неактивна, пока поле пустое', async ({ page }) => {
    await page.goto('/login');
    const button = page.getByRole('button', { name: 'Получить код' });
    await expect(button).toBeDisabled();
    await page.getByPlaceholder('+7 900 000-00-00 или почта').fill('   ');
    await expect(button).toBeDisabled();
    await page.getByPlaceholder('+7 900 000-00-00 или почта').fill('+7 900');
    await expect(button).toBeEnabled();
  });

  test('ФТ-02. Неверный формат номера и незнакомый номер — понятные ошибки', async ({ page }) => {
    await page.goto('/login');
    const input = page.getByPlaceholder('+7 900 000-00-00 или почта');
    await input.fill('12345');
    await page.getByRole('button', { name: 'Получить код' }).click();
    await expect(page.getByText('Введите номер телефона в формате +7 900 000-00-00')).toBeVisible();

    await input.fill('+7 999 000-11-22');
    await input.press('Enter');
    await expect(page.getByText('Пользователь не найден')).toBeVisible();
  });

  test('ФТ-03. Вход судовладельца по коду: неверный код → ошибка, верный → каталог', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('+7 900 000-00-00 или почта').fill(USERS.owner2);
    await page.getByRole('button', { name: 'Получить код' }).click();
    await expect(page.getByRole('heading', { name: 'Введите код' })).toBeVisible();

    const hint = page.locator('.demo-hint b');
    const code = (await hint.textContent())!.trim();
    const wrong = code === '1111' ? '2222' : '1111';

    await page.getByLabel('Цифра 1').fill(wrong);
    await expect(page.getByText(/Неверный код\. Осталось попыток: 4/).first()).toBeVisible();

    await page.getByLabel('Цифра 1').fill(code);
    await expect(page.getByRole('heading', { name: 'Какая деталь нужна?' })).toBeVisible();
    await expect(page.getByLabel('Корзина')).toBeVisible();
  });

  test('ФТ-04. Сотрудник входит по почте и попадает в панель НСРЗ', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Сотрудник НСРЗ', { exact: true }).click();
    await page.getByRole('button', { name: 'Склад' }).click();
    const code = (await page.locator('.demo-hint b').textContent())!.trim();
    await page.getByLabel('Цифра 1').fill(code);
    await expect(page).toHaveURL(/\/panel/);
    await expect(page.getByText('Остатки на складе').first()).toBeVisible();
  });

  test('ФТ-05. «Выйти» завершает сессию: страница входа, защищённые адреса закрыты', async ({ page }) => {
    await signedIn(page, USERS.owner1, '/orders');
    await expect(page.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('nsrz.tokens'))).toBeNull();

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
  });

  test('ФТ-06. Разграничение ролей в интерфейсе: судовладельца не пускает в панель', async ({ page }) => {
    await signedIn(page, USERS.owner1, '/panel/stock');
    await expect(page).not.toHaveURL(/\/panel/);
    await expect(page.getByRole('heading', { name: 'Какая деталь нужна?' })).toBeVisible();
  });

  test('ФТ-07. Истёкший access-токен незаметно обновляется по refresh-токену', async ({ page }) => {
    // свежая пара токенов: refresh-токен из кэша мог быть отозван тестом выхода
    const tokens = await apiLogin(USERS.owner1, true);
    const broken = { ...tokens, accessToken: tokens.accessToken.slice(0, -4) + 'AAAA' };
    await page.addInitScript((t) => localStorage.setItem('nsrz.tokens', JSON.stringify(t)), broken);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
  });
});
