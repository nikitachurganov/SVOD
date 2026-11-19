/** Browser smoke test against isolated API fixtures; never contacts or mutates the real backend.
 * Build surveys first. Set PLAYWRIGHT_MODULE_PATH if Playwright is provided outside this repo.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const platform = process.env.RESEARCH_APP_MODE === 'platform';
const origin = process.env.RESEARCH_TEST_URL || 'http://127.0.0.1:5177';
const server = process.env.RESEARCH_TEST_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', platform ? 'dist' : 'dist-surveys', '--host', '127.0.0.1', '--port', '5177', '--strictPort'], { stdio: 'ignore', windowsHide: true });
if (server) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Vite is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) { server.kill(); await browser.close(); throw new Error('Local Vite did not start'); }
}
const output = process.env.RESEARCH_SCREENSHOT_DIR || join(tmpdir(), 'svod-research-checks');
await mkdir(output, { recursive: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const timestamp = '2026-11-10T10:00:00Z';
const org = { id: 'team-one', name: 'Продуктовая команда', owner_user_id: 'tester', is_personal: true, my_role: 'owner', members_count: 1 };
const team = { ...org, id: 'team-two', name: 'Другая команда', is_personal: false };
const project = { id: 'project-one', organization_id: org.id, name: 'Клиентский опыт', color: 'orange', description: 'Проверка гипотез', surveys_count: 1, created_at: timestamp, updated_at: timestamp };
let survey = { id: 'study-one', name: 'Опыт доставки', description: '', status: 'draft', organization_id: org.id, project_id: project.id, project_name: project.name, author: { id: 'tester', first_name: 'Анна', last_name: 'Исследователь', middle_name: null, email: 'test@example.invalid' }, methodology_names: [], questions_count: 1, responses_count: 2, public_token: 'fixture-token', created_at: timestamp, updated_at: timestamp, anonymous: true, closes_at: null, methodology_meta: null, methodology_summary: null, pages: [{ id: 'page-one', title: 'Вопросы', fields: [{ id: 'q-one', type: 'radio', label: 'Удобна ли доставка?', required: true, options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] }] }] };
const templates = [['usability', 'Юзабилити-тестирование нового продукта', 5], ['insights', 'Сбор инсайтов о функциях', 4], ['cta', 'Тестирование расположения CTA', 4], ['nps', 'Лояльность клиентов — NPS', 2], ['csat', 'Удовлетворённость клиентов — CSAT', 2], ['ces', 'Простота взаимодействия — CES', 2], ['sus', 'Удобство продукта — SUS', 10], ['ueq', 'Впечатление от продукта — UEQ', 26], ['needs', 'Потребности клиентов', 5], ['purchase', 'Обратная связь после покупки', 5], ['brand', 'Узнаваемость бренда', 4], ['event', 'Отзыв о мероприятии', 6], ['employee', 'Вовлечённость сотрудников', 6], ['course', 'Оценка обучения', 5], ['price', 'Восприятие цены', 4]].map(([id, name, questions_count]) => ({ id, name, questions_count, description: 'Готовая анкета', methodology_id: id }));
const question = { field_id: 'q-one', label: 'Удобна ли доставка?', type: 'radio', methodology: null, kind: 'choice', answered: 2, shown: 2, options: [{ label: 'Да', count: 1, percent: 50 }, { label: 'Нет', count: 1, percent: 50 }], mean: null, median: null, mode: null, std: null, distribution: [], samples: [] };
const results = { total: 2, used: 2, excluded: 0, exclude_flagged: true, median_duration_seconds: 20, mean_duration_seconds: 20, completion_rate: 100, first_response_at: timestamp, last_response_at: timestamp, responses_by_day: [{ date: '2026-11-10', count: 2 }], metrics: [], questions: [question] };
let readonly = false;
let failResults = false;
let failPublish = false;
let aiCalls = 0;
let createCalls = 0;
let templateCalls = 0;
let templateCreated = null;
let failTemplate = false;
let failHome = false;
let extraSurveys = [];
let projectList = [project];
let delayCatalog = false;
let oldCatalogPending = false;
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => { localStorage.setItem('access_token', 'fixture-only'); localStorage.setItem('active_organization_id', 'team-one'); });
await context.route('**/*', async (route) => {
  const request = route.request();
  if (!['xhr', 'fetch'].includes(request.resourceType())) return route.continue();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^.*?(?=\/(?:auth|organizations|surveys|survey-projects|survey-templates|billing|notifications|methodologies)(?:\/|$))/, '');
  const method = request.method();
  const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path === '/auth/me') return reply({ id: 'tester', firstName: 'Анна', lastName: 'Исследователь', email: 'test@example.invalid', emailVerified: true, createdAt: timestamp });
  if (path === '/organizations/default') return reply({ ...org, my_role: readonly ? 'reader' : 'owner' });
  if (path === '/organizations/my') return reply([{ ...org, my_role: readonly ? 'reader' : 'owner' }, team]);
  if (path.endsWith('/seat-usage')) return reply({ billing_enabled: false });
  if (path === '/billing/subscription') return reply({ billing_enabled: false, enforced: false, plan: { code: 'start', title: 'Старт', limits: {}, features: [] }, usage: { ai_tokens: { used: 0, max: 100000 } } });
  if (path === '/billing/plans') return reply({ plans: [], payments_enabled: false });
  if (path === '/notifications') return reply({ items: [], unread_count: 0 });
  if (path.includes('invitations')) return reply([]);
  if (path === '/survey-projects' && method === 'POST') {
    const created = { ...project, ...request.postDataJSON(), id: 'new-project', surveys_count: 0 };
    projectList.push(created);
    return reply(created, 201);
  }
  if (path === '/survey-projects') return reply(url.searchParams.get('organization_id') === team.id ? [] : projectList);
  if (path.startsWith('/survey-projects/')) {
    const id = path.split('/').at(-1);
    const item = projectList.find((candidate) => candidate.id === id);
    if (!item) return reply({ detail: 'Project not found' }, 404);
    if (method === 'PUT') Object.assign(item, request.postDataJSON());
    if (method === 'DELETE') {
      if (item.surveys_count) return reply({ detail: 'project_not_empty' }, 409);
      projectList = projectList.filter((candidate) => candidate.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    return reply(item);
  }
  if (path === '/surveys/ai-builder') {
    aiCalls++;
    return reply({ title: aiCalls === 1 ? 'Новый опрос об опыте' : 'Уточнённый опрос', reply: aiCalls === 1 ? 'Черновик готов. Проверьте его в конструкторе.' : 'Предлагаю нейтральную формулировку.', pages: [{ title: 'Вопросы', fields: [{ id: 'q-one', type: 'shortText', label: aiCalls === 1 ? 'Что можно улучшить?' : 'Как прошла доставка?', required: false }] }], methodology_meta: null, methodology_summary: null });
  }
  if (path === '/surveys' && method === 'POST') {
    createCalls++;
    const body = request.postDataJSON();
    survey = { ...survey, ...body, id: 'created-study', project_id: body.project_id || project.id, questions_count: 1 };
    return reply(survey);
  }
  if (path === '/surveys/from-template' && method === 'POST') {
    templateCalls++;
    if (failTemplate) return reply({ detail: 'fixture_failure' }, 500);
    const body = request.postDataJSON();
    templateCreated = { ...survey, ...body, id: 'template-created', status: 'draft', responses_count: 0 };
    return reply(templateCreated, 201);
  }
  if (path === '/surveys') {
    const snapshot = url.searchParams.get('organization_id') === team.id ? [] : [survey, ...extraSurveys];
    if (delayCatalog && url.searchParams.get('organization_id') === org.id) {
      oldCatalogPending = true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return failHome ? reply({ detail: 'fixture_failure' }, 500) : reply(snapshot);
  }
  if (path === `/surveys/${survey.id}/project` && method === 'PATCH') {
    const target = projectList.find((item) => item.id === request.postDataJSON().project_id);
    survey = { ...survey, project_id: target.id, project_name: target.name };
    return reply(survey);
  }
  if (path.match(/^\/surveys\/[^/]+\/status$/)) {
    if (failPublish) return reply({ detail: 'network_test' }, 500);
    survey = { ...survey, status: request.postDataJSON().status };
    return reply(survey);
  }
  if (path.match(/^\/surveys\/[^/]+\/results$/)) return failResults ? reply({ detail: 'fixture_failure' }, 500) : reply(results);
  if (path.endsWith('/ai-summary')) return reply({ bullets: ['Мнения о доставке разделились'], evidence: [['q-one']], generated_at: timestamp, responses_used: 2, exclude_flagged: true, stale: false });
  if (path.match(/^\/surveys\/[^/]+\/responses$/)) return reply({ total: 0, items: [], limit: 20, offset: 0 });
  if (path.match(/^\/surveys\/[^/]+$/)) {
    if (method === 'DELETE') { survey = { ...survey, status: 'archived' }; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/surveys/template-created') return reply(templateCreated);
    if (method === 'PUT') survey = { ...survey, ...request.postDataJSON() };
    return reply(survey);
  }
  if (path === '/survey-templates') return reply(templates);
  if (path.startsWith('/survey-templates/')) return reply({ ...templates.find((item) => path.endsWith(item.id)), pages: survey.pages, methodology_meta: {} });
  if (path === '/methodologies') return reply({ version: '1', categories: [], methodologies: [] });
  // Unknown API endpoints are refused, so fixture omissions cannot reach live data.
  if (/^\/(auth|organizations|surveys|survey-projects|survey-templates|billing|notifications|methodologies)(\/|$)/.test(path)) return reply({ detail: 'unhandled_fixture', path }, 404);
  return route.abort();
});
const page = await context.newPage();
let acceptNativeDialogs = true;
page.on('dialog', (dialog) => acceptNativeDialogs ? dialog.accept() : dialog.dismiss());
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const visible = async (locator) => { await locator.waitFor({ state: 'visible', timeout: 20000 }); };
const openWorkspace = async () => {
  const switcher = page.getByRole('button', { name: 'Рабочее пространство', exact: true });
  if (await page.locator('aside[inert]').count()) await page.getByRole('button', { name: 'Открыть боковую навигацию', exact: true }).click();
  await switcher.click();
};
const screenshot = async (name) => page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
try {
  if (platform) {
    await page.goto(`${origin}/surveys`);
    await visible(page.getByRole('heading', { name: 'Создайте опрос с помощью ИИ', level: 1 }));
    await visible(page.getByRole('link', { name: project.name, exact: true }).first());
    assert(await page.locator('.app-home-surface').count() === 0, 'Platform keeps its existing survey page');
    assert(await page.locator('.app-surveys-shell').count() === 0, 'Platform keeps its existing shell');
    await page.goto(`${origin}/`);
    await page.waitForURL('**/requests');
    assert(await page.locator('.app-surveys-shell').count() === 0, 'Platform landing remains requests');
    console.log('PASS: full platform preserves survey page, shell and root redirect.');
  } else {
  await page.goto(`${origin}/surveys`);
  await visible(page.getByRole('heading', { name: /^(Доброе утро|Добрый день|Добрый вечер), Анна!$/, level: 3 }));
  await visible(page.getByRole('link', { name: survey.name, exact: true }));
  assert(await page.locator('header.app-content-header').count() === 0, 'Home must not have a separate header');
  assert(await page.locator('aside .workspace-switcher').count() === 1, 'Workspace belongs in the sidebar');
  assert(await page.locator('aside.app-sidebar').count() === 1, 'Home must have a permanent desktop sidebar');
  assert(await page.getByRole('button', { name: 'Новое исследование', exact: true }).count() === 1, 'Home must have one creation menu');
  await visible(page.getByRole('button', { name: 'Лояльность клиентов — NPS', exact: true }));
  assert(await page.getByRole('link', { name: /Все шаблоны/ }).innerText().then((text) => text.includes('+11')), 'Home shows four templates and the +11 card');
  const homeTops = await page.locator('main button, main a').evaluateAll((nodes) => nodes.filter((node) => /Юзабилити|инсайтов|CTA|NPS|Все шаблоны/.test(node.textContent || '') && node.getBoundingClientRect().height > 100).map((node) => Math.round(node.getBoundingClientRect().top)));
  assert(homeTops.length === 5 && new Set(homeTops).size === 1, `Five home cards share one row: ${homeTops}`);
  await screenshot('home-desktop');
  // New dashboard flows use the same isolated fixtures as the editor regression checks.
  await page.getByRole('button', { name: 'Поиск в команде', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск проектов и исследований' }).fill('  ДОСТАВКИ ');
  await page.getByRole('dialog').getByRole('button', { name: /Опыт доставки/ }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Поиск в команде');
  extraSurveys = Array.from({ length: 24 }, (_, i) => ({ ...survey, id: `extra-${String(i).padStart(2, '0')}`, name: `Анкета ${String(i).padStart(2, '0')}`, updated_at: '2026-11-11T10:00:00Z' }));
  extraSurveys.push({ ...survey, id: 'other-author', name: 'Исследование коллеги', updated_at: '2026-11-12T10:00:00Z', author: { ...survey.author, id: 'other' } });
  extraSurveys.push({ ...survey, id: 'archive', name: 'Архивная анкета', status: 'archived' });
  await page.reload();
  await visible(page.getByRole('link', { name: 'Анкета 00', exact: true }));
  assert(await page.locator('.app-research-table tbody tr, .app-research-row').count() === 5, 'Recent list has five studies');
  assert(await page.locator('.app-research-table tbody tr, .app-research-row').first().innerText().then((text) => text.includes('Анкета 00')), 'Equal update times use stable id ordering');
  await page.getByText('Команда', { exact: true }).click();
  await visible(page.getByRole('link', { name: 'Исследование коллеги', exact: true }));
  await page.getByRole('link', { name: 'Смотреть все', exact: true }).click();
  await page.getByRole('heading', { name: 'Исследования', exact: true }).waitFor();
  assert(new URL(page.url()).searchParams.get('scope') === 'team', 'View all transfers ownership scope');
  await page.waitForFunction(() => document.querySelectorAll('.app-research-table tbody tr, .app-research-row').length === 20);
  assert(await page.locator('.app-research-table tbody tr, .app-research-row').count() === 20, 'Full list paginates at twenty');
  await screenshot('studies-desktop');
  await page.getByRole('link', { name: '2', exact: true }).click();
  await page.reload();
  assert(new URL(page.url()).searchParams.get('page') === '2', 'Pagination survives reload');
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  await page.getByRole('textbox', { name: 'Поиск исследования по названию' }).fill('Анкета 23');
  await page.keyboard.press('Escape');
  await visible(page.getByRole('link', { name: 'Анкета 23', exact: true }));
  await page.waitForFunction(() => document.querySelectorAll('.app-research-table tbody tr, .app-research-row').length === 1);
  assert(await page.locator('.app-research-table tbody tr, .app-research-row').count() === 1, 'Search filters the full list');
  await page.reload();
  await page.getByRole('button', { name: /^Фильтры/ }).click();
  assert(await page.getByRole('textbox', { name: 'Поиск исследования по названию' }).inputValue() === 'Анкета 23', 'Search survives reload');
  await page.keyboard.press('Escape');
  await page.goto(`${origin}/surveys/studies?scope=team&status=archived`);
  await visible(page.getByRole('link', { name: 'Архивная анкета', exact: true }));
  assert(await page.locator('.app-research-table tbody tr, .app-research-row').count() === 1, 'Archive requires explicit filter');
  extraSurveys = [];
  await page.goto(`${origin}/surveys/templates`);
  await visible(page.getByRole('button', { name: /Лояльность клиентов — NPS/ }));
  const galleryTops = await page.locator('main button').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 100).map((node) => Math.round(node.getBoundingClientRect().top)));
  assert(galleryTops.length === 15 && new Set(galleryTops).size === 3, `Gallery lists fifteen templates, five per row: ${galleryTops}`);
  await screenshot('templates-desktop');
  await page.getByRole('button', { name: /Лояльность клиентов — NPS/ }).click();
  await visible(page.getByRole('dialog', { name: 'Лояльность клиентов — NPS' }));
  const nameField = page.getByRole('textbox', { name: 'Название исследования' });
  await nameField.fill('Анкета из шаблона');
  const createTemplate = page.getByRole('button', { name: 'Создать черновик', exact: true });
  await createTemplate.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((node) => node.textContent === 'Создать черновик' && !node.disabled));
  assert(templateCalls === 0 && createCalls === 0, 'Preview does not create a survey');
  failTemplate = true;
  await createTemplate.click();
  await visible(page.getByText(/Не удалось создать черновик/));
  assert(await nameField.inputValue() === 'Анкета из шаблона', 'Failed creation preserves entered values');
  failTemplate = false;
  await createTemplate.click();
  await visible(page.getByRole('heading', { name: 'Редактирование опроса' }));
  assert(page.url().includes('/surveys/template-created/edit'), 'Template opens the real saved editor');
  assert(templateCalls === 2 && aiCalls === 0, 'Template retry succeeds without AI');
  for (const slug of ['first-survey', 'results', 'publication', 'team', 'methodologies']) {
    await page.goto(`${origin}/surveys/resources/${slug}`);
    await visible(page.locator('.app-resource-article h1'));
  }
  await page.goto(`${origin}/surveys/resources/missing`);
  await visible(page.getByText('Материал не найден').last());
  readonly = true;
  await page.goto(`${origin}/surveys/templates`);
  await page.getByRole('button', { name: /Лояльность клиентов — NPS/ }).click();
  await visible(page.getByRole('dialog'));
  assert(await page.getByRole('button', { name: 'Создать черновик', exact: true }).count() === 0, 'Reader previews templates without creation');
  readonly = false;
  failHome = true;
  await page.goto(`${origin}/surveys`);
  await visible(page.getByText('Не удалось загрузить исследования', { exact: true }));
  await visible(page.getByRole('button', { name: 'Лояльность клиентов — NPS', exact: true }));
  failHome = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await visible(page.getByRole('link', { name: survey.name, exact: true }));
  await page.goto(`${origin}/surveys/projects`);
  await visible(page.getByRole('heading', { name: 'Проекты', exact: true }));
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Тестовый проект');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать', exact: true }).click();
  await visible(page.getByRole('link', { name: 'Тестовый проект', exact: true }));
  await page.getByRole('button', { name: 'Действия с проектом «Тестовый проект»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Изменить', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Переименованный проект');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await visible(page.getByRole('link', { name: 'Переименованный проект', exact: true }));
  await page.goto(`${origin}/surveys`);
  await page.getByRole('button', { name: 'Действия с исследованием «Опыт доставки»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Переместить в проект', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await page.getByRole('option', { name: 'Переименованный проект', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Переместить', exact: true }).click();
  await visible(page.getByRole('link', { name: 'Переименованный проект', exact: true }));
  assert(survey.project_id === 'new-project', 'Move persists through the API');
  survey = { ...survey, project_id: project.id, project_name: project.name };
  await page.goto(`${origin}/surveys/projects`);
  await page.getByRole('button', { name: 'Действия с проектом «Переименованный проект»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Удалить', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('link', { name: 'Переименованный проект', exact: true }).waitFor({ state: 'hidden' });
  assert(projectList.length === 1, 'Empty project deletion persists');
  await page.goto(`${origin}/surveys`);
  await page.getByRole('button', { name: 'Действия с исследованием «Опыт доставки»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Архивировать', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Отмена', exact: true }).click();
  assert(survey.status === 'draft', 'Cancelling archive preserves status');
  await page.getByRole('button', { name: 'Действия с исследованием «Опыт доставки»', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Архивировать', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Архивировать', exact: true }).click();
  await page.getByRole('link', { name: 'Опыт доставки', exact: true }).waitFor({ state: 'hidden' });
  assert(survey.status === 'archived', 'Archive persists through the API');
  survey = { ...survey, status: 'draft' };
  await page.reload();
  await visible(page.getByRole('link', { name: 'Опыт доставки', exact: true }));
  delayCatalog = true;
  await page.evaluate(() => window.dispatchEvent(new Event('surveys:changed')));
  for (let attempt = 0; !oldCatalogPending && attempt < 20; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(oldCatalogPending, 'Race test must have an outstanding previous-workspace request');
  await openWorkspace();
  await page.getByRole('menuitem', { name: /Другая команда/ }).click();
  await visible(page.getByText('Исследований пока нет или они не соответствуют фильтрам'));
  await page.waitForTimeout(700);
  assert(await page.getByRole('link', { name: survey.name, exact: true }).count() === 0, 'Late previous-workspace response is ignored');
  delayCatalog = false;
  await openWorkspace();
  await page.getByRole('menuitem', { name: /Продуктовая команда/ }).click();
  await visible(page.getByRole('link', { name: survey.name, exact: true }));
  console.log('Dashboard search, filters, pagination, templates, resources, project actions, archive and workspace race passed');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await visible(page.locator(`html[data-theme="${scheme}"]`));
    for (const width of [1920, 1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1200 });
      await visible(page.getByRole('heading', { name: /^(Доброе утро|Добрый день|Добрый вечер), Анна!$/, level: 3 }));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow: ${scheme} ${width}`);
      if (width < 768) assert(await page.locator('.app-research-table thead').evaluate((node) => getComputedStyle(node).display === 'none'), 'Mobile uses cards');
      await screenshot(`populated-home-${scheme}-${width}`);
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('Home and workspace header passed');
  await page.getByRole('link', { name: survey.name, exact: true }).click();
  await visible(page.getByRole('tab', { name: 'Публикация', exact: true }));
  await page.getByRole('button', { name: 'Свернуть навигацию' }).click();
  assert(await page.locator('.app-shell-grid--collapsed').count() === 1, 'Desktop navigation must collapse');
  await page.getByRole('button', { name: 'Рабочее пространство', exact: true }).click();
  await visible(page.getByRole('menuitem', { name: /Продуктовая команда/ }));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Развернуть навигацию' }).click();
  assert(await page.locator('.survey-ai-dock').count() === 0, 'AI must start closed');
  await visible(page.getByRole('link', { name: project.name, exact: true }).first());
  await page.getByRole('button', { name: 'Спросить ИИ', exact: true }).click();
  await visible(page.locator('.survey-ai-dock'));
  await page.getByRole('button', { name: 'Закрыть ИИ-помощника' }).click();
  await page.getByRole('tab', { name: 'Публикация', exact: true }).click();
  await visible(page.getByRole('button', { name: 'Опубликовать опрос', exact: true }));
  failPublish = true;
  await page.getByRole('button', { name: /Опубликовать опрос/ }).click();
  await visible(page.getByText('Не удалось изменить статус', { exact: true }));
  assert(survey.status === 'draft', 'Failed publication must retain draft status');
  failPublish = false;
  await page.getByRole('button', { name: /Опубликовать опрос/ }).click();
  await visible(page.getByLabel('Ссылка для респондентов'));
  assert(survey.status === 'open', 'Publication must update the real status');
  await page.getByRole('button', { name: 'Остановить приём ответов', exact: true }).click();
  await visible(page.getByRole('dialog', { name: 'Остановить приём ответов?' }));
  await page.getByRole('button', { name: 'Продолжить сбор', exact: true }).click();
  await page.getByRole('dialog', { name: 'Остановить приём ответов?' }).waitFor({ state: 'hidden' });
  assert(survey.status === 'open', 'Cancelling stop must preserve collection');
  await screenshot('publication-desktop');
  console.log('Publication error/retry and stop confirmation passed');
  await page.getByRole('tab', { name: 'Результаты', exact: true }).click();
  await page.getByRole('tab', { name: 'ИИ-инсайты', exact: true }).click();
  await visible(page.getByText('Мнения о доставке разделились'));
  await page.getByRole('button', { name: question.label, exact: true }).click();
  await visible(page.locator('#question-q-one'));
  assert(page.url().includes('/results/questions#question-q-one'), 'Evidence must lead to question aggregates');
  await screenshot('question-evidence-desktop');
  console.log('Insight evidence navigation passed');
  await page.goto(`${origin}/surveys/create?project=${project.id}`);
  await visible(page.getByRole('heading', { name: 'Какой опрос создадим?' }));
  await page.getByRole('textbox', { name: 'Сообщение ИИ' }).fill('Помоги исследовать опыт доставки');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await visible(page.getByRole('button', { name: 'Открыть черновик в конструкторе' }));
  await page.reload();
  await visible(page.getByRole('button', { name: 'Открыть черновик в конструкторе' }));
  assert(aiCalls === 1, 'Reload must recover the draft without regenerating it');
  await page.getByRole('button', { name: 'Открыть черновик в конструкторе' }).click();
  await visible(page.getByRole('heading', { name: 'Редактирование опроса' }));
  console.log('AI draft recovery and editor handoff passed');
  assert(createCalls === 1, 'AI handoff must create exactly one survey');
  await visible(page.getByText('Черновик готов. Проверьте его в конструкторе.', { exact: true }));
  await page.locator('.ai-composer textarea').fill('Сделай вопрос нейтральным');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await visible(page.getByRole('button', { name: 'Применить изменения' }));
  await screenshot('ai-proposal-desktop');
  assert(await page.getByPlaceholder('Название опроса').inputValue() === 'Новый опрос об опыте', 'Proposal must not auto-apply');
  await page.getByRole('button', { name: 'Применить изменения' }).click();
  assert(await page.getByPlaceholder('Название опроса').inputValue() === 'Уточнённый опрос', 'Apply must update the structured editor');
  await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
  assert(await page.getByPlaceholder('Название опроса').inputValue() === 'Новый опрос об опыте', 'Undo must restore the draft');
  await page.getByPlaceholder('Название опроса').fill('Несохранённая работа');
  await page.getByRole('tab', { name: 'Публикация', exact: true }).click();
  await visible(page.getByRole('dialog', { name: 'Оставить несохранённые изменения?' }));
  await page.getByRole('button', { name: 'Остаться', exact: true }).click();
  await page.getByRole('dialog', { name: 'Оставить несохранённые изменения?' }).waitFor({ state: 'hidden' });
  assert(await page.getByPlaceholder('Название опроса').inputValue() === 'Несохранённая работа', 'Cancelling navigation must keep edits');
  await screenshot('builder-desktop');
  acceptNativeDialogs = false;
  await openWorkspace();
  await page.getByRole('menuitem', { name: /Другая команда/ }).click();
  assert(await page.evaluate(() => localStorage.getItem('active_organization_id')) === org.id, 'Cancelling workspace switch must preserve the context');
  assert(await page.getByPlaceholder('Название опроса').inputValue() === 'Несохранённая работа', 'Cancelling workspace switch must keep edits');
  acceptNativeDialogs = true;
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await visible(page.getByRole('heading', { name: 'Несохранённая работа' }));
  assert(survey.name === 'Несохранённая работа', 'Save must persist through the API');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Публикация', exact: true }).click();
  await visible(page.getByLabel('Ссылка для респондентов'));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile must not overflow');
  await screenshot('publication-mobile');
  readonly = true;
  await page.goto(`${origin}/surveys/${survey.id}/results/insights`);
  await visible(page.getByText('Мнения о доставке разделились'));
  assert(await page.getByRole('button', { name: 'Обновить', exact: true }).count() === 0, 'Reader must not run AI generation');
  assert(await page.getByRole('button', { name: 'Спросить ИИ', exact: true }).count() === 0, 'Reader must not open AI');
  readonly = false;
  failResults = true;
  await page.goto(`${origin}/surveys/${survey.id}/publication`);
  await visible(page.getByRole('heading', { name: 'Подготовьте опрос к встрече с аудиторией' }));
  await page.goto(`${origin}/surveys/create?mode=manual`);
  await visible(page.getByPlaceholder('Название опроса'));
  assert(await page.locator('.ai-composer').count() === 0, 'Manual creation must start without AI');
  await page.getByPlaceholder('Название опроса').fill('Ручное исследование');
  await openWorkspace();
  await page.getByRole('menuitem', { name: /Другая команда/ }).click();
  await visible(page.getByRole('heading', { name: /^(Доброе утро|Добрый день|Добрый вечер), Анна!$/, level: 3 }));
  assert(await page.evaluate(() => localStorage.getItem('active_organization_id')) === team.id, 'Confirmed switch must select the new workspace');
  assert(await page.getByRole('link', { name: project.name, exact: true }).count() === 0, 'Previous workspace projects must be cleared');
  for (const width of [390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('heading', { name: /^(Доброе утро|Добрый день|Добрый вечер), Анна!$/, level: 3 }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No overflow at ${width}px`);
    await screenshot(`home-light-${width}`);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await visible(page.locator('html[data-theme="dark"]'));
  await screenshot('home-dark-desktop');
  assert(await page.locator('.app-home-banner h3').evaluate((node) => getComputedStyle(node).color !== 'rgb(0, 0, 0)'), 'Dark theme greeting uses readable foreground');
  await page.goto(`${origin}/surveys/studies`);
  await page.getByRole('heading', { name: 'Исследования', exact: true }).waitFor();
  await screenshot('studies-dark-desktop');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Studies: no overflow at ${width}px`);
    await screenshot(`studies-dark-${width}`);
  }
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: home, collapse, sidebar navigation, AI toggle, publication error/retry, stop confirmation, insight evidence, AI draft recovery/handoff, proposal/apply/undo, unsaved guard, save, mobile layout, reader permissions, results failure isolation, manual creation and guarded workspace switching.');
  console.log(`Screenshots: ${output}`);
  }
} catch (error) {
  await screenshot('failure');
  console.error('Visible page:', await page.locator('body').innerText());
  console.error('Browser errors:', errors);
  console.error('Buttons:', await page.getByRole('button').allTextContents());
  console.error('Accessibility snapshot:', await page.locator('main').ariaSnapshot());
  throw error;
} finally { server?.kill(); await browser.close(); }
