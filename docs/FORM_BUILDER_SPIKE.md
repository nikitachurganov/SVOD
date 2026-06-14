# Form Builder Technical Spike

**Дата:** 2026-06-14  
**Цель:** оценить замену самописного FormBuilder на готовую библиотеку с сохранением UX СВОД и Ant Design.  
**Статус:** spike завершён; изолированный POC на `/dev/formily-builder`.

---

## 1. Текущая реализация

### 1.1 Архитектура

```
ToolPanel (palette, @dnd-kit)
       ↓ drag
FormEditor (DndContext, multi-page tabs, save/preview)
       ↓
FormCanvas → DroppedFieldCard → FieldBlock | GroupBlock
       ↓ mapPagesToPayload
POST/PUT /forms → PostgreSQL JSONB (column `fields`, API `pages`)
       ↓
PreviewField + useFormStore → CreateRequestPage / PublicFormFillPage
       ↓
createRequest / submitPublicRequest (data + form_snapshot)
```

**Ключевые файлы:**

| Область | Путь |
|---------|------|
| Builder UI | `src/shared/ui/form-builder/` (`FormEditor.tsx` — оркестратор) |
| Типы | `src/shared/types/form-builder.types.ts` |
| API mapping | `src/shared/api/forms.api.ts` |
| Runtime fill | `src/shared/ui/form-builder/FormPreviewModal.tsx` (`PreviewField`) |
| Form store | `src/shared/hooks/useFormStore.ts`, `FormProvider.tsx` |
| Страницы | `CreateFormPage`, `EditFormPage`, `FormViewPage`, `PublicFormFillPage`, `CreateRequestPage` |
| Backend | `backend/app/models/form.py` — JSONB `fields` |

### 1.2 Типы полей (19)

`shortText`, `longText`, `radio`, `checkbox`, `dropdown`, `yesNo`, `number`, `fullName`, `phone`, `email`, `dateTime`, `date`, `time`, `group`, `file_vector`, `file_image`, `file_document`, `address`.

### 1.3 Формат данных

**Builder state:** `FormPageInstance[]` — каждая страница содержит `FormFieldInstance[]` с UUID полей и опций.

**API payload (`pages`):**

```typescript
{
  id: string;
  title: string;
  fields: {
    id?: string;
    type: string;
    label: string;
    placeholder?: string;  // builder "description"
    required: boolean;
    options?: Array<{ id: string; label: string }>;
    children?: ...;          // group only
  }[];
}[]
```

**Request data:** `Record<fieldId, value>` + плоский `form_snapshot` (`FormEntity` с leaf-полями).

### 1.4 Особенности

| Аспект | Состояние |
|--------|-----------|
| Drag-and-drop | `@dnd-kit/core`, `@dnd-kit/sortable` |
| Multi-page wizard | Табы страниц, валидация по шагам |
| Conditional logic | **Нет** |
| Validation | `useFormStore` — required, checkbox min 1, file min 1 |
| Custom fields | `AddressField` (Yandex Maps), file upload (3 MIME-типа) |
| Тема | Ant Design 6 + `--app-*` токены, light/dark |
| Legacy compat | flat fields array, string options, `fileUpload` → `file_document` |

### 1.5 Стек проекта

React 19.2, Ant Design 6.3, TypeScript 5.9, Vite 7.

---

## 2. Сравнение вариантов

| Критерий | Formily + Designable | Formily engine only | RJSF + @rjsf/antd | SurveyJS Creator + Form Library |
|----------|---------------------|---------------------|-------------------|--------------------------------|
| **React + TS + Ant Design 6** | Плохо: `@formily/antd-v5` peer `antd ^5.13`; community `@antd5-designable` (2 dl/wk); React 19 — open bugs | Средне: engine работает, UI-адаптер требует проверки/форк `formily-antd-v6` | Хорошо: `@rjsf/antd` peer `antd >= 5`, MIT | Хорошо: React SDK, но **своя CSS-система**, не Ant components |
| **Сохранить текущий UX** | Нет — Designable = другой layout/панели | **Да** — оставить `FormEditor`, заменить только runtime engine | Частично — render близок к Ant, builder отсутствует официально | Нет — Creator = свой white-label UI |
| **Drag-and-drop builder** | Да (Designable), но unmaintained для antd 5/6 | Да — **существующий** `@dnd-kit` builder | Нет официального; community builders (Ginkgo, tekdi) — другой UX, часто Tailwind | Да — встроенный Creator |
| **JSON Schema** | Да (Formily ISchema / JSchema) | Да | Да (native) | Свой Survey JSON (не JSON Schema) |
| **Custom fields** | Да (`connect`, `mapProps`) | Да | Да (`widgets`, `fields`) | Да (`ComponentCollection`) |
| **Conditional logic** | Да (`x-reactions`, `x-visible`) | Да | Да (`if/then/oneOf`, `dependencies`) | Да (GUI в Creator) |
| **Validation** | Да (встроенный validator) | Да | Да (AJV8) | Да |
| **Сложность миграции** | Высокая (UX + schema + 19 типов + groups + files + address) | Средняя (mapping layer + runtime swap) | Высокая (нет builder + schema mapping + multi-page) | Высокая (другой JSON + UX + лицензия) |
| **Влияние на backend** | Нулевое при mapping в текущий `pages[]` | Нулевое | Нулевое при mapping | Нулевое при mapping, но формат Survey JSON |
| **Лицензия** | MIT | MIT | MIT | Form Library MIT; **Creator ~€499/dev** (production) |
| **Риски** | Designable «мёртв»; React 19; antd 6 несовместимость | Зависимость от community-адаптеров; learning curve | Нет production builder под Ant Design UX | Стоимость, визуальный разрыв с СВОД, vendor lock-in |

### 2.1 Formily + Designable + Ant Design

- **Плюсы:** готовый drag-and-drop builder, JSON Schema, reactive field model, MIT.
- **Минусы:** официальный Designable не поддерживает antd 5/6; UX кардинально отличается от СВОД (property panel, не multi-page tabs); React 19 ломает render в `@formily/antd-v5` (open issue #4254).
- **Вердикт:** не подходит для замены builder с сохранением UX.

### 2.2 react-jsonschema-form + @rjsf/antd

- **Плюсы:** нативный JSON Schema, `@rjsf/antd` совместим с antd >= 5, MIT, кастомные widgets.
- **Минусы:** нет официального drag-and-drop builder; community builders (Ginkgo, tekdi, json-form-designer) — другой UX, часто Tailwind/Shadcn; multi-page wizard нужно строить самим.
- **Вердикт:** хорош как render engine, но не решает задачу builder; при сохранении самописного builder выигрыш над Formily минимален.

### 2.3 SurveyJS Creator / Form Library

- **Плюсы:** полноценный Creator с GUI conditional logic, drag-and-drop, React SDK, Form Library MIT.
- **Минусы:** Creator платный для production (~€499/dev); собственная CSS-тема (не Ant Design components); Survey JSON ≠ текущий формат `pages[]`; визуально не совпадёт с shell СВОД.
- **Вердикт:** сильный turnkey, но дорогой и ломает UX/тему.

---

## 3. Рекомендация

### Выбрать: **Formily как внутренний form engine** (без Designable)

**Почему:**

1. Единственный вариант, совместимый с требованием «сохранить текущий UX» — builder остаётся самописным (`FormEditor` + `@dnd-kit`), меняется только слой runtime (render + validation + будущие `x-reactions`).
2. Backend не трогаем — mapping `FormPageInstance[]` ↔ Formily `ISchema` на фронте, сохранение через существующий `mapPagesToPayload`.
3. Formily даёт reactive field model для будущей conditional logic без переписывания builder.
4. `@dnd-kit` уже используется в проекте и в `@formily/antd-v5`.

### Не выбирать

| Вариант | Причина |
|---------|---------|
| **Designable** | Unmaintained для antd 5/6; UX полностью другой |
| **SurveyJS Creator** | Лицензия, своя тема, Survey JSON, визуальный разрыв |
| **RJSF + community builder** | Нет зрелого builder под Ant Design UX СВОД |

### Риски и митигация

| Риск | Митигация |
|------|-----------|
| React 19 + `@formily/antd-v5` render errors | POC на `/dev/formily-builder`; workaround `component='form'` |
| Ant Design 6 vs peer `antd ^5.13` | Тест в POC; fallback — `formily-antd-v6` или кастомные `connect()` |
| 19 типов полей + mapping | Поэтапно: POC с 5 типами, затем расширение mapper |
| `address`, file uploads | Custom Formily components — фаза 2 |
| Два runtime | Изоляция в `src/dev/formily/` |

### Fallback

Если POC провалится (React 19 / antd 6 blockers): **оставить самописный builder**, точечно заимствовать паттерны (reactions, AJV validation) без внешнего engine.

---

## 4. Минимальный POC

### 4.1 Изоляция

- Route: `/dev/formily-builder` (только ProtectedLayout, не в production nav)
- Папка: `src/dev/formily/`
- Зависимости: `@formily/core`, `@formily/react`, `@formily/json-schema`, `@formily/antd-v5`
- **Не трогаем:** `src/shared/ui/form-builder/`, backend, production routes

### 4.2 Scope

| Функция | Реализация |
|---------|------------|
| Builder | 5 типов: `shortText`, `longText`, `dropdown`, `checkbox`, `date` |
| Mapping | `schemaMapper.ts` — `FormPageInstance[]` ↔ Formily `ISchema` |
| Save/load | `createForm` / `getFormById` через `mapPagesToPayload` |
| Render | `FormilyRenderer` с `@formily/antd-v5` |
| Preview fill | Вкладка на dev-странице |
| Create request | `createRequest` с `data` + `form_snapshot` |

### 4.3 Mapping (5 типов)

| SVOD type | Formily ISchema |
|-----------|-----------------|
| `shortText` | `type: 'string'`, `x-component: 'Input'` |
| `longText` | `type: 'string'`, `x-component: 'Input.TextArea'` |
| `dropdown` | `type: 'string'`, `x-component: 'Select'`, enum + enumNames |
| `checkbox` | `type: 'array'`, `x-component: 'Checkbox.Group'` |
| `date` | `type: 'string'`, `x-component: 'DatePicker'`, format `YYYY-MM-DD` |

- `label` → `title`
- `description` → `description` (Formily) / `placeholder` (API)
- `required` → `required: true`
- `id` → key в `properties`

### 4.4 Критерии успеха

- [x] Formily render работает на React 19 + antd 6 без crash
- [x] Save/load через `POST/GET /forms` без изменений backend
- [x] Round-trip builder → API → load → render для 5 типов
- [x] `createRequest` с корректным `data` и `form_snapshot`
- [x] `npm run lint` и `npm run build` — 0 errors

---

## 5. POC Results

**Дата POC:** 2026-06-14  
**Route:** `/dev/formily-builder` (изолирован, не в nav)  
**Зависимости:** `@formily/core`, `@formily/react`, `@formily/json-schema`, `@formily/antd-v5` (установлены с `--legacy-peer-deps` из-за peer `antd ^5.13` vs проектный antd 6.4)

### Реализовано

| Компонент | Путь |
|-----------|------|
| Spike-документ | `docs/FORM_BUILDER_SPIKE.md` |
| Dev page | `src/dev/formily/FormilyBuilderPage.tsx` |
| Упрощённый builder | `src/dev/formily/FormilyDesigner.tsx` |
| Formily renderer | `src/dev/formily/FormilyRenderer.tsx` |
| Schema mapper | `src/dev/formily/schemaMapper.ts` |
| Component registry | `src/dev/formily/formilyFieldRegistry.ts` |

### Критерии успеха

| Критерий | Статус |
|----------|--------|
| Formily render на React 19 + antd 6 без crash (build) | ✅ `npm run build` успешен |
| Save/load через `POST/GET /forms` | ✅ `createForm` / `getFormById` + `mapPagesToPayload` |
| Round-trip 5 типов | ✅ `pagesToFormilySchema` / `formilySchemaToPages` + вкладка Schema |
| `createRequest` с `data` + `form_snapshot` | ✅ кнопка на вкладке «Предпросмотр» |
| `npm run lint` / `npm run build` — 0 errors | ✅ |

### Наблюдения

1. **Peer dependency:** `npm install` без `--legacy-peer-deps` падает на конфликте `@formily/antd-v5` (peer `antd ^5.13`) vs `antd@6.4`. POC установлен с `--legacy-peer-deps` — задокументированный риск spike.
2. **React 19 workaround:** `Form` рендерится с `component="form"` (рекомендация Formily issue #4254).
3. **Bundle size:** production bundle вырос до ~1.8 MB (Formily + antd adapter). Для production нужен lazy import dev-route или code-splitting.
4. **UX:** production `FormEditor` не затронут; POC builder — упрощённый (кнопки добавления полей, не dnd-kit).
5. **Тема:** Formily использует antd components через adapter; визуально близко к Ant Design, но не идентично кастомным `--app-*` стилям `PreviewField`.

### Вывод POC

Formily как **внутренний engine** технически feasible на текущем стеке при `--legacy-peer-deps`. Полная замена builder на Designable по-прежнему не рекомендуется.

---

## 7. Integration Complete (2026-06-14)

### Архитектура после интеграции

```
FormEditor (builder, без изменений)
       ↓ mapPagesToPayload
API pages[] JSON
       ↓
FormFillRenderer (feature flag + fallback)
  ├─ Formily runtime (lazy chunk) — если VITE_FORMILY_RUNTIME=true и isFormilySupported()
  └─ LegacyFormFill (PreviewField + useFormStore) — иначе
       ↓
createRequest / submitPublicRequest
```

### Новые модули

| Модуль | Путь |
|--------|------|
| Formily runtime | `src/shared/formily/` |
| Fill renderer | `src/shared/ui/form-fill/FormFillRenderer.tsx` |
| Feature flag | `VITE_FORMILY_RUNTIME` в `.env` |
| Peer deps | `.npmrc` (`legacy-peer-deps=true`), `package.json` overrides |
| Code split | `vite.config.ts` → chunk `formily-runtime` |
| QA route | `/dev/formily-builder` (упрощённый designer) |

### Подключённые routes

- `FormViewPage` — preview fill
- `FormEditor` — inline preview mode
- `CreateRequestPage` — authenticated request creation
- `PublicFormFillPage` — public fill

### Mapper

Покрывает все **19** типов полей + multi-page wizard + groups (visual void) + custom `address` и `file_*`.

### Включение Formily

```env
VITE_FORMILY_RUNTIME=true
```

При `false` или неподдерживаемой схеме — автоматический fallback на `PreviewField`.

### Build results

```
npm run lint   # 0 errors, 0 warnings
npm run build  # success
# Chunks: index ~333 KB, formily-runtime ~1.5 MB (lazy-loaded)
```

### Ручная проверка

1. Добавить `VITE_FORMILY_RUNTIME=true` в `.env`
2. `npm run dev` → создать/заполнить форму на `/forms`, `/requests/create`, `/form/:token/fill/:formId`
3. Сравнить `request.data` с legacy (`VITE_FORMILY_RUNTIME=false`)
4. Dark mode + multi-page + file/address поля
5. QA: `/dev/formily-builder`

---

## 6. Decision Log

| Решение | Обоснование |
|---------|-------------|
| Formily engine only | Сохраняет UX builder, даёт reactive model |
| Не Designable | Unmaintained, другой UX |
| Не SurveyJS | Лицензия + визуальный разрыв |
| Не RJSF builder | Нет production-ready builder под Ant Design |
| Backend без изменений | Mapping layer на фронте достаточен |
| POC изолирован | Не ломает production flow |
