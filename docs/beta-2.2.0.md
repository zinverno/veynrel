# Veynrel 2.2.0 — Beta 1

## English

Opt-in desktop beta. Install manually on a backed-up copy of your vault. This
does not replace stable 2.1.0 or move its default-branch manifest.

- Open **Vault review** directly as a list, without starting the map.
- Compare a candidate pair, separately consent to model analysis, and move from
  the validated recommendation to an available preparation scenario.
- Inspect the exact change, separately Apply it, then use History and a separate
  Undo. Adding a link does not resolve the underlying content overlap.
- **Leave as is** remembers the pair's saved Markdown versions. Restore it from
  **Reviewed**; changed content makes the pair eligible again.
- Tag/folder rules act before top-K: suppress links within a group, or exclude
  it from connection search. Duplicate search remains independent.

Start: external backup → install on a copy → Vault review → scope → candidates
→ compare → consent → decision → exact review. For example, suppressing links
within `#practice/task` still allows task→explanation pairs and exercise
duplicates. It does not establish that every surviving pair is useful.

Consolidation copies supported material while preserving the other note; it is
not universal automatic file merging. Archive and Undo have separate conditions
and confirmations. No claim of automatic removal, complete gap detection or
infallible recommendations is made.

## Русский

Добровольная desktop beta. Устанавливайте вручную на копию vault после внешнего
backup. Стабильная 2.1.0 и её manifest в default branch сохраняются.

- **Разбор хранилища** открывается списком без запуска карты.
- Сравните пару, отдельно подтвердите анализ моделью и перейдите от проверенной
  рекомендации сразу в доступный сценарий подготовки.
- Проверьте точное изменение, отдельно примените его, затем найдите результат
  в истории и отдельно отмените. Ссылка не устраняет смысловое пересечение.
- **Оставить как есть** запоминает сохранённые версии пары. Вернуть её можно
  через **Рассмотренные**; изменение текста возвращает возможность разбора.
- Правила тега/папки действуют до top-K: запрет связей внутри группы или
  исключение группы из поиска связей. Поиск дубликатов остаётся независимым.

Старт: внешний backup → установка на копию → Разбор хранилища → область →
кандидаты → сравнение → согласие → решение → точный review. Правило «не предлагать
внутри `#practice/task`» сохраняет task→explanation и дубликаты упражнений,
но не доказывает пользу каждой оставшейся пары.

Объединение копирует допустимый материал с сохранением второй заметки; это
не универсальное автоматическое слияние файлов. Архивирование и Undo требуют
отдельных проверок и подтверждений.

## Privacy / Приватность

Only after explicit consent, the saved full Markdown and properties of the
selected pair are sent to the configured provider and may incur charges.
Review the request and destination before consenting.

Только после отдельного согласия полные сохранённые тексты и свойства выбранной
пары передаются настроенному провайдеру; запрос может тарифицироваться.
Проверьте тело запроса и получателя до подтверждения.

## Limits / Ограничения

- Semantic calculation: at most 500 eligible documents per selected scope.
  A 1000-note inventory is not a semantic analysis of all 1000; narrow the scope.
  Rule filtering can increase candidate counts by freeing top-K positions.
- Rules and decisions support one Obsidian process; no Sync/conflict-resolution
  guarantee. A link is a local fact, not proof that content overlap disappeared.
- Beta metadata: `ai-knowledge-hub`, Obsidian ≥1.13.7, desktop only. Acceptance
  environment: Linux, Obsidian 1.13.7 / Electron 43.6.0. The wider Stage 3 run
  covered built-in light/dark, RU/EN, narrow desktop, keyboard, split/popout,
  200% app zoom and reduced motion at its recorded SHA. Packaging smoke is a
  separate, shorter check of the final files, recorded in the release PR.
- Windows/macOS, physical mobile, screen readers, all third-party themes/GPU
  setups and multi-process/Sync are unverified. The distribution restriction
  does not prove incompatibility with older Obsidian or mobile. A narrow desktop
  pane is not a mobile-device test.
- Synthetic vectors/loopback responses establish integration, not model quality.
  Historical #112 live diagnostics are separate; no new live calls were made.
  The optional map remains secondary; its earlier visual experiment is not
  presented as accepted by this beta.

Семантический предел — 500 подходящих заметок в области; для большего набора
сузьте область. После правила кандидатов может стать больше. Правила и решения
не обещают разрешение Sync-конфликтов. Проверена Linux desktop-среда; остальные
ОС, физический mobile и все пользовательские темы не подтверждены.

[Installation and rollback / Установка и откат](https://github.com/zinverno/veynrel/blob/release/2.2.0-beta1/docs/beta-install.md)
· [Packaging policy and checks](https://github.com/zinverno/veynrel/blob/release/2.2.0-beta1/docs/review-stage-4.md)
· [Historical Stage 3 evidence](https://github.com/zinverno/veynrel/blob/6503cdb86e0213dcc1b69dbb8b503fa2b70af5b2/docs/review-stage-3-evidence/README.md).
