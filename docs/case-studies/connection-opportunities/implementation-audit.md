# Аудит существующего пути

Прочитаны README, оба руководства Connection Opportunities, тесты derivation,
controller и view state, Global Map service/controller/model, native-скрипты и
предыдущие изображения. Исторические цифры 313 Candidate и native-матрицы из
руководств не включены в результаты нового опыта. Graphify-граф отсутствовал;
использованы адресный поиск вызовов и исходники, новый граф не строился.

| Область | Действующая реализация и следствие для опыта |
| --- | --- |
| Семантика | [`semanticDiscoveryService.ts`](../../../semantic/semanticDiscoveryService.ts): группировка чанков документа, нормализованное среднее векторов, минимум 32 meaningful characters и coherence > 1e-5. Exact all-pairs cosine, лимит 500 eligible документов, top-5 каждого; рёбра — симметричный union списков, без cosine threshold. |
| Карта | [`semanticGlobalMapController.ts`](../../../semantic/product/semanticGlobalMapController.ts), [`semanticGlobalMapModel.ts`](../../../semantic/product/semanticGlobalMapModel.ts): явная загрузка/refresh, опубликованные revision и snapshot. Focus не меняет underlying comparison. Близость к core и размер узла не являются оценкой полезности. |
| Markdown | [`obsidianLocalVaultSource.ts`](../../../health/analyzers/local/obsidianLocalVaultSource.ts): native cache links, embeds, frontmatterLinks, referenceLinks; разрешение адресатов в рамках scope. Это шире, чем поиск `[[...]]` регулярным выражением. |
| Сопоставление | [`deriveConnectionComparison.ts`](../../../health/connections/deriveConnectionComparison.ts): join двух опубликованных графов. Candidate = semantic pair без ссылки при известных обоих концах; Aligned = semantic pair со ссылкой; Explicit-only = известная ссылка вне union. Каноническая пара одна, направление ссылки сохраняется. |
| Ранги | Оба ранга ≤3 → mutual-top-3. Оба определены, хотя бы один 4–5 → mutual-top-5. Только один определён → one-sided-top-5. Это три непересекающиеся группы. |
| Порядок | Rank class, количество shared neighbors по убыванию, точный cosine по убыванию, left path, right path. Shared — пересечение опубликованных top-5 без концов пары, отсортированное по пути. Это контекст, не confidence. |
| Review | [`connectionComparisonViewState.ts`](../../../health/connections/connectionComparisonViewState.ts): Map в памяти конкретного view, только Candidate. Новый snapshot очищает verdicts; stale с сохранённым snapshot — нет. Нет сохранения в data.json или истории. |
| Действия | [`renderConnectionComparison.ts`](../../../health/connections/renderConnectionComparison.ts): чтение evidence, фильтры и вызовы открытия заметок/Neighborhood. Ссылки не создаются. Native side-by-side использует публичный Workspace API. |
| Неполнота | [`connectionComparisonController.ts`](../../../health/connections/connectionComparisonController.ts): revision/freshness, явный refresh; unavailable metadata не доказывает отсутствие ссылки. Оба конца должны быть сопоставимы. Неизвестные пары учитываются отдельно. |
| После edit | [`indexingService.ts`](../../../indexing/indexingService.ts): metadataEqual учитывает source offsets, а изменившаяся metadata снова направляется в embed. Поэтому неизменность chunk text не гарантирует нулевой provider IO после правки frontmatter. |

Существующие проверки:

- [Derivation](../../../health/connections/deriveConnectionComparison.test.ts): категории,
  направления, ранги, сортировка, shared neighbors, отсутствие метаданных, невалидный ввод.
- [Controller](../../../health/connections/connectionComparisonController.test.ts):
  passive load, coalescing, stale, revision, race/dispose, неполный inventory.
- [View state](../../../health/connections/connectionComparisonViewState.test.ts):
  lifecycle verdicts, filters, suffix Excalidraw, неизменность source evidence.
- [Global Map controller](../../../semantic/product/semanticGlobalMapController.test.ts):
  состояние карты, focus и freshness. Вместе с предыдущими тремя файлами:
  **109 тестов прошли в этом запуске**.

Просмотрены исторические native-примеры
[`connection-opportunities-native.mjs`](../../../scripts/connection-opportunities-native.mjs)
и `docs/final-product-ui-ux-evidence/after/en-connection-opportunities.png`,
а также README showcase карты. Они служили ориентирами для существующих действий
и оформления. В этом пакете используются только новые снимки.

Изменения охватывают документацию, корпус, векторы и два исследовательских
Node-скрипта в `scripts/`. Callers, exports, настройки, версии, сборка продукта
и существующие тесты не изменены. Блокирующего продуктового бага не установлено.
