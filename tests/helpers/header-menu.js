export async function openHeaderMenu(page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false')
    await menu.click();
}
