# Native visual review candidate — checkpoint A

**Не UX PASS.** Изображение и движение ожидают ручного одобрения. Все кадры полные, из настоящего Obsidian 1.13.7 / Electron 43.6.0; данные, названия и векторы синтетические. Источник сборки: [`2da829d8fdbfcd4fc08b1e62746897c83a16a1bb`](SOURCE_COMMIT), [SHA256](SHA256SUMS).

## Посмотреть сначала

- [Короткий native-маршрут карты](builtin/map-navigation.mp4): загрузка и стабилизация → expand → hover → node drag → wheel в обе стороны → три принадлежности → кандидат → Compare → возврат.
- [Видео штатного Graph View рядом](builtin/graph-reference.mp4), [полный кадр сравнения](builtin/reference-side-by-side.png). Native mouse/keyboard input; внутренние объекты Graph View не использовались.
- [Обзор в развёрнутом режиме](builtin/expanded-overview.png), [средний zoom](builtin/medium-zoom.png), [близкий zoom](builtin/close-zoom.png), [три принадлежности](builtin/three-memberships-dark.png).

| Тема | Обзор | Средний zoom | Близкий zoom | Многотеговый выбор |
|---|---|---|---|---|
| Built-in light | [кадр](themes/overview-light.png) | [кадр](themes/medium-light.png) | [кадр](themes/close-light.png) | [кадр](themes/membership-light.png) |
| Built-in dark | [кадр](themes/overview-dark.png) | [кадр](themes/medium-dark.png) | [кадр](themes/close-dark.png) | [кадр](themes/membership-dark.png) |
| Red Graphite 1.0.5 dark | [кадр](red-graphite/overview-dark.png) | [кадр](red-graphite/medium-dark.png) | [кадр](red-graphite/close-dark.png) | [кадр](red-graphite/membership-dark.png) |
| Red Graphite 1.0.5 light | [кадр](red-graphite/overview-light.png) | [кадр](red-graphite/medium-light.png) | [кадр](red-graphite/close-light.png) | [кадр](red-graphite/membership-light.png) |

[Hover тега: ровно 95 metadata members](themes/tag-hover-exact-members.png). Цвет поля не определяет членство. Показаны три из 51 доступного слоя (46 прямых тегов + пять префиксов); другие принадлежности не удаляются.

## Маршрут и границы

[Validated comparison](builtin/validated-comparison.png) → [точный review](builtin/exact-change-review.png) → [Apply](builtin/applied.png) → [история](builtin/operation-history.png) → [отдельный Undo review](builtin/separate-undo-review.png). Completion transport — локальный fake, validator/planner/writer/journal/Undo — настоящие. [До](builtin/before.json) и [после](builtin/after.json): все Markdown SHA256 совпадают. Это не live-model test.

[390 px RU/dark](builtin/map-ru-dark-390.png), [390 px EN/light](builtin/map-en-light-390.png), [200% Electron zoom](builtin/zoom-200.png), [настоящий split](builtin/native-split.png), [тот же ItemView в popout](builtin/native-popout.png), [reduced motion](builtin/reduced-motion.png).

[500 документов](500/overview-dark.png), [1000 в агрегатах](1000/overview-dark.png), [раскрытие агрегата](1000/group-disclosed.png), [нет индекса](no-index/no-index.png), [unknown metadata](builtin/unknown-metadata.png), [stale sources](builtin/stale-sources.png). Unknown/stale — обозначенные fault injections через metadata adapter / index revision notification; они не выданы за реальные повреждения индекса.

## Проверяемые отчёты

- [Основной native RU](builtin/report.json), [отдельная EN-матрица](en-edges/report.json), [light/dark + keyboard + tag hover — тот же основной прогон](themes/report.json), [500](500/report.json), [1000](1000/report.json), [без индекса](no-index/report.json), [Red Graphite](red-graphite/report.json).
- [Измерения](measurements.json): CPU TaskDuration всего renderer за окно refresh, отдельно JavaScript физики/отрисовки, интервалы кадров и event→два RAF после native wheel. Это не аппаратная input-to-photon latency. На 154 запись видео включена; на 500 выключена. Electron запущен с `--disable-gpu`; 60 FPS не заявлены.
- [Installer self-test](installer.json), [прерывание Electron compositor и чистый повтор](runtime-interruption.json). Прерванный прогон не считается PASS; финальные RU/EN матрицы разделены по свежим профилям. Два native compositor сбоя сохранены как нерешённый риск.
- [4542 тест](tests.log), [typecheck/build/lint](lint.log), [mutation audit 5/5](audit.log). Существующее предупреждение `api.ts:414` сохранено. Audit и synthetic installer test выполнены вне sandbox после непригодных результатов дочерних процессов внутри него; проверки не ослаблялись.

Не проверены физический trackpad/touch/mobile, screen reader, другие сторонние темы и реальные провайдеры. Срез не меняет установленный TEST, оригинальный vault, executor protocols, версию или зависимости. Этап B начинается только после явного визуального одобрения.
