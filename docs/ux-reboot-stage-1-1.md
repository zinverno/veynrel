# Stage 1.1 — native visual and navigation polish

Продолжение принятого Stage 1 после ручной проверки пользователя. Боковая навигация, ядро с реальными папками и панель выбранной области сохранены. Реализация работает в Obsidian; автономного HTML-макета нет.

## База и сохранение существующей работы

- PR [#104](https://github.com/zinverno/veynrel/pull/104) уже слит. Его source commit `59e57842d8772b5804f7421428e9af5e53b31fa6` входит в историю Stage 1; merge commit — `2386b4dcff63fe93a0a61c216acf458d23e49704`. Тайм-ауты, диагностика и модельные контракты не изменены.
- PR [#106](https://github.com/zinverno/veynrel/pull/106) был OPEN на `eaa3b3d340e961107667f69f50a3699f855e3243`, auto-merge выключен. Продолжена та же ветка `feat/ux-reboot-native-home-v1` непосредственно от этого commit.
- Наблюдавшийся `origin/main`: `58456e09b735c37472cf194c2086f7f01f260ff3` (включает синтетический Lab из #105). Merge-base ветки с ним: `59e57842d8772b5804f7421428e9af5e53b31fa6`. Merge/rebase не выполнялись.
- Основной checkout `/home/zinvernix/projects/obsidian_ai_hub/plagin_CLAUD` остался на `08387a95ca238da10c4e2b50e611831af00de8fc`, ветка `feat/consolidation-unified-ux-v1`; пользовательские untracked-файлы сохранены. Worktree `/home/zinvernix/projects/veynrel-ux-stage-1` остался чистым на `eaa3b3d…`. Устаревшие worktree-записи не удалялись.
- Работа и сборка выполнены в отдельном clone `/tmp/veynrel-stage-1-1`. Проверенный commit реализации: **`87e734464ca7648c8f2a81968806a857bf07a7e2`**. Последующий commit добавляет только этот отчёт и доказательства, без изменения трёх файлов сборки.

## Замечание → исправление → доказательство

| Замечание пользователя | Изменение | Проверка |
| --- | --- | --- |
| Прямоугольная кнопка перекрывает непонятную паутину | Круглая кнопка 156 × 156; SVG-сетка и орбиты удалены. Клик/Enter выбирает всё хранилище | Native клавиатура, неизменные границы кнопки и подписей в семи замерах; снимки главной |
| Анимация незаметна | Отдельный CSS-ореол: opacity 0.28–0.8, scale 0.96–1.08, период 4.5 s. Подписи и hit target неподвижны | [Native MP4, 7 s](ux-reboot-stage-1-1-evidence/core-native.mp4); временные замеры в lab-report |
| Обзор занят вложенными путями дневника | До шести реальных папок верхнего уровня; выбранная вложенная/иная папка занимает доступное место. Picker сохраняет все реальные папки | Регрессия с 300 вложенными путями; native Lab и small, пустые/одноимённые/Unicode-папки, счётчики потомков |
| Области выглядят как тяжёлые панели | Капсулы с иконкой, коротким именем, родительским путём и счётчиком; полный путь в title/доступном имени. Выбор отмечен галочкой, рамкой и aria-pressed | Сравнение папки, narrow 390 px, long-name fixture, unit assertions |
| Рабочий экран заканчивается служебной сводкой | Источник установлен: прежний Health рендерил topology preview, профиль, semantic/deep panels. Профиль и настройки индекса/моделей перенесены в «Настройки»; на «Проверке» компактная задача «Проверка знаний» | Native отсутствие старых панелей на рабочем экране, наличие прежних настроек; снимки низа «Проверки» |
| Каталог — длинные абзацы | Четыре группы задач, лёгкие строки с иконкой, результатом и одним входом. Последствия видимы сразу, подробности раскрываются. История в каталоге представлена один раз | Native закрытые/открытые details, audit selector, batch preview, journal modal; регрессии launchers и редакторского контекста |
| Карты вытеснены длинным списком заметок | Четыре входа перед списком: поиск по смыслу, реальные связи, смысловая карта, сравнение связей. Остальные действия Discover сохранены в раскрытии | Native topology entry + явная локальная загрузка; unit ready/disabled/scope/stale-action cases; сравнимые кадры |
| Неясен фактический охват | Рядом со входом указаны «Весь индекс» / «Всё хранилище · локально». При выбранной папке остаётся явное подтверждение смены охвата | Unit guards для detached callback/смены папки; native zero-work и handoff |

### Что установлено об анимации

В отдельной native-копии исходного `eaa3b3d…` CSS уже проигрывался: opacity менялась от 0.7 до ~1, scale — от 0.98 до 1.025. Переключатель был включён, reduced motion выключен, сцена видима. Тонкая сетка за кнопкой 168 × 63 делала эффект плохо заметным. Это воспроизведение исходной сборки; состояние OS/переключателя в личном vault пользователя не исследовалось.

В новой сборке зафиксированы семь временных замеров: opacity 0.28–0.789, scale 0.96–1.077, неизменные координаты всех кнопок и подписей. Видео получено через native Obsidian CDP screencast, 209 исходных кадров с их временными метками; MP4 H.264 1484 × 1080, 175 кадров, 7.0 s. Кадры не дорисованы. Переключатель и `prefers-reduced-motion` отключают анимацию. IntersectionObserver останавливает её в скрытом view; `ownerDocument.visibilitychange` обслуживает отдельный popout, обработчики снимаются при закрытии. JS-цикла анимации и новых зависимостей нет.

## Сохранённые входы и владельцы

| Возможность | Вход после изменения | Существующий владелец / последствия |
| --- | --- | --- |
| Поиск, связанные заметки, дубликаты, semantic Health | Карта и поиск, основные входы / раскрытие | Прежний semantic port; состояние готовности, прогресс, ошибки и диагностика отклонённых batch сохранены |
| Реальные ссылки | Карта и поиск → Связи | Прежний VaultTopologyPort; открытие пассивно, загрузка только явно, локальные метаданные |
| Смысловая карта, neighborhood, сравнение связей | Карта и поиск | Прежние map/neighborhood/comparison owners; без изменения алгоритмов |
| Локальные проверки, findings, проверка знаний | Проверка; Все инструменты → Проверить | Прежний Health/Deep controller; consent, цена/передача, отмена и прогресс сохранены |
| Полный / одиночный аудит | Проверка и каталог | `openDeepAudit`, прежний mode selector; открытие не отправляет запрос |
| Массовая обработка | Обработка и каталог | `openBatchProcessing`, прежний выбор/preview/подтверждение; открытие не меняет заметки |
| Вопросы к хранилищу | Каталог → Найти и исследовать | `openAskVault`; модель/возможная оплата указаны |
| Таксономия тегов | Каталог → Организовать | `openTagTaxonomy`; локальный просмотр, модельные рекомендации по прежнему подтверждению |
| MOC, прежний отчёт о хранилище | Каталог → Организовать / Проверить | `generateMocs`, `runLegacyVaultAudit`; кнопка «Создать», запись/модель/оплата видимы |
| История консолидации | История, один вход в каталоге, раскрытие Discover | `openOperationHistory`; доступна и без semantic index/API key; прежний journal owner |
| Повторение и генерация карточек | Повторение, каталог | Прежние Recall и authoring owners. FSRS не изменён; очередь остаётся общей |
| Companion/MCP и предложения | Настройки; каталог → Организовать | Прежний Connect route и approvals |
| Пять редакторских действий | Каталог → Редакторские действия → Как открыть | Прежние команды Simple completion, Smart completion (Vault), Process selection, Generate Dataview, Split note into atomic notes. Явно нужен редактор/фрагмент; скрытый контекст не выбирается |
| Профиль, провайдеры, настройки/операции индекса | Настройки; «Подключения и индекс: действия» | Прежние setup/check/rebuild/disable/diagnostics controls и safety gates |

Command ID и host launchers не изменены. Общий Undo не обещается. Apply/Undo, журналы, recovery, FSRS, контракты и семантические алгоритмы не переписаны. Редизайн самих карт, аудита, batch/reviews и тематическое повторение остаются за границей Stage 1.1.

## Проверки

| Gate | Результат / доказательство |
| --- | --- |
| `npm test -- --maxWorkers=4` | PASS: 4488 tests, 163 files; [лог](ux-reboot-stage-1-1-evidence/tests.log) |
| `npm run typecheck` | PASS; [лог](ux-reboot-stage-1-1-evidence/typecheck.log) |
| `npm run lint` | PASS, 0 errors; 1 существующее предупреждение `api.ts:414` о fetch; [лог](ux-reboot-stage-1-1-evidence/lint.log) |
| `npm run build` | PASS; [лог](ux-reboot-stage-1-1-evidence/build.log) |
| `npm run audit:proposals` | PASS, 5/5 mutations killed, restored tests passed; [лог](ux-reboot-stage-1-1-evidence/audit.log) |
| `git diff --check` | PASS |
| Native Lab 1000 | PASS, 103 assertions; [aggregate report](ux-reboot-stage-1-1-evidence/lab-report.json) |
| Native small | PASS, 111 assertions, 7 notes / 9 initial folders; [aggregate report](ux-reboot-stage-1-1-evidence/small-report.json) |
| Исходная сборка | BASELINE_CAPTURED; [report](ux-reboot-stage-1-1-evidence/before-report.json) |

Native: Linux, Obsidian 1.13.7, Electron 43.6.0; отдельные профиль и vault. RU/EN × светлая/тёмная темы × широкая панель/390 px; Home, Discover, Tools и Health. Также narrow split в широком окне, popout, Enter/focus, Escape/menu, реальный Electron zoom 200%, длинные имена, отсутствие горизонтального overflow/перекрытия видимых кнопок, lifecycle скрытия/закрытия/повторного открытия. Обход настроек/входов не запускает индекс или анализ.

При открытии, навигации и выборе папки: 0 чтений содержимого, 0 записей, 0 renderer fetch/XHR. Итоговые счётчики отличаются из-за последующих явно инициированных действий: Lab — 10 reads, 0 writes; small — 4 reads, 2 writes (переименование/удаление специально созданной пустой тестовой папки). Счётчики сети — 0 в обоих прогонах. Это инструментирование renderer, не глобальный packet capture. Ключей и настроенных провайдеров нет; платные вызовы и скачивание моделей не выполнялись.

Все 1000/7 Markdown-файлов до и после идентичны. В Lab-прогонах повторно сверены и исходные 1000 Markdown-файлов синтетического Lab. `New Life 2.0` не открывался и не изменялся. Пользовательские настройки/журналы не копировались, не удалялись и не сбрасывались. В репозитории — агрегированные отчёты и отобранные synthetic screenshots; полные path/hash maps и весь набор кадров остаются в `/tmp/veynrel-stage1-polish-final-{lab,small,before}`.

При подготовке harness отдельно устранены ложные failures: сравнение невидимых кнопок за scroll-clip и неполный CDP Enter без virtual key code. Финальные прогоны выполнены заново целиком. Proposal audit сначала не смог запустить дочерний runner в sandbox; неизменённый audit успешно выполнен с разрешённым доступом. Старые failure-артефакты сохранены локально, PASS относится только к финальным отчётам.

## Сравнимые кадры

Одинаковые условия до/после: RU, тёмная тема, окно 1484 × 1080, native crop панели 1440 px, один и тот же Lab 1000, выбранная папка `Дневник/2021`. Для «Проверки» оба снимка показывают конец страницы. Различия длины страницы — результат удаления прежних блоков.

| Экран | До (`eaa3b3d…`) | После (`87e7344…`) |
| --- | --- | --- |
| Главная | [PNG](ux-reboot-stage-1-1-evidence/before-home.png) | [PNG](ux-reboot-stage-1-1-evidence/after-home.png) |
| Выбранная вложенная папка | [PNG](ux-reboot-stage-1-1-evidence/before-folder.png) | [PNG](ux-reboot-stage-1-1-evidence/after-folder.png) |
| Карта и поиск | [PNG](ux-reboot-stage-1-1-evidence/before-map.png) | [PNG](ux-reboot-stage-1-1-evidence/after-map.png) |
| Карта с выбранной папкой | [PNG](ux-reboot-stage-1-1-evidence/before-map-folder.png) | [PNG](ux-reboot-stage-1-1-evidence/after-map-folder.png) |
| Все инструменты | [PNG](ux-reboot-stage-1-1-evidence/before-tools.png) | [PNG](ux-reboot-stage-1-1-evidence/after-tools.png) |
| Проверка: нижняя часть | [PNG](ux-reboot-stage-1-1-evidence/before-check-details.png) | [PNG](ux-reboot-stage-1-1-evidence/after-check-details.png) |

Дополнительно: [EN/light/390 px](ux-reboot-stage-1-1-evidence/home-en-light-434.png), [zoom 200%](ux-reboot-stage-1-1-evidence/home-zoom200.png), [split](ux-reboot-stage-1-1-evidence/home-wide-window-split.png), [popout](ux-reboot-stage-1-1-evidence/home-popout.png), [длинное имя](ux-reboot-stage-1-1-evidence/home-long-folder-390.png), [reduced motion](ux-reboot-stage-1-1-evidence/home-reduced-motion.png). PNG reduced motion иллюстрирует статичное оформление; отключение движения подтверждают временные assertions, не этот PNG. Все опубликованные снимки и два кадра видео визуально просмотрены: [manifest](ux-reboot-stage-1-1-evidence/visual-review.json). [SHA-256 evidence](ux-reboot-stage-1-1-evidence/SHA256SUMS).

## Готовая сборка и безопасное обновление

Фиксированная сборка source commit `87e734464ca7648c8f2a81968806a857bf07a7e2` находится вне временного checkout:

```text
/home/zinvernix/projects/veynrel-stage1-artifacts/87e734464ca7648c8f2a81968806a857bf07a7e2/main.js
/home/zinvernix/projects/veynrel-stage1-artifacts/87e734464ca7648c8f2a81968806a857bf07a7e2/manifest.json
/home/zinvernix/projects/veynrel-stage1-artifacts/87e734464ca7648c8f2a81968806a857bf07a7e2/styles.css
```

| Файл | SHA-256 |
| --- | --- |
| main.js | `e90fb8ac98eec714933c7d81511e99305ad52b9ecc3814e0379d825fddaff2ff` |
| manifest.json | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |
| styles.css | `b7010ba767956709493b173fa5e280e422a42c0f558811d74b59a89cf4e9231e` |

В каталоге также лежат `SOURCE_COMMIT` и `SHA256SUMS`. Эта точная копия установлена в оба финальных native fixture. Версия остаётся 2.1.0, plugin ID — `ai-knowledge-hub`; миграций, новых зависимостей и релиза нет.

Для ручной проверки сначала используйте отдельный тестовый vault. Отключите Veynrel или закройте этот экземпляр Obsidian; сохраните прежние три файла. Замените **только** `main.js`, `manifest.json`, `styles.css` в `<vault>/<configDir>/plugins/ai-knowledge-hub/` (обычно configDir — `.obsidian`), проверьте SHA-256 и включите плагин заново. `data.json`, индекс, журналы, recovery-файлы и содержимое vault сохраняются. В личный vault эта задача сборку не устанавливала.

## Ограничения

NOT RUN: физическое мобильное устройство, screen-reader speech, сторонние темы, live provider/model/index generation и оценка семантического качества. Готовые semantic/map состояния проверены unit fixtures; native прогоны проверяют честное состояние без настроенного индекса и существующую локальную topology. Платные сценарии и реальная запись Apply/Undo/recovery в native повторно не исполнялись; действующие автоматические safety suites и proposal mutation audit прошли. Времена открытия/idle в отчётах диагностические, не benchmark.

PR #106 предназначен для ручного review: оставить OPEN, auto-merge OFF, без merge/tag/release. Итоговый docs/evidence HEAD и ссылки на его CI указываются в описании PR после публикации. Следующий продуктовый этап — Stage 2, тематическое повторение.
