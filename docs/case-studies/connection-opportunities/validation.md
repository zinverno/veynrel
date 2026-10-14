# Проверки пакета, 2026-10-14

Исходный production commit: `f09500cbe64c830b77da5b9fba28dc5ace033de1`.
Ветка `docs/connection-opportunities-case-study`, отдельный checkout.
Production TypeScript, package-lock, версии, settings/defaults и существующие
тесты не менялись. Исходный рабочий checkout сохранён.

| Проверка | Статус | Что именно проверено |
| --- | --- | --- |
| `npm test` | PASS | 2910 тестов, 115 файлов |
| `npm run typecheck` | PASS | Основной и Health tsconfig |
| `npm run lint` | PASS | 0 errors, единственное уже разрешённое предупреждение `api.ts:402` о streaming fetch |
| `npm run build` | PASS | `main.js` SHA совпал с установленным native artifact |
| Focused Connection / Global Map tests | PASS | 109 тестов, 4 файла |
| `node --check scripts/connection-case-study.mjs` и native script | PASS | Синтаксис обоих Node-скриптов |
| Offline повторение на новой директории | PASS | Полное JSON-совпадение с frozen outcome, хеши/размеры vectors, production index и map, independent set join, injected missing metadata |
| Окончательный native-сценарий целиком на свежей копии | PASS | 20 assertions, настоящий Obsidian 1.13.7, 3 PNG, одна ссылка, переход по ней, один локальный replay после edit |
| Полные тексты выбранных пар | PASS — агентская проверка | 10/10 пар, 16 различных заметок; технические оценки, не человеческие verdicts |
| Целостность исследовательского пакета | PASS | 40 corpus SHA, SHA неизменного protocol, 10 CSV-строк в точном порядке, точные quotes/scores, хеши и размер 1600×1100 трёх PNG |
| Scoped privacy и visual review | PASS в указанном объёме | Проверены новые текстовые материалы и все опубликованные изображения; только публичные synthetic notes, нет ключей/личных путей |
| Человеческая полезность | NOT RUN | Все 10 строк `Requires human review`; контрольные клики не включены |
| Live provider / Ollama indexing | NOT RUN | Только ранее рассчитанные реальные vectors и loopback replay |
| Personal vault / mobile / screen reader / сторонние темы | NOT RUN | Не входят в полученные native evidence |

Подготовка зависимостей использовала существующий lockfile. `npm ci` сообщил
12 dependency advisories (7 moderate, 5 high); dependency remediation и отдельный
аудит безопасности не выполнялись, зависимости не обновлялись.

В первоначальном scaffold lint отклонил `.mjs` в `docs/` из-за project service.
Скрипты перемещены в существующую директорию Node-инструментов `scripts/`.
Правила lint и tsconfig не ослаблялись. Assertions выполняются самими скриптами;
project ESLint по существующему правилу исключает `scripts/`.

Native-прогон использует оригинальный plugin build и настоящие DOM / MetadataCache /
VectorStore. Только отдельная фаза отсутствующих metadata намеренно подменяет
один вызов и восстанавливает его. Человеческие judgments, performance/latency,
восстановление настоящих резервных копий и финансовые показатели этим не измерены.

Повторные чистые прогоны проверяют воспроизводимость одного набора; они не
увеличивают число независимых пар или пользователей. Результаты локальных
проверок не следует называть результатом hosted CI. Текущее состояние CI видно
в Draft PR отдельно.
