import { expect, test } from '@playwright/test';
import { signedIn, USERS } from './helpers';

/** Этап 7: техподдержка и мониторинг. */
test.describe('Поддержка и мониторинг', () => {
  test('ФТ-30. Обращение: судовладелец пишет с сайта → сотрудник отвечает в панели → ответ виден в профиле', async ({ browser, browserName }) => {
    const text = `Автотест ${browserName}: нужен прайс на фильтры ${Date.now()}`;

    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await signedIn(owner, USERS.owner2, '/');
    await owner.getByRole('button', { name: 'Помощь' }).click();
    const dialog = owner.getByRole('dialog');
    await expect(dialog.getByText('Помощь и обратная связь')).toBeVisible();
    await dialog.getByRole('button', { name: /Предложение/ }).click();
    await dialog.getByRole('textbox').fill(text);
    await dialog.getByRole('button', { name: 'Отправить' }).click();
    await expect(owner.getByText(/Обращение ОБР-\d{6} отправлено/)).toBeVisible();

    const staffCtx = await browser.newContext();
    const staff = await staffCtx.newPage();
    await signedIn(staff, USERS.sales, '/panel/support');
    await staff.getByRole('row', { name: new RegExp(text.slice(0, 30)) }).click();
    const drawer = staff.getByRole('dialog');
    await drawer.getByRole('textbox').fill('Прайс отправили на вашу почту.');
    await drawer.getByRole('button', { name: 'Ответить и закрыть' }).click();
    await expect(staff.getByText(/Ответ на ОБР-\d{6} отправлен заказчику/)).toBeVisible();

    await owner.goto('/profile');
    await expect(owner.getByRole('heading', { name: 'Мои обращения' })).toBeVisible();
    const card = owner.locator('.card', { hasText: text });
    await expect(card.getByText('Прайс отправили на вашу почту.')).toBeVisible();
    await expect(card.getByText('Решено')).toBeVisible();
    await ownerCtx.close();
    await staffCtx.close();
  });

  test('ФТ-31. Мониторинг у администратора: состояние, доступность, время ответа, журнал ошибок', async ({ page }) => {
    await signedIn(page, USERS.admin, '/panel/monitoring');
    await expect(page.getByText(/Система работает нормально|Требует внимания/)).toBeVisible();
    await expect(page.getByText('Время ответа API, p95 за час')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Запросы за последний час' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Журнал ошибок сервера' })).toBeVisible();
  });

  test('ФТ-32. Мониторинг скрыт от сотрудника склада', async ({ page }) => {
    await signedIn(page, USERS.warehouse, '/panel');
    await expect(page.getByRole('menuitem', { name: /Обращения/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Мониторинг/ })).toHaveCount(0);
  });
});
