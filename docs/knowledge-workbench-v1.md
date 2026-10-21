# Карта и разбор v1

В существующем Obsidian ItemView появился маршрут: область → кандидаты → пара → сравнение содержания → согласие на анализ → проверенный ответ → ручной выбор действия → точный review → отдельный Apply → история → отдельный Undo. Stage 1.1, круглая главная и её навигация сохранены. Новый HTML-прототип, индекс или исполнитель записи не создавались.

## База и границы

Перед работой и перед фиксацией повторно проверены GitHub и рабочие деревья. #106 остаётся OPEN на `282d6fef73a490aaab4e7bcd7cf56c4c9a795636`, ветка `feat/ux-reboot-native-home-v1`; Stage 1.1 `87e734464ca7648c8f2a81968806a857bf07a7e2` входит в историю. Main — `58456e09b735c37472cf194c2086f7f01f260ff3`. Новая ветка `feat/knowledge-workbench-v1` создана от актуального HEAD #106; base нового PR — **`feat/ux-reboot-native-home-v1`**, отдельный diff.

Исходный checkout оставлен на `08387a95ca238da10c4e2b50e611831af00de8fc`, прежнее дерево Stage 1 — на `eaa3b3d340e961107667f69f50a3699f855e3243`. Пользовательские файлы и старые worktree-записи не удалялись. Работа выполнена в `/tmp/veynrel-knowledge-workbench`.

Production source/HEAD native-приёмки: **`dd683ee2c5a9a5b1a71a392c7a5f9812d955ecf6`**. Следующий коммит содержит только этот отчёт и синтетические доказательства. Точный итоговый HEAD записан в описании PR, его CI и локальном `REVIEW_HEAD` рядом со сборкой; он не подменяет `SOURCE_COMMIT` сборки.

Не изменены версии/зависимости, command IDs, plugin ID, FSRS, provider settings, форматы индекса, journals/receipts/recovery и Apply/Undo executors. Оригинальные личные vault и TEST не использованы для автоматических прогонов. Приватные reference-скриншоты просмотрены только локально и не включены в этот PR.

## Наблюдение → исправление

| Наблюдение | Установленная причина / изменение | Доказательство |
| --- | --- | --- |
| Полоса снизу короткой «Обработки» | На Stage 1.1 оболочка 835 px при ItemView 1001 px: процентный min-height не получал определённой высоты от родителя. Workspace получает высоту ItemView; sidebar ограничен размером своего контейнера | Полные `before-process.png` / `process.png`, baseline DOM metrics и новые измерения |
| Пустоты каталога между неравными группами | Независимые группы находились в общих grid rows. Теперь последовательный компактный каталог; длина соседней группы не задаёт высоту строки | `before-tools.png`, `tools.png`, `tools-bottom.png` |
| Задача проверки далеко под статистикой | Knowledge check перенесён перед блоком измерений, развёрнутая сводка данных помещена в отдельное раскрытие. Значения не удалены и не выдуманы | `health.png`; существующие Health/Deep тесты |
| «Обработка» не ведёт к рабочему результату | Прямой вход в разбор; прежний batch открывает реальный выбор/preview. Audit и MOC сохраняют свои владельцы и подтверждение фактического охвата | Process entry, регрессии tools/scope/launchers |
| Поиск пересечений скрыт | Повторы и пересечения — первый открытый сценарий. История видна отдельно; список никогда не зависит от наличия линии top-K | Проекция duplicate outside top-K; native кандидат |
| Два несвязанных графа | Один набор точных путей, выбранная пара, карта с двумя слоями и синхронизированный список | `workbench-final-both-layers.png`; native слой/zoom/координаты/canvas selection |
| Старые back-подписи | Карты возвращаются к «Карте и разбору», setup — к настройкам; название вкладки — Veynrel. Переключение языка обновляет также sidebar | RU/EN matrix и прежние navigation tests |

Основной scroll owner — ItemView. Встроенный разбор больше не создаёт второй вертикальный scroller для ответа модели; списки и длинные literal previews ограничены отдельно. На 390 px порядок — список, выбранная пара/действие, карта. Карта отключается кнопкой «Только список» без потери выбора. Sidebar доступен через menu по ширине конкретного pane, включая настоящий split/popout. Нет абсолютного полноэкранного overlay.

## Данные и владельцы

| Источник | Новое представление | Сохраняемая граница |
| --- | --- | --- |
| VaultScopeIndex | Вся область / настоящая папка с потомками, All notes, точные пути | Только метаданные; отсутствующая папка не превращается во всё хранилище |
| VaultTopologyPort | Сплошные направленные связи, полнота метаданных, внешние зависимости | MetadataCache; неизвестная ссылка не превращается в отсутствующую |
| SemanticGlobalMapPort → прежний SemanticDiscoveryService | Пунктирные соседи в выбранной области | Прежние eligibility/centroids/cosine/top-K; cap проверяется до pairwise |
| ConnectionComparisonPort | Возможные связи и их основание | Сопоставление только актуальных semantic + topology revisions |
| SemanticHealthAnalysisPort и релевантные findings | Повторы и пересечения | Отдельное множество; глобальные кандидаты явно подписаны, оба конца входят в область |
| PairReviewPort → ObsidianSemanticController | Встроенный разбор двух выбранных путей | Только mount/dispose; контекст не содержит write authority |
| RelationshipSession → ChangePlannerSession | Согласие, фактические claims/quotes, ручное действие | Настоящий validator и eligibility; модель не выбирает источник/диапазон за пользователя |
| Safe/Multi/Merge/Group/Bundle/EmptyAtom review + существующая история | Отдельный точный diff, Apply, результат, Undo-review | Исходные одноразовые tickets, exact rereads, writers, journals и recovery |

`PairReview` выделен из прежнего PairInspectorModal. Старый modal делегирует тому же компоненту, а новый ItemView монтирует его внутри своего маршрута. У модели отдельно показаны общее и различия из реальных claims; цитаты/полный payload доступны в деталях, ограничения ответа сохранены. Ответ отображается текстовыми узлами: без HTML, embeds и внешних изображений.

Возврат сохраняет query, список, scroll, выбранные пути и viewport; согласие на модель/запись не переиспользуется. На смене области, языка, уходе со страницы и закрытии mounted session уничтожается. Старые callbacks и поздний completion не открывают planner. После dispatch фактический результат принадлежит прежнему исполнителю и журналу, а не флагу видимости UI. Архивирование остаётся отдельным действием после подходящего родителя; активный Archive блокирует Parent Undo до Archive Undo.

## Слои, область, ранжирование и актуальность

- Node ID — полный путь. Pair ID — JSON отсортированных путей; направление Markdown-ссылки хранится отдельно. Одинаковые basename не сливаются.
- Сплошная стрелка — наблюдаемая реальная ссылка; пунктир — семантическое соседство. Выделение двух объектов не создаёт вычисленного ребра. Отсутствие top-K edge ничего не доказывает об отсутствии смысловой связи.
- Нет embeddings — семантические данные неизвестны. «Нет Markdown-ссылки» допустимо только при актуальной topology и доступных метаданных обоих концов. При неполноте показывается неизвестность.
- В представлении удерживаются обе source revisions, scope ID/revision и состояние полноты. Устаревший слой подписан; старое comparison не выдаётся за актуальное. После обновления выбранные пути сохраняются, но основание исчезнувшего кандидата сбрасывается.
- Возможные связи сохраняют порядок действующего comparison: mutual top-3 → mutual top-5 → one-sided top-5; затем число общих соседей, score и путь. Дополнительной сортировки или нового ранжирования нет.
- Повторы — фильтр готового глобального duplicate результата (до 100 пар по прежним правилам) плюс релевантные findings. Это **не полный пересчёт duplicate поиска внутри папки**; подпись видна под списком. Совпадение с top-K не требуется.
- Scope для смысловой карты — действительный набор путей папки с потомками. `GlobalSemanticOptions.paths` фильтрует документы до eligibility/cap/pairwise. Старый вызов без `paths` сохраняет результат. `createScoped()` создаёт отдельный immutable scope/controller; `prepareExisting()` по явному Refresh использует существующий inspect-путь загрузки сохранённого индекса. Пассивный render ничего не инициализирует.
- Cap остаётся **500 eligible documents**, без первых-500 под видом всего vault. При 501 доступен список и topology, показан предел и выбор меньшей папки. Никакого ANN или фонового embedding-процесса не добавлено.
- Граф использует фиксированные 32 прохода раскладки до 1000 узлов, затем детерминированную сетку; бесконечного simulation loop нет. Геометрия зависит от данных/области, а не включённого слоя. Камера показывает выбранное окружение; до 80 видимых узлов, полный список доступен отдельно. Расстояния не являются шкалой cosine. Zoom/pan/fit работают также кнопками; существенный выбор доступен без попадания в SVG-точку.
- Область UI не сужает входящие зависимости, проверки editor/popout, журналов или конкуренции у исполнителя. Внешние ссылки показаны отдельно; они не расширяют область скрыто.

Сохранены advanced topology, semantic global/focus, neighborhood, similar notes, search, coverage и comparison. Старые command IDs ведут к совместимым расширенным экранам. История различает безопасные consolidation Undo и batch backups. Вызов глобального search из папки требует видимого подтверждения реального охвата.

## Проверки

`npm test`: **4507 PASS / 164 файла**. `npm run typecheck`: оба TypeScript проекта PASS. `npm run lint` включает typecheck/build: PASS, только прежний разрешённый `api.ts:414` fetch advisory. Production build и `git diff --check`: PASS. `npm run audit:proposals`: **5/5 мутаций убиты**, восстановленные проверки прошли. В sandbox audit дважды получил пустой дочерний stdout и отказался считать это PASS; неизменённый audit повторён вне sandbox и прошёл. Контракт проверки не ослаблялся.

Покрыты exact paths/одноимённые заметки, направления/unknown, stale каждого источника, 0/1/150/500/501 и реальный scoped subset, old unscoped compatibility, A→B→A и поздняя публикация, независимость владельцев, duplicate outside top-K, сохранение ranking и обновление provenance. Прежний Pair Inspector integration выполняет настоящий planner и проверяет невозможность запуска detached prepare после close; тестовый DOM дополнен стандартным `contains`, прежние утверждения не удалены.

Скрипт установщика отдельно проверен на синтетических файлах: точная установка и внешняя резервная копия трёх файлов, сохранность settings/index/journal, отказ на оригинальный vault, подменённую сборку и symlink-цель. Повторный focused review не обнаружил блокирующих замечаний; его вывод не заменяет native acceptance.

### Native evidence

Все кадры — полные окна настоящего Linux Obsidian на новых изолированных копиях Lab. В каждом vault ровно 1000 Markdown: 998 синтетических Lab-заметок и две явно синтетические заметки с одинаковым basename. Источник Lab проверен хешами до/после и не менялся. Начальный manifest записан до открытия; после каждого полного Undo сравниваются все 1000 файлов. Для искусственного PASS прямое восстановление файлов не используется.

Transport `RelationshipSession.deps.complete` заменён локальным фиксированным ответом. **Настоящие** MetadataCache, evidence validator, planner, final-review, writer и journal выполняются в плагине. Native completion не является тестом качества живой модели. Синтетический индекс содержит 150 локально созданных векторов; отдельный запуск содержит 501, третий — отсутствующий индекс. Это не embedding-индексация и не оценка качества поиска по 1000 заметкам.

Итого **62 native assertions: 45 + 10 + 7**, все PASS. Точные assertion counts и artifact hashes: [ready](knowledge-workbench-v1-evidence/ready-report.json), [cap](knowledge-workbench-v1-evidence/cap-report.json), [absent](knowledge-workbench-v1-evidence/absent-report.json). Основной сценарий включает:

1. Partial overlap → отдельное согласие → accepted response → настоящий add_link plan → exact review → Apply → History → Undo → byte equality.
2. Неверная exact quote → validator error, planner отсутствует, записи нет. Back отзывает consent; detached callbacks и completion после смены scope не оживляют его.
3. Выбор canvas/list одной пары, оба слоя и направления, неизменные координаты/zoom при переключении, отдельное неизвестное состояние при пропущенных метаданных, invalidation при смене index epoch.
4. 501 eligible → честный cap → реальная папка из двух eligible → scoped ready; список 1000 заметок остаётся доступен. Отсутствующий индекс — unavailable/setup, а не «ноль кандидатов».
5. Merge → отдельный Archive review → Archive Undo → Parent Undo. Неполное preservation accounting блокирует Archive; активный Archive блокирует Parent Undo. После цепочки все 1000 хешей совпадают.
6. RU/EN × light/dark × 1650/1440/390 px, настоящий узкий split/popout, клавиатурный выбор, 200% native zoom, reduced motion, rename/delete и disposal. Shell/контент используют один язык; горизонтального переполнения pane нет.

Полные [Process](knowledge-workbench-v1-evidence/process.png), [Tools](knowledge-workbench-v1-evidence/tools.png), [Tools bottom](knowledge-workbench-v1-evidence/tools-bottom.png), [Check](knowledge-workbench-v1-evidence/health.png), [общая карта](knowledge-workbench-v1-evidence/workbench-final-both-layers.png), [ответ](knowledge-workbench-v1-evidence/pair-accepted-response.png), [точный review](knowledge-workbench-v1-evidence/exact-review.png), [результат](knowledge-workbench-v1-evidence/apply-result.png), [Undo review](knowledge-workbench-v1-evidence/undo-review.png). [Запись 10,8 с: candidate → review → Apply/Undo → возврат](knowledge-workbench-v1-evidence/candidate-review-return.mp4) получена native screencast без дорисовки кадров. Клики рабочего маршрута проходят через CDP Input; скрытые вызовы executors вместо UI не используются. Host API нужен только для изолированной фикстуры, fault injection, создания split/popout и наблюдений.

Папки полных локальных прогонов: `/tmp/veynrel-workbench-final-ready`, `/tmp/veynrel-workbench-final-cap`, `/tmp/veynrel-workbench-final-absent`; там находятся before/after manifests, журналы в копиях vault и диагностические snapshots. Публичные файлы содержат только синтетические данные. Начальное воспроизведение Stage 1.1: `/tmp/veynrel-stage1-map-baseline`.

Воспроизведение после `npm ci` / build: `node scripts/knowledge-workbench-native.mjs /tmp/veynrel-workbench-NEW ready150 /absolute/frozen-build` (отдельные новые пути для `cap501` и `absent`). Скрипт требует локальный Lab 1000, Electron 43/Obsidian, свободный CDP 9392 и ffmpeg; не устанавливает зависимости/модели и отказывается повторно использовать существующую директорию.

## Зафиксированная сборка и установка

Каталог: **`/tmp/veynrel-knowledge-workbench-frozen-dd683ee`**. `SOURCE_COMMIT` — `dd683ee2c5a9a5b1a71a392c7a5f9812d955ecf6`; финальные native-прогоны используют именно эти три файла.

| Файл | SHA-256 |
| --- | --- |
| main.js | `5794f05eb5bc11c35aeacf33f62187e89d0a92c388d4acba23167cba872e0c2e` |
| manifest.json | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |
| styles.css | `bc5dec00da1ab6d6b08917555501c191e576fdc1ac21c85a8c87a2170059ffe6` |

Локальный `install-to-test.sh` содержит указанный владельцем путь TEST. Закрыть этот vault в Obsidian и выполнить **файл через bash**:

```bash
bash /tmp/veynrel-knowledge-workbench-frozen-dd683ee/install-to-test.sh
```

Он вызывает общий [установщик](../scripts/install-knowledge-workbench.sh), проверяет абсолютную цель, типы файлов, plugin ID и три SHA-256; копирует прежние три файла вне vault в `${XDG_STATE_HOME:-$HOME/.local/state}/veynrel-workbench-install/backup.*`, устанавливает три артефакта и проверяет результат. `data.json`, semantic-index и operation journals не удаляет и не заменяет. Sudo не нужен. Установка в TEST **не запускалась**. После запуска владельцем открыть TEST, включить/перезагрузить Veynrel, перейти в «Карта и разбор» и явно загрузить данные.

## Ограничения и следующий этап

Нет live semantic-quality evaluation, платной модели или полной семантической индексации Lab 1000. Нет проверки физического мобильного устройства, речи screen reader или сторонних тем. На больших областях граф ограничен представлением окружения; cap 500 относится к смысловому расчёту, а не числу Markdown в списке. Неподдерживаемые структуры по-прежнему получают отказ от прежнего planner.

Automation подтверждает доступность и безопасность маршрута; понятность для нового человека и визуальное одобрение остаются ручной UX-приёмкой владельца. Thematic Recall, полный batch UX и новое обнаружение пробелов в знаниях отложены. PR остаётся OPEN, auto-merge OFF; merge/tag/release не выполнялись.
