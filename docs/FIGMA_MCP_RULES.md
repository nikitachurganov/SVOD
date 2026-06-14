# Figma MCP Rules — СВОД

## Когда применять

Задача содержит:

- Figma URL с `node-id`
- «Сверстать по макету», «редизайн», «как в Figma»
- Ссылку на дизайн-файл СВОД

## Workflow

### 1. Получить контекст

```
fileKey — из URL figma.com/design/:fileKey/...
nodeId  — из node-id=422-5430 → 422:5430
```

Инструменты (Figma MCP):

- `get_design_context` — primary (код-референс, screenshot, metadata)
- `get_screenshot` — визуальная сверка
- `get_variable_defs` — токены, если нужны

Перед `use_figma` — загрузить skill `figma-use`.

### 2. Читать из макета

Обязательно извлечь:

- размеры (width, height)
- padding, gap
- colors (сопоставить с `--app-*` / `--brand-*`)
- typography (font-size, line-height, weight)
- border-radius, borders
- shadows
- layout (flex direction, alignment)
- states (default, hover, active, disabled, loading, error)
- структуру слоёв (не плоский div)

### 3. Реализация

- **Настоящие React-компоненты**, не картинка макета.
- **Ant Design** — базовые контролы (Button, Input, Select, Avatar, Dropdown, …).
- **CSS-классы** в `index.css` с префиксом `app-` для shell/layout.
- **Токены** из `brand-tokens.css`, не hardcode hex если есть переменная.
- **Не менять весь экран**, если задача — один компонент (например, org block в sidebar).

### 4. Адаптация MCP-кода

MCP возвращает Tailwind-референс. **Не добавлять Tailwind.**

Конвертировать в:

- CSS classes + `--app-*` variables
- Ant Design components
- Существующие паттерны проекта (см. `AppSidebar`, `OrganizationSwitcher`)

### 5. Сверка

После реализации:

- Сравнить со screenshot из Figma
- Проверить responsive (sidebar collapsed/expanded)
- `npm run lint && npm run build`

### 6. Отчёт

```md
### Figma implementation
- Node: [node-id]
- Реализовано: ...
- Расхождения: ... (и почему)
```

## Примеры из проекта

| Node | Компонент |
|------|-----------|
| Sidebar org block | `OrganizationSwitcher`, `SidebarOrgActions`, `.app-sidebar__org` |
| Profile dropdown | `HeaderProfileMenu` |
| Requests table | `RequestsPage` + Card wrapper |

## Запрещено

- Подбирать размеры «на глаз», если они есть в Figma
- Вставлять Figma export PNG/SVG вместо UI
- Добавлять Tailwind / новую UI-библиотеку
- Менять unrelated sections при точечной задаче
- Игнорировать hover/active/disabled states

## Design file

СВОД Figma: `yVoUXpjNKwi4srpF3wqTHx`

## Skills (Cursor)

- `figma-use` — перед `use_figma`
- `figma-generate-design` — full page from code
- `figma-generate-library` — design system

Для точечных UI-задач достаточно `get_design_context` + ручная адаптация.
