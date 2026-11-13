# Veynrel: advisory vault assistant — frozen scope and PR plan

Status: proposed implementation plan. Product constraints below reflect the current requested direction; dependency order, module boundaries, budgets and engineering choices remain proposals. This is not a shipped-feature list and not an approval to deploy services, merge PRs or publish releases.

Planning date: 2026-11-11. Inspected default-branch reference: `aae049c98794922b33404bc5168191e9972c9863` (contains #136). The latest stable release observed during planning was 2.3.1 at `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`. Recheck both references before implementation. This document does not independently rerun historical tests.

Planning PR verification on 2026-11-13: the actual base is `main` at `becb982f8d789ab53bbec31a83952b818e70d4cd`, which also contains the later Recall reading-mode persistence fix #137. Recall #136 is merged and its merge commit `aae049c98794922b33404bc5168191e9972c9863` is an ancestor of this base. Separately, GitHub still reports stable 2.3.1, whose annotated tag resolves to `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`; that release predates #136 and #137. Presence in main does not mean inclusion in the stable release. These repository/release checks do not revalidate runtime behavior or release assets.

## Product promise

Help a person keep a large Obsidian vault understandable and useful: organize material, inspect questionable content, discover meaningful connections, and return knowledge to active use. The audit is assistance, not an assessment of obedience to a methodology.

## Fixed product constraints

1. Keep Health/Workspace and Studio separate. Simplify both; do not build a combined application shell.
2. A vault without rules, YAML or a tag registry is a supported starting point. Audit it first, infer tentative conventions, and offer a small set of explained rules/tags. Do not require a setup wizard or a registry before value.
3. Organizational recommendations are advisory. Existing user choices take precedence. A nonstandard folder/tag is not a reason to block ordinary work. Security, source freshness, output-shape and spending checks are different and remain enforced by code.
4. Audit recommendations may guide the assistant's own defaults transparently. Proposed, observed and user-confirmed rules remain distinguishable. Generating a profile must not silently rewrite existing notes or promote a model suggestion to user approval.
5. Keep Recall native: study topics, hierarchical per-question tags, compact opt-in vocabulary notes without per-word tags, independent vocabulary direction schedules and no mandatory question-preview workflow. Preserve #136 behavior and progress.
6. Keep one semantic map, with optional explicit-link and tag overlays. Remove the redundant graph screen, not the underlying link evidence. Similarity does not prove duplication; semantic distance does not invalidate a meaningful link.
7. Remove Excalidraw runtime functionality completely. Retain user drawings and legacy data safely; historical documentation may remain clearly labeled. Do not preserve another live diagram UI merely for archival access.
8. Users may edit model instructions. Ship useful defaults; expose actual instructions and overrides without making customization mandatory. Prompt text cannot authorize file writes, arbitrary execution or unlimited spending.
9. Preserve local-first useful operations. The planned cloud demo has no registration/email/manual key setup, supports retained capabilities within a small budget, and does not turn existing local features into paid unlocks. Do not embed a shared provider key.
10. Use native themes, contextual actions and progressive disclosure. Expose coverage and risks without a wall of technical copy or manufactured health scores.
11. Add the requested text portrait within an existing space: landscape word cloud, frequent phrases, separate topic view and contextual candidates for overused expressions. Do not add another top-level workspace.
12. Preserve the current persona experiment's pinned version, scenarios and results. New product versions are evaluated in separately labeled follow-up runs.

## Advisory profile behavior

The product supports two starting points. With an existing method, read the user-selected versioned data block, preserve it, and report uncertainty or incompatibility. Without a method, use explicit local audit observations first; propose a small structure only when justified by real material. A sparse vault may justify no taxonomy yet.

Precedence: explicit user settings and exceptions > confirmed imported profile > clearly labeled observed conventions > model proposals. Missing and malformed registries are not equivalent. An unusable registry disables that enrichment, not unrelated local work, and is never replaced with an empty file. Offer to save a human-readable Markdown rules/registry document; make the final creation an explicit action. Once file-backed rules are enabled, one source owns definitions and caches are derived, not competing dictionaries.

Preserve allowed-but-unused tags, confirmed aliases, deprecated tags, candidates, unknowns and excluded namespaces. Never infer synonym equivalence solely from similar spelling. Keep knowledge tags separate from `flashcards/...` using segment-aware matching. A user may keep a noncanonical tag without receiving the same demand on every audit.

Each recommendation must carry its observed scope, source examples, basis, proposed action, exclusions, revision and limitations. Use a short prioritized set plus access to all observations. Support accept, inspect, leave as is and defer. Suppression is tied to relevant evidence; changed sources may reopen a question, but unrelated scans must not repeatedly nag. A partial scan cannot establish absence or resolution.

## What an audit must help finish

An explicit audit reads the selected scope locally, shows what was examined, and offers the next useful action. Examples: inspect two overlapping notes, repair a broken link, use an existing tag, propose a new category, preserve an intentional exception, or resume a chosen study topic. Reuse existing pair analysis, planners, MOC/atomization and supported writers instead of inventing a second universal transaction system.

No scan automatically deletes, renames or restructures notes. Absence of links, age, rarity or high similarity is not sufficient evidence of worthless material. Store changes only after the corresponding explicit user action; applying one bounded operation does not authorize the rest of the vault. Recall's explicit generate-and-append remains a separate consent pattern with real editor undo rather than mandatory output review.

## Text portrait contract

Word frequency, document frequency and semantic topics answer different questions. Default cloud size can follow total occurrences; expose document-count mode and an exact ranked table. Use a documented monotonic size transform, stable layout for unchanged inputs and keyboard/list alternatives. Clicking a word opens actual occurrences.

Local extraction must define treatment of YAML, URLs, code, templates, prompts, quoted/imported material, translations, vocabulary and generated Flashcards. Do not infer authorship from storage in a personal vault. Morphological normalization is optional and disclosed; retain originals and do not merge different meanings blindly. Common terms or phrases are only candidates for review, not proof of a writing problem. Topic labels derive from declared tags or semantic groups and show their basis.

DataviewJS can prototype a custom view, but production should not require Dataview or execute model-generated JavaScript. Use audited native rendering and cancellable, bounded, incremental calculation. Neither themes nor word frequency justify automatic note edits.

## Sources, saving and learning

Studio saves by intention: an idea, worklog, discussion outcome, original text, source, translation or study material. A profile proposes location and metadata without imposing a method on the whole vault. Plain preservation works without an LLM. A selected transformation preserves uncertainty and separates suggestions from decisions.

Source ingestion stores only actually obtained material. Keep original URL, provenance, capture date, completeness and representation relationships. Original, translation and summary are not independent evidence. Deduplicate cautiously by URL; do not drop content-affecting parameters or anchor meaning. Replace only a selected external-link occurrence after verifying its local target. No blind changes to code, YAML source URLs or quoted originals.

Long translations use a fixed segment ledger, explicit continuation and honest partial states. Multi-file learning material uses collision/link checks and per-file recovery; no vault-wide atomicity or universal undo is implied. Preserve user edits during retry/recovery. Existing images are only included if actually available and authorized; no invented image references or renewed Excalidraw dependency. Reuse Recall for repetition.

## Demo contract

Separate the gateway from the plugin client. An anonymous session is not a verified unique human. Enforce aggregate spending protection even when an installation quota is reset. Use server-held credentials, operation/model allowlists, bounded payloads, concurrency controls, idempotency, conservative reservations and cost reconciliation. Unknown billing must not be silently treated as zero. Default service logs must not retain note bodies.

All retained cloud workflows need a capability matrix and tests. No manual provider setup is required for the trial, but sending user content still requires meaningful disclosure and explicit intent. Preserve a bounded semantic indexing scope across automatic synchronization. No hidden full-vault indexing or model-space switching. Local work and stored results remain available after trial expiry; BYOK/local inference remain options. Amount, expiry, hosting and any production spend require separate owner decisions. This plan does not introduce subscriptions.

## Delivery rules

The units below are logical PR identifiers, not GitHub issue numbers. Implement one bounded unit per PR; split a unit further only when needed to keep review meaningful, preserving requirement mapping. Never implement the entire roadmap in one runtime PR. Audit actual current code before changing it, and preserve existing code/behavior already satisfying the requirement.

Every PR includes tests, user-facing documentation of actual behavior, migration/safety checks where relevant and honest evidence boundaries. Reuse current owners and adapters; do not construct a generic platform in anticipation of unknown features. No personal-vault installation, production deployment, paid requests, publication or merge is implied by this roadmap.

Each PR is checked and reviewed separately. Merging requires a separate decision by the owner; auto-merge stays off. Completing or merging one PR does not authorize the next unit or a public release.

This planning session adds only this document, opens one draft PR with auto-merge off, and stops. After the owner accepts the plan and separately assigns implementation, the first functional session uses the supplied `PR_TASKS/R01.md` contract. If the owner selects a different unit, honor its dependencies. The supplied task contracts remain execution inputs; they are not additional files in this planning PR. Completing one unit never authorizes starting the next.

## Ordered implementation units

| Unit | Deliverable | Dependencies |
|---|---|---|
| R01 | Recall: завершить путь до поставляемого релиза | None |
| R02 | Полностью удалить Excalidraw-функциональность из runtime | None |
| R03 | Упростить Health/Workspace и Studio по отдельности | R02 |
| R04 | Аудит с мягким профилем хранилища и необязательным реестром | R03 |
| R05 | Из результата аудита — к небольшому числу полезных решений | R04 |
| R06 | Одна семантическая карта: семьи заметок и сравнение со связями | R04, R05 |
| R07 | Портрет текстов: облако слов, темы и возможные речевые повторы | R04, R06 |
| R08 | Редактируемые инструкции модели с понятным происхождением | R04 |
| R09 | Сохранить материал по намерению и мягким правилам vault | R04, R05, R08 |
| R10 | Сохранение внешнего источника и выбранная внутренняя ссылка | R09 |
| R11 | Длинные переводы и переработка источников с продолжением | R08, R10 |
| R12 | Учебный материал в vault без обязательного ZIP | R01, R09, R10, R11 |
| R13 | Сервер анонимного демо с контролируемым бюджетом | R04, R08 |
| R14 | Демо в плагине для всех сохраняемых возможностей | R13, R05, R08 |
| R15 | Итоговая приёмка, производительность и понятная поставка | R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14 |

The suggested review order is R01–R15. R08 and the server contract R13 may be prepared independently after their dependencies, but enabling a complete demo requires the retained workflow matrix. Intermediate stable releases should not wait for the last feature. R01 prepares a deliverable from already accepted Recall work; R02–R05 provide the first focused vault-assistant increment. R06–R07 add useful exploration. R08–R12 complete material handling. R13–R14 add sponsored onboarding. R15 is the final integrated check, not the first testing step.

### R01 — Recall: завершить путь до поставляемого релиза

**User outcome:** Уже реализованные учебные темы и словари доступны в проверяемой поставке, а не только в main.

**Scope:** Проверить фактическое состояние #136 и различие main/stable. Воспроизвести только подтверждаемые сообщения личного пилота и лаборатории: понятность вопроса вне исходника, ошибки вставки, диагностика словаря. Не считать неизвестную причину сбоя доказанным багом. Исправить найденные узкие дефекты, сохранить темы, словари, направления, расписания и генерацию без обязательного preview. Подготовить обновление инструкции, версии и release bundle отдельным проверяемым коммитом после стабилизации кода.

**Acceptance:**

- Старая база мигрирует с резервной копией; прогресс переживает перестановку, ретегирование и наблюдаемый перенос.
- В настоящем Obsidian вставка → Undo → обновление очереди → Redo проверена без потери соседних ручных правок.
- Неподдержанный словарь получает объяснение с местом ошибки; готовые пары работают без модели.
- Показаны exact source SHA, hashes и разница с опубликованной сборкой. Свежая установка и обновление проверены на disposable vault.
- Живое качество модели не объявлено проверенным по заглушке; платные вызовы только при отдельном разрешении.

**Excluded:** Нет аудита дублей вопросов, Anki-импорта, нового FSRS, нового дашборда обучения или автоматической публикации релиза.

### R02 — Полностью удалить Excalidraw-функциональность из runtime

**User outcome:** В плагине больше нет генерации схем и её дополнительных экранов/зависимостей.

**Scope:** Удалить входы, capability checks, генератор, адаптер, runtime-зависимости, регистрации и относящиеся к ним настройки. Проверить общие imports, gate операций и обработку ошибок, которые использует Studio. Исторические документы пометить как описание удалённой возможности. Описать миграцию старого состояния.

**Acceptance:**

- После чистого запуска нет Excalidraw-команд, вкладок, запросов, adapters или требований установить плагин.
- Markdown-сценарии Studio, Review, применимые Apply/Undo, community-рецепты и история Markdown не регрессируют.
- Готовые пользовательские .excalidraw.md и старые журналы не удаляются и не перезаписываются.
- Для legacy-данных есть документированное расположение/экспорт; специальный живой экран схем не сохраняется только ради истории.

**Excluded:** Не удалять рисунки пользователя, не заменять Excalidraw другой рисовалкой, не объединять пространства.

### R03 — Упростить Health/Workspace и Studio по отдельности

**User outcome:** Пользователь понимает первый шаг и возвращается к результату, не изучая отдельную подпрограмму.

**Scope:** Сохранить два пространства. В Workspace: явная локальная проверка → конкретная находка → основание → действие/оставить как есть. В Studio: исходный материал → выбранная задача → результат. Убрать дублирование управления, лишний брендинг и технические подробности из обязательного пути. Сохранить выбранный контекст, фильтры и возврат. Конфигурация модели доступна там, где она нужна, и не блокирует локальную пользу.

**Acceptance:**

- Новая установка без ключа доходит до понятного локального результата; пустой vault и отсутствие находок не изображают проблему.
- Открытие/переключение экранов не запускает модель или полный скан само по себе.
- Охват написан рядом с действием; выбранная папка не обещается как scope операции, которая реально глобальна.
- RU/EN, обе стандартные темы, клавиатура, узкая панель, split/popout и сохранение состояния проверены.
- Есть короткая запись законченного сценария, а не только скриншоты отдельных состояний.

**Excluded:** Нет общей объединённой оболочки, обязательного нового workspace/project manager или принудительной фирменной темы.

### R04 — Аудит с мягким профилем хранилища и необязательным реестром

**User outcome:** Пользователь без методики получает объяснимые предложения по устройству своей базы, а подготовленный пользователь может подключить свои правила.

**Scope:** Повторно использовать инвентарь тегов и проверки Health. Ввести единый явно выбранный охват с исключениями, ревизией, полнотой и отменой. Сначала локально выявлять наблюдаемые папки/типы/теги; смысловые предложения делать только по разрешённому содержимому и настроенной модели. Различать наблюдение, гипотезу и подтверждённое правило. Рабочие предположения могут направлять предложения плагина с пометкой происхождения, без обязательного визарда утверждения. Пользовательский профиль имеет приоритет. Markdown-файл правил/реестра предлагается, но не является условием работы; его создание требует явного действия.

**Acceptance:**

- Есть полезный результат в vault без tags/YAML/реестра и в маленьком почти пустом vault без выдуманной классификации.
- Существующий реестр подключается; разрешённый неиспользуемый тег отличается от неизвестного. Отсутствующий и повреждённый файл не смешиваются.
- Нестандартный тег, папка или свойство дают необязательный совет, а не блокировку обычного сохранения.
- Нет автоматического массового переименования, заполнения свойств или передачи всего vault модели.
- Видны изученный охват, ограничения и примеры основания. Повторный аудит не заменяет подтверждённые пользователем правила.
- Служебные инструкции/реестр/backup не загрязняют анализ; неполный кеш обозначен как неизвестность.

**Excluded:** Нет обязательной методологии, строгой оценки послушания профилю, универсальной базы правил или AI-пересылки без согласия.

### R05 — Из результата аудита — к небольшому числу полезных решений

**User outcome:** Аудит помогает сделать конкретную работу, а не создаёт длинную очередь обязательной уборки.

**Scope:** Показывать несколько приоритетных предложений с источниками, ожидаемым эффектом, риском, scope и ценой при наличии облачного шага. Переиспользовать существующие сравнение пар, ссылки, MOC, разбиение/консолидацию и историю; прежде чем менять каждый старый инструмент, проверить его фактический контракт. Добавить ручную и предложенную разметку заметок из UI, отдельные изменения реестра. Сохранить «оставить как есть», «позже», исключения и выбранный контекст.

**Acceptance:**

- Предложение ведёт к конкретному подготовленному действию, а не пустому каталогу.
- Выбранные tag/link patches проверяют свежесть источника и профиля; чужие изменения не затираются.
- Отклонённая рекомендация не возвращается без изменившихся оснований; неполный скан не означает, что проблема исправлена.
- Редкое использование, возраст или изолированность заметки не объявляются достаточным основанием удалить её.
- Полезный несвязанный дневник и две похожие заметки разного назначения проходят отрицательные контроли.
- Работает существующая поддерживаемая отмена; новый универсальный Undo не обещается без реализации.

**Excluded:** Нет автономной чистки/удаления, обязательной нормализации всех тегов или аудита дублей карточек Recall.

### R06 — Одна семантическая карта: семьи заметок и сравнение со связями

**User outcome:** Карта показывает смысловые семьи и помогает понять расхождения с построенными ссылками и тегами.

**Scope:** Убрать отдельный дублирующий Graph View экран, но оставить внутренние данные реальных ссылок для Health. Использовать семантическую основу расположения и отдельные необязательные слои ссылок/тегов. Переходить от обзора семей к окружению заметки и существующему разбору пары. На больших vault разделить охват индекса/расчёта и число отображённых узлов; измерить узкие места до смены алгоритма.

**Acceptance:**

- Семантически близкая, но несвязанная заметка имеет объяснимый кандидат на связь; добавление не автоматическое.
- Дальняя семантически явная ссылка может остаться полезным мостом и не объявляется ошибкой.
- Несколько тем заметки не сводятся принудительно к одной; выбор/zoom не перетасовывают всё представление.
- У карты есть доступный список, читаемые подписи и честные обозначения недоступных/неиндексированных данных.
- Проверены 1k/5k/10k-сценарии с реальными различиями содержания; отображение групп не подменяет невычисленный анализ.
- Приближённые координаты не называются точными расстояниями, а широта тем — качеством человека или базы.

**Excluded:** Нет второй карты ссылок, нового редактора диаграмм и простого увеличения cap без измерений.

### R07 — Портрет текстов: облако слов, темы и возможные речевые повторы

**User outcome:** Отдельное представление в существующем Workspace показывает словарь и темы базы с переходом к исходным местам.

**Scope:** Считать локально слова и частые фразы по выбранной области. Альбомное облако: больше частота — больше надпись; рядом доступный ранжированный список. Разделить общее число употреблений и число заметок. По умолчанию не считать YAML, URL, код, шаблоны, собственные отчёты/промпты; явно определить учёт цитат, переводов, словарей и Flashcards. Темы брать из тегов/семантических семей с подписью метода, а не переименовывать самые частые слова в темы. Кандидаты на слова-паразиты показываются по контексту, без автоматического исправления.

**Acceptance:**

- RU/EN, фразы, пунктуация, Unicode, длинная заметка и небольшой vault проверены на известных счётчиках.
- Размер слова монотонен по выбранной величине; точное число и тип счёта доступны.
- Клик открывает подтверждённые вхождения; изменение фильтра не обращается к LLM.
- Частая техническая терминология не объявляется паразитом; неизвестное авторство импортированного текста не приписывается пользователю.
- Табличный fallback, клавиатура, тема Obsidian, отмена и инкрементальное обновление работают.
- Dataview не требуется. Визуализация — проверенный код плагина, не произвольно сгенерированный исполняемый JavaScript.

**Excluded:** Нет оценки интеллекта/стиля автора, автоматического редактирования речи и обязательного DataviewJS. Экспорт статичного снимка — только если нужен для завершённого сценария, не отдельный редактор.

### R08 — Редактируемые инструкции модели с понятным происхождением

**User outcome:** Пользователь видит и может менять инструкции Veynrel без обязательной настройки перед началом работы.

**Scope:** Один реестр workflow-инструкций поверх существующих prompt builders. Рабочие defaults встроены. По явному действию выбранные промпты доступны как Markdown в настраиваемой папке; для подключённых файлов определить один источник истины. Сохранять старые пользовательские overrides Recall и рецептов. Показывать итоговую инструкцию, подстановки и технический формат ответа без ключей. Пользователь редактирует смысловые инструкции на свой риск; права записи, schema и бюджет исполняются кодом, а не просьбами модели.

**Acceptance:**

- Изменение файла меняет именно выбранный workflow; видны используемый источник и ошибки формата.
- Обновление плагина не затирает пользовательский prompt; доступно сравнение и явный возврат к default.
- Настройка не требует нового визарда и не возвращает обязательный Preview карточек.
- Импортированные инструкции не исполняются как JS, не дают доступ к чужим файлам и не снимают лимит бюджета.
- Папка промптов исключена из обычного анализа знаний. Изменение prompt во время запроса не разрешает позднюю запись по другому плану.

**Excluded:** Нет маркетплейса агентов, новых model providers, обучения модели и второго конкурирующего хранилища инструкций.

### R09 — Сохранить материал по намерению и мягким правилам vault

**User outcome:** Идея, итог разговора или рабочая запись попадают в понятное место без ручной сборки YAML и структуры.

**Scope:** В Studio реализовать компактный вход из текста, выделения или существующей заметки. Тип результата/проект/папка предлагаются по контексту и профилю, остаются видимыми и изменяемыми. Простое сохранение дословно без LLM; переработка — отдельное намерение. Результат обсуждения отделяет решения от предложений, творческий текст не переписывается без запроса. Не делать отдельную систему проектов поверх Obsidian.

**Acceptance:**

- Полезный сценарий работает без реестра и профиля; предлагаемое место не становится принудительным.
- Конфликт имени не перезаписывает файл; итоговая цель соответствует показанной пользователю.
- Исходный текст и нужные свойства сохранены, ссылки разрешаются.
- Профиль применяется к собственной новой записи, но не навязывается всем старым заметкам.
- После сохранения результат легко найти и открыть рядом с исходником.

**Excluded:** Нет автоматической переработки любого входа, обязательной генерации десятка заметок и нового CRM/task manager.

### R10 — Сохранение внешнего источника и выбранная внутренняя ссылка

**User outcome:** Один доступный материал можно читать локально, сохранив происхождение и границы полноты.

**Scope:** До сети/модели искать существующую карточку URL. Получать только явно выбранный публично доступный материал с ограничением схем, редиректов, размера и локальных/private адресов. Сохранять источник, дату получения, доступное авторство и статус полноты. Исполняемый HTML/скрипты не переносить. После успешного сохранения отдельно предложить patch выбранного вхождения внешней ссылки.

**Acceptance:**

- Повторный URL не создаёт ещё одну независимую копию; смысловые query-параметры и anchors не теряются молча.
- Ошибка получения не меняет исходную ссылку. YAML source_url, код и цитируемые оригиналы не переписываются общей заменой.
- Видно, какие изображения/видео остались внешними; offline не обещается для несохранённых ресурсов.
- Обновление страницы не затирает личные комментарии. Нет обхода авторизации/paywall или произвольного обхода сайта.
- Секреты, cookies и provider credentials не отправляются сайту источника.

**Excluded:** Нет собственного браузера, массового crawler, обхода ограничений доступа или автоматической замены ссылок во всём vault.

### R11 — Длинные переводы и переработка источников с продолжением

**User outcome:** Длинный источник переводится полностью либо остаётся честно обозначенным незавершённым материалом.

**Scope:** Фиксировать извлечённый оригинал и список сегментов до обработки. Сохранять состояния, отмену, стоимость и явное продолжение. Разделять оригинал, перевод, конспект и комментарии как представления одного источника, а не независимые доказательства. Сохранять структуру, оговорки, примеры, код/формулы и соответствие сегментов. Переиспользовать bounded Studio transport, а не просто увеличивать timeout.

**Acceptance:**

- Оборванный ответ не превращается в готовую главу; повтор не дублирует ранее подтверждённые сегменты.
- Продолжение привязано к исходнику/модели/prompt snapshot; новые ручные правки защищены.
- Полнота сегментов и смысловая точность отчётливо различаются.
- Оригинал и перевод считаются одним происхождением в source index/RAG.
- На реальной модели качество проверяется отдельно от mocked contract tests в разрешённом бюджете.

**Excluded:** Нет автоматического продолжения со скрытыми расходами, восстановления невидимого текста по названию и обещания безошибочного перевода.

### R12 — Учебный материал в vault без обязательного ZIP

**User outcome:** Выбранный материал превращается в связные понятия, практику и источники с переходом в существующий Recall.

**Scope:** Предложить bounded набор файлов с понятными названиями, направлениями сохранения и связями по профилю. Перед созданием проверить список файлов, коллизии, YAML/wiki-links и реально доступные ресурсы. Сохранять журнал последовательного создания, частичный итог и безопасное продолжение. Использовать один Recall, не новый планировщик. ZIP остаётся импортом/экспортом, а не обязательным ручным этапом.

**Acceptance:**

- Пакет без коллизий, битых внутренних ссылок и вымышленных источников.
- При сбое видны созданные и незавершённые части; повтор не уничтожает пользовательские изменения.
- Созданный/изменённый пользователем файл не удаляется слепым rollback.
- Материал остаётся подробным по выбранному намерению, но не размножается ради количества файлов.
- Кнопка повторения ведёт к существующим темам/карточкам; генерация не объявляет знания усвоенными.

**Excluded:** Нет нового курса-планировщика, второго FSRS и возврата Excalidraw; аудит дублей вопросов остаётся отложенным.

### R13 — Сервер анонимного демо с контролируемым бюджетом

**User outcome:** Есть проверенный серверный контракт пробного доступа без выдачи оплачиваемого ключа клиенту.

**Scope:** Отдельный gateway с серверным ключом и короткоживущими анонимными сессиями, разрешёнными операциями/моделями, лимитами входа/выхода, concurrency, idempotency, резервированием стоимости до dispatch и сверкой после. Индивидуальная session/install quota — мягкая; общий бюджет/kill switch — обязательный. Минимальная техническая отчётность, без хранения текста по умолчанию. Документировать маршрут и retention. Развёртывание и расходы требуют отдельного разрешения.

**Acceptance:**

- Ключа нет в main.js, запросах к клиенту, логах и архиве. Подмена заголовка приложения не даёт расширенного доступа.
- Параллельные запросы не обходят резервирование; неопределённый биллинг не освобождает резерв без основания.
- Потерянный ответ/retry/idempotency не создают двойную выдачу или повторный неконтролируемый расход.
- Показан остаточный риск обхода квоты переустановкой; не обещана идентификация уникального человека без аккаунта.
- При недоступном сервере локальные функции и сохранённые данные продолжают работать.

**Excluded:** Нет общего публичного OpenRouter key, обязательной регистрации/email, оплаты локальных функций, подписки или автоматического production-deploy.

### R14 — Демо в плагине для всех сохраняемых возможностей

**User outcome:** Пользователь может попробовать поддерживаемые AI-сценарии без ручного выбора провайдера и ключа, в пределах малого бюджета.

**Scope:** Добавить готовое подключение demo через capability-aware transport. Не прятать отдельные продуктовые функции за trial-планом; поддержать матрицу kept language/embedding/rerank операций. До отправки показывать выбранные данные и реальные получатели. Область индексации и последующей синхронизации должна совпадать с согласием; не тратить весь trial скрытой полной индексацией. Пользовательский ключ/локальная модель подключаются отдельно.

**Acceptance:**

- Первая полезная AI-операция доступна без регистрации и ручного setup, но не без согласия на отправку текста.
- Каждый сохраняемый workflow проверен через demo transport; неподдержанное явно отмечено, а не объявлено полным демо.
- Полный расход, частичный результат, остановка и истечение квоты показываются понятно.
- После окончания квоты остаются заметки, вопросы, расписания, локальный аудит и ручные возможности.
- Embeddings разных моделей не смешиваются; смена режима не запускает незаявленные повторные отправки.
- Произвольный пользовательский prompt не может изменить серверную модель, scope или денежный потолок.

**Excluded:** Нет бессрочного обещания бесплатности, скрытого дорогого fallback, регистрации или freemium-блокировки локальных данных.

### R15 — Итоговая приёмка, производительность и понятная поставка

**User outcome:** Завершённые сценарии проверены вместе, поставка соответствует рекламе, ограничения видны.

**Scope:** Свести интеграционные регрессии и миграции после каждого модуля, затем финальную свежую установку/upgrade. Проверить слабый desktop и большие синтетические/разрешённые реальные vault; не считать 390px сертификацией телефона. Обновить README, каталог/подзаголовок, инструкции, реальные демонстрации и источники метрик. Не откладывать все проверки сюда: каждый предыдущий PR имеет собственные gates.

**Acceptance:**

- Каждое требование матрицы имеет evidence или явно открытый статус, а не только закрытый PR.
- Новые пользователи выполняют основной маршрут с фиксацией помощи и неполезных рекомендаций; пользовательские решения не подменяются выводами модели.
- Отделены unit/contract/native/live-quality/human evidence. Текущий frozen эксперимент не обновлён задним числом.
- У каждого опубликованного обещания есть реально выпущенная версия и воспроизводимый сценарий.
- Downloads, новые установки, активация и повторное использование не смешиваются; скрытая телеметрия не добавляется.
- Release и merge требуют отдельного разрешения, нет автоматического изменения Marketplace или постинга.

**Excluded:** Нет новых функций, автоматического 100/100, обещаний роста установок и массовой маркетинговой рассылки.

## Completion and quality gates

“Maximum score” is not a deliverable that can be guaranteed by merging code. Retain a 100-point review rubric only as an explicit assessment framework, not as a measured adoption metric. The prior conversation's 67/100 was an expert judgment, not a runtime benchmark.

| Dimension | Weight | Evidence needed to justify improvement |
|---|---:|---|
| Clear purpose | 10 | New users can explain the job without enumerating internal module names |
| First useful result | 12 | Fresh install reaches an understandable local result without keys or a compulsory registry |
| Useful audit | 16 | Reviewed recommendations have concrete grounds; negative controls and valid exceptions are retained |
| Semantic discovery | 12 | Useful relationships on real or approved corpora, with explicit coverage and meaningful map/list navigation |
| Studio work | 10 | Complete save/source/translation workflow, preserving meaning and provenance |
| Everyday UX | 12 | Two simple spaces, context restoration, actionable errors and no unnecessary steps |
| User control and data safety | 10 | Scope, freshness, consent, recovery and budget contracts hold under failure |
| Large vaults | 6 | Measured 1k/5k/10k scenarios, responsive interaction and honest sampling/coverage |
| Platforms and accessibility | 6 | Actual tested OS/device/input/theme coverage; a narrow desktop viewport is not a phone test |
| Recall integration | 6 | Themes, vocabulary, identity and undo remain useful and correct in daily use |
| **Total** | **100** | No automatic points for file count, passing tests, additional features or merged PRs |

A release is ready only for capabilities with passing acceptance checks or explicitly documented limitations. Synthetic actor results remain scenario evidence; they do not measure human retention or prove demand. Keep functional tests, native checks, live-model quality and human observation separate.

## Release policy and acquisition work

Owner decision, recorded in R02: complete all fifteen stages R01–R15 before one public release. Until R15 is accepted, there are no public stable, beta or prerelease publications and no Marketplace updates. Publication after acceptance still requires separate owner authorization.

Internal release candidates, test builds, updates of disposable vaults and regression checks after every PR are permitted. Tests, documentation, backups and migration verification remain per-PR gates; they are not deferred to R15. For each internal candidate, compare the default branch, published release tag, manifest, three runtime assets and their hashes. Do not advertise unreleased features as available in the Marketplace.

The current 2.4.0 from R01 is an unpublished intermediate version, not a public release commitment. Determine the final version at R15; individual stages do not automatically bump it. This release-policy decision changes none of the product constraints, acceptance criteria or R01–R15 dependencies above.

Use a focused first screen, a complete demonstrable scenario and a readable no-key path. Existing README content may be reused, but removed diagram features and future cloud claims must not remain current promises. Show normal outcomes, not only unavailable/stale-index screens. Label scripted demonstrations as such.

Before interpreting a reported download drop, identify the counter, time window and freshness. A release-asset download count is not a unique new-user or active-user count. Track public totals consistently and gather first-use/return feedback voluntarily; do not add hidden plugin telemetry. Separate visibility, installation, first useful action and later reuse. Better engineering cannot guarantee traffic or growth.

## Explicitly deferred or rejected

- Semantic duplicate auditing of Recall questions by subtag is deferred.
- Broad Anki migration, an FSRS optimizer/history analytics suite and embedded local model distribution are not commitments in this scope.
- No merged workspace, obligatory methodology, automatic cleanup, executable AI-generated DataviewJS, universal undo claim, new browser/CRM, or Excalidraw revival.
- No subscription/freemium paywall decision; no key publication or guaranteed per-human anonymous identity.
- No in-place alteration of frozen persona experiments or reinterpretation of previous results after a feature change.

## Sources and provenance

This plan is distilled from the owner's product requirements; personal vault contents, private paths, actor logs, account statistics and credentials are deliberately not included. Implementation details and PR order remain proposed.

- [Original planning main commit](https://github.com/zinverno/veynrel/commit/aae049c98794922b33404bc5168191e9972c9863)
- [Verified planning PR base (2026-11-13)](https://github.com/zinverno/veynrel/commit/becb982f8d789ab53bbec31a83952b818e70d4cd)
- [Later Recall persistence fix](https://github.com/zinverno/veynrel/pull/137)
- [Merged Recall work](https://github.com/zinverno/veynrel/pull/136)
- [Stable release observed during planning](https://github.com/zinverno/veynrel/releases/tag/2.3.1)
- [Tag Taxonomy](https://github.com/zinverno/veynrel/blob/aae049c98794922b33404bc5168191e9972c9863/docs/tag-taxonomy-profile-v1.md)
- [Tag recommendations](https://github.com/zinverno/veynrel/blob/aae049c98794922b33404bc5168191e9972c9863/docs/tag-recommendations-v1.md)
- [Recall guide](https://github.com/zinverno/veynrel/blob/aae049c98794922b33404bc5168191e9972c9863/docs/wiki/Recall.md)
- [Dataview custom views and file loading](https://blacksmithgu.github.io/obsidian-dataview/api/code-reference/)
- [Dataview JavaScript security boundary](https://github.com/blacksmithgu/obsidian-dataview#javascript-queries-security-note)
- [OpenRouter credit/rate limits](https://openrouter.ai/docs/api_reference/limits)
- [GitHub release-asset API](https://docs.github.com/en/rest/releases/assets)
