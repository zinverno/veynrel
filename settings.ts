import { t as tr, setLanguage, AIHubLang } from "./i18n";
import {
  App,
  ButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
  setIcon,
  requireApiVersion,
} from "obsidian";
import AIHubPlugin from "./main";
import { LLMProvider, PROVIDER_PROFILES } from "./constants";
import type { InsertionType } from "./constants";
export type { InsertionType } from "./constants";
import {
  testConnection,
  fetchOllamaModels,
  fetchOpenRouterFreeModels,
} from "./api";
import { testEmbeddingConnection } from "./embeddings/factory";
import {
  DEFAULT_EMBEDDING_SETTINGS,
  EMBEDDING_PROVIDER_PROFILES,
} from "./embeddings/types";
import type {
  EmbeddingProviderId,
  EmbeddingSettings,
} from "./embeddings/types";
import {
  semanticControlDisabled,
  SemanticSettingsActionRunner,
} from "./semantic/semanticSettingsActionRunner";
import {
  DEFAULT_COMPANION_SETTINGS,
  isLocalCompanionEndpoint,
} from "./companionSync";
import type { CompanionSettings } from "./companionSync";
import { DEFAULT_HEALTH_PREFERENCES } from "./health/preferences";
import type { HealthPreferences } from "./health/preferences";

export interface AIHubSettings {
  // ── Провайдер ─────────────────────────────────────────────────────
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  topK: number;
  // ── Вставка ───────────────────────────────────────────────────────
  defaultInsertion: InsertionType;
  newNoteFolder: string;
  filenameTemplate: string;
  /** Папка для MOC-заметок, генерируемых из кластеров аудита */
  mocFolder: string;
  /** Куда складывать атомарные заметки: рядом с оригиналом или в общую папку */
  atomsLocation: "same" | "folder";
  /** Папка для атомарных заметок (используется в режиме "folder") */
  atomsFolder: string;
  // ── Интерфейс ─────────────────────────────────────────────────────
  showContextMenu: boolean;
  notifyOnCopy: boolean;
  language: AIHubLang;
  // ── Глубокий аудит ────────────────────────────────────────────────
  deepAudit: {
    batchSize: number;
    maxConcurrent: number;
    delayMs: number;
  };
  // ── Семантические функции ─────────────────────────────────────────
  semantic: EmbeddingSettings;
  /** Clear keeps automatic sync suspended until a later explicit index run. */
  semanticAutoSyncSuspended: boolean;
  /** Optional read-only network mirror used by the standalone Companion. */
  companion: CompanionSettings;
  health: HealthPreferences;
}

export const DEFAULT_SETTINGS: AIHubSettings = {
  provider: "openrouter",
  apiKey: "",
  model: "google/gemma-2-9b-it:free",
  baseUrl: "https://openrouter.ai/api/v1",
  temperature: 0.65,
  topK: 12,
  defaultInsertion: "end",
  newNoteFolder: "",
  filenameTemplate: "AI-{{date}}-{{topic}}",
  mocFolder: "MOCs/",
  atomsLocation: "same",
  atomsFolder: "Atoms/",
  showContextMenu: true,
  notifyOnCopy: true,
  language: "auto",
  deepAudit: {
    batchSize: 5,
    maxConcurrent: 3,
    delayMs: 1000,
  },
  semantic: { ...DEFAULT_EMBEDDING_SETTINGS },
  semanticAutoSyncSuspended: false,
  companion: { ...DEFAULT_COMPANION_SETTINGS },
  health: { ...DEFAULT_HEALTH_PREFERENCES },
};

// One inventory and the same custom callbacks serve both host rendering paths.
// keys record durable bindings, including nested/derived controls, for parity checks.
type SettingsRow = {
  keys: readonly string[];
  name: string;
  desc?: string;
  aliases?: string[];
  visible?: boolean | (() => boolean);
  searchable?: boolean;
} & ({
  control: { type: "text"; key: "filenameTemplate"; placeholder: string } |
  { type: "toggle"; key: "notifyOnCopy" };
  render?: never;
} | { control?: never; render: (setting: Setting) => void }
| { control?: never; render?: never });
// Plain plugin-owned data: the legacy renderer does not access new Obsidian APIs.
interface SettingsSection { type: "group"; heading: string; icon: string; items: SettingsRow[] }

// Keep the existing API dependency for older supported hosts. Only call the
// documented 1.13 refresh method after checking both version and capability.
function hasSettingsUpdate(tab: PluginSettingTab): tab is PluginSettingTab & { update: () => void } {
  return "update" in tab && typeof tab.update === "function";
}

// ─────────────────────────────────────────────────────────────────────
export class AIHubSettingTab extends PluginSettingTab {
  plugin: AIHubPlugin;
  private embeddingTestInFlight = false;
  private embeddingTestButton: HTMLButtonElement | null = null;
  private embeddingTestStatus: HTMLElement | null = null;
  private embeddingTestSnapshot: {
    provider: string;
    model: string;
  } | null = null;
  private readonly semanticActionRunner = new SemanticSettingsActionRunner();

  constructor(app: App, plugin: AIHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // ── Утилиты ─────────────────────────────────────────────────────────
  private addIcon(setting: Setting, icon: string) {
    const el = setting.nameEl.createSpan({ cls: "ai-setting-icon" });
    setIcon(el, icon);
    setting.nameEl.prepend(el);
  }

  private addHeading(text: string, icon: string) {
    const wrapper = this.containerEl.createDiv({ cls: "ai-hub-section-head" });
    const iconWrap = wrapper.createSpan({ cls: "ai-hub-section-icon" });
    setIcon(iconWrap, icon);
    wrapper.createDiv({ text, cls: "ai-hub-section-label" });
  }

  private setEmbeddingTestStatus(text: string, color: string) {
    if (!this.embeddingTestStatus?.isConnected) return;
    this.embeddingTestStatus.setCssProps({ "--ai-status-color": color });
    this.embeddingTestStatus.setText(text);
  }

  private setEmbeddingTestButtonBusy(busy: boolean) {
    if (!this.embeddingTestButton?.isConnected) return;
    if (busy) this.embeddingTestButton.setAttribute("disabled", "true");
    else this.embeddingTestButton.removeAttribute("disabled");
  }

  getSettingDefinitions(): SettingsSection[] {
    const save = async () => this.plugin.saveSettings();
    const { provider, semantic, companion } = this.plugin.settings;
    const profile = PROVIDER_PROFILES[provider];
    const row = (keys: readonly string[], name: string, desc: string | undefined,
      render: (setting: Setting) => void): SettingsRow => ({ keys, name, ...(desc === undefined ? {} : { desc }), render });
    const sections: SettingsSection[] = [
      {
        type: "group", heading: "", icon: "brain", items: [
          { ...row([], "Veynrel", tr("Настройки плагина"), (setting) => this.renderHero(this.customContainer(setting))), searchable: false }
        ]
      },
      {
        type: "group", heading: tr("@settings.group.deep"), icon: "cpu", items: [
          row(["provider"], tr("Языковая модель"), undefined, (setting) => this.renderProviderCards(this.customContainer(setting), save)),
          row([], profile.label, tr(profile.description), (setting) => this.renderProviderInfo(this.customContainer(setting))),
          {
            ...row(["apiKey"], "API key", profile.requiresApiKey
              ? tr("Хранится локально")
              : tr("Если требуется провайдером"), (setting) => {
                const el = setting.settingEl;
                const keySetting = setting
                  .addText((t) => {
                    t.inputEl.type = "password";
                    t.inputEl.setAttribute("autocomplete", "off");
                    t.setPlaceholder(tr(profile.apiKeyPlaceholder))
                      .setValue(this.plugin.settings.apiKey)
                      .onChange(async (v) => {
                        this.plugin.settings.apiKey = v.trim();
                        await save();
                        updateKeyHint(v.trim());
                      });

                    const updateKeyHint = (val: string) => {
                      el.querySelector(".ai-key-status")?.remove();
                      if (!val || !profile.apiKeyPrefix) return;
                      const hint = t.inputEl.parentElement?.createDiv({
                        cls: "ai-key-status",
                      });
                      if (!hint) return;
                      hint.addClass("ai-hub-key-hint");
                      if (val.startsWith(profile.apiKeyPrefix) && val.length > 20) {
                        hint.setCssProps({
                          "--ai-status-color": "var(--color-green,#4caf50)",
                        });
                        hint.setText(tr("✓ Формат ключа корректен"));
                      } else {
                        hint.setCssProps({
                          "--ai-status-color": "var(--text-warning,orange)",
                        });
                        hint.setText(tr("⚠ Формат ключа нестандартный"));
                      }
                    };
                    updateKeyHint(this.plugin.settings.apiKey);
                    return t;
                  })
                  .addButton((btn) => {
                    let visible = false;
                    btn
                      .setIcon("eye")
                      .setTooltip(tr("Показать/скрыть"))
                      .onClick(() => {
                        const input = el.querySelector<HTMLInputElement>(
                          'input[type="password"],input[type="text"]',
                        );
                        if (!input) return;
                        visible = !visible;
                        input.type = visible ? "text" : "password";
                        btn.setIcon(visible ? "eye-off" : "eye");
                      });
                  });
                this.addIcon(keySetting, "key");
              }), visible: () => profile.requiresApiKey || provider === "custom"
          },
          row(["model"], tr("Модель"), provider === "ollama"
            ? tr("Имя модели как в `ollama list`")
            : tr("ID модели провайдера"), (setting) => {
              const modelSetting = setting
                .addText((t) => {
                  t.inputEl.setAttribute("aria-label", tr("Название модели"));
                  t.setPlaceholder(profile.modelPlaceholder)
                    .setValue(this.plugin.settings.model)
                    .onChange(async (v) => {
                      this.plugin.settings.model = v.trim();
                      await save();
                    });
                  return t;
                });
              this.addIcon(modelSetting, "bot");
            }),
          {
            ...row([], `${tr("Модель")} — ${profile.label}`, tr("ID модели провайдера"), (setting) => this.renderModelOptions(this.customContainer(setting), save)),
            visible: profile.popularModels.length > 0 || provider === "ollama" || provider === "openrouter"
          },
          row(["baseUrl"], "Base URL", provider === "custom"
            ? tr("URL вашего OpenAI-совместимого API")
            : tr("Автозаполнен, можно изменить"), (setting) => {
              const urlSetting = setting
                .addText((t) => {
                  t.inputEl.setAttribute("aria-label", tr("Базовый URL API"));
                  t.setPlaceholder(profile.defaultBaseUrl || "https://your-api/v1")
                    .setValue(this.plugin.settings.baseUrl)
                    .onChange(async (v) => {
                      this.plugin.settings.baseUrl = v.trim();
                      await save();
                    });
                  return t;
                });
              this.addIcon(urlSetting, "link");
            }),
          row(["temperature"], "Temperature", tr("Креативность ответа: 0.0 = точно, 1.0 = творчески"), (setting) => {
            this.addIcon(
              setting
                .addSlider((s) =>
                  s
                    .setLimits(0, 1, 0.05)
                    .setValue(this.plugin.settings.temperature)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                      this.plugin.settings.temperature = v;
                      await save();
                    }),
                ),
              "thermometer",
            );
          }),
          row([], tr("Проверить соединение"), undefined, (setting) => this.renderProviderTest(this.customContainer(setting)))
        ]
      },
      {
        type: "group", heading: tr("@settings.group.semantic"), icon: "binary", items: [
          row(["semantic.enabled"], tr("Включить semantic-функции"), tr("Semantic-функции работают только после включения. Первый индекс Vault запускается вручную."), (setting) => {
            this.addIcon(
              setting
                .addToggle((toggle) =>
                  toggle.setValue(semantic.enabled).onChange(async (value) => {
                    semantic.enabled = value;
                    this.plugin.getSemanticController().notifySettingsChanged({ reconcile: false });
                    await save();
                    this.plugin.reconcileSemanticSettings();
                  }),
                ),
              "power",
            );
          }),
          { keys: [], name: tr("Автоматическая синхронизация semantic index"), desc: tr("После создания первого индекса изменения Markdown-заметок синхронизируются автоматически. Изменённые chunks могут отправляться выбранному remote embedding-провайдеру; Ollama может генерировать embeddings локально. Vector index остаётся локальным, а Markdown-файлы не изменяются. Несовместимое embedding space требует явного rebuild.") },
          row(["semantic.embeddingProvider"], tr("Embedding-провайдер"), tr("Работает независимо от языковой модели выше."), (setting) => {
            this.addIcon(
              setting
                .addDropdown((dropdown) => {
                  (Object.keys(EMBEDDING_PROVIDER_PROFILES) as EmbeddingProviderId[])
                    .forEach((id) => {
                      const profile = EMBEDDING_PROVIDER_PROFILES[id];
                      dropdown.addOption(id, profile.label);
                    });
                  dropdown
                    .setValue(semantic.embeddingProvider)
                    .onChange(async (value) => {
                      const provider = value as EmbeddingProviderId;
                      const profile = EMBEDDING_PROVIDER_PROFILES[provider];
                      semantic.embeddingProvider = provider;
                      semantic.embeddingBaseUrl = profile.defaultBaseUrl;
                      semantic.embeddingModel = profile.defaultModel;
                      this.plugin.getSemanticController().notifySettingsChanged({ reconcile: false });
                      await save();
                      this.plugin.reconcileSemanticSettings();
                      this.refreshSettings();
                    });
                }),
              "waypoints",
            );
          }),
          row(["semantic.embeddingModel"], tr("Модель embeddings"), semantic.embeddingProvider === "ollama"
            ? tr("Имя embedding-модели как в Ollama.")
            : tr("ID embedding-модели провайдера."), (setting) => {
              this.addIcon(
                setting
                  .addText((text) =>
                    text
                      .setPlaceholder(
                        EMBEDDING_PROVIDER_PROFILES[semantic.embeddingProvider]
                          .defaultModel,
                      )
                      .setValue(semantic.embeddingModel)
                      .onChange(async (value) => {
                        semantic.embeddingModel = value.trim();
                        this.plugin.getSemanticController().notifySettingsChanged({ reconcile: false });
                        await save();
                        this.plugin.reconcileSemanticSettings();
                      }),
                  ),
                "scan-search",
              );
            }),
          row(["semantic.embeddingBaseUrl"], tr("Base URL embeddings"), tr("Базовый HTTP(S) URL без query и fragment. Endpoint будет добавлен автоматически."), (setting) => {
            this.addIcon(
              setting
                .addText((text) =>
                  text
                    .setPlaceholder(
                      EMBEDDING_PROVIDER_PROFILES[semantic.embeddingProvider]
                        .defaultBaseUrl,
                    )
                    .setValue(semantic.embeddingBaseUrl)
                    .onChange(async (value) => {
                      semantic.embeddingBaseUrl = value.trim();
                      this.plugin.getSemanticController().notifySettingsChanged({ reconcile: false });
                      await save();
                      this.plugin.reconcileSemanticSettings();
                    }),
                ),
              "link",
            );
          }),
          {
            ...row(["semantic.openRouterApiKey", "semantic.openAICompatibleApiKey"], tr("API-ключ embeddings"), semantic.embeddingProvider === "openrouter"
              ? tr("Обязателен для OpenRouter. Хранится локально.")
              : tr("Обязателен для OpenAI; у custom API может не требоваться."), (setting) => {
                let apiInput: HTMLInputElement | null = null;
                let visible = false;
                const apiKey = semantic.embeddingProvider === "openrouter" ? semantic.openRouterApiKey : semantic.openAICompatibleApiKey;
                const apiKeySetting = setting
                  .addText((text) => {
                    apiInput = text.inputEl;
                    text.inputEl.type = "password";
                    text.inputEl.setAttribute("autocomplete", "off");
                    return text
                      .setPlaceholder("sk-...")
                      .setValue(apiKey)
                      .onChange(async (value) => {
                        if (semantic.embeddingProvider === "openrouter") {
                          semantic.openRouterApiKey = value.trim();
                        } else {
                          semantic.openAICompatibleApiKey = value.trim();
                        }
                        this.plugin.getSemanticController().notifySettingsChanged({ reconcile: false });
                        await save();
                        this.plugin.reconcileSemanticSettings();
                      });
                  })
                  .addButton((button) =>
                    button
                      .setIcon("eye")
                      .setTooltip(tr("Показать/скрыть"))
                      .onClick(() => {
                        if (!apiInput) return;
                        visible = !visible;
                        apiInput.type = visible ? "text" : "password";
                        button.setIcon(visible ? "eye-off" : "eye");
                      }),
                  );
                this.addIcon(apiKeySetting, "key");
              }), visible: () => semantic.embeddingProvider !== "ollama"
          },
          row([], tr("Проверить embeddings"), undefined, (setting) => this.renderEmbeddingTest(this.customContainer(setting))),
          row([], tr("Управление semantic index"), tr("Первое обновление, Clear и Rebuild запускаются вручную; обычные изменения Markdown затем синхронизируются автоматически."), (setting) => this.renderSemanticIndexControls(this.customContainer(setting)))
        ]
      },
      {
        type: "group", heading: tr("@settings.group.connect"), icon: "server", items: [
          row(["companion.enabled"], tr("Включить Companion"), tr("Опционально передаёт read-only mirror текущего semantic index настроенному Companion endpoint. Первый sync запускается явно."), (setting) => {
            this.addIcon(
              setting
                .addToggle((toggle) => toggle.setValue(companion.enabled).onChange(async (value) => {
                  companion.enabled = value;
                  this.plugin.notifyCompanionSettingsChanged();
                  await save();
                  this.refreshSettings();
                })),
              "power",
            );
          }),
          row(["companion.endpoint"], tr("Companion endpoint"), tr("Локально: http://127.0.0.1:27124. Remote endpoint должен использовать HTTPS."), (setting) => {
            this.addIcon(
              setting
                .addText((text) => text
                  .setPlaceholder(DEFAULT_COMPANION_SETTINGS.endpoint)
                  .setValue(companion.endpoint)
                  .onChange(async (value) => {
                    companion.endpoint = value.trim();
                    this.plugin.notifyCompanionSettingsChanged();
                    await save();
                  })),
              "link",
            );
          }),
          row(["companion.token"], tr("Companion token"), tr("Отдельный Bearer token Companion. Хранится локально в данных плагина и никогда не отправляется AI-провайдерам."), (setting) => {
            this.addIcon(
              setting
                .addText((text) => {
                  text.inputEl.type = "password";
                  text.inputEl.setAttribute("autocomplete", "off");
                  return text.setPlaceholder("••••••••••••").setValue(companion.token).onChange(async (value) => {
                    companion.token = value.trim();
                    this.plugin.notifyCompanionSettingsChanged();
                    await save();
                  });
                }),
              "key",
            );
          }),
          row(["companion.timeoutMs"], tr("@connect.timeout"), tr("@connect.timeout-description"), (setting) => {
            setting.addText((text) => {
              text.inputEl.type = "number"; text.inputEl.min = "500"; text.inputEl.max = "60000"; text.inputEl.step = "100";
              return text.setValue(String(companion.timeoutMs)).onChange(async (value) => {
                const timeout = Number(value);
                if (!Number.isSafeInteger(timeout) || timeout < 500 || timeout > 60_000) return;
                companion.timeoutMs = timeout;
                this.plugin.notifyCompanionSettingsChanged();
                await save();
              });
            });
          }),
          { ...row([], tr("Companion"), tr("Remote Companion получает vault-relative пути, Markdown, chunk text, metadata и embeddings. Используйте только HTTPS и доверенный сервер."), (setting) => { const warning = this.customContainer(setting).createDiv({ cls: "ai-hub-info-card" }); warning.setText(tr("Remote Companion получает vault-relative пути, Markdown, chunk text, metadata и embeddings. Используйте только HTTPS и доверенный сервер.")); }), visible: () => !!companion.endpoint && !isLocalCompanionEndpoint(companion.endpoint) },
          row([], tr("Companion connection"), undefined, (setting) => this.renderCompanionConnection(setting))
        ]
      },
      {
        type: "group", heading: tr("@settings.group.audit"), icon: "microscope", items: [
          row(["deepAudit.batchSize"], tr("Файлов в одном запросе"), `${tr("@settings.audit.description")} ${tr("Рекомендуется 3-7. Больше = быстрее, но риск превышения контекста")}`, (setting) => {
            this.addIcon(
              setting
                .addSlider((s) =>
                  s
                    .setLimits(2, 15, 1)
                    .setValue(this.plugin.settings.deepAudit.batchSize)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                      this.plugin.settings.deepAudit.batchSize = v;
                      await save();
                    }),
                ),
              "layers",
            );
          }),
          row(["deepAudit.maxConcurrent"], tr("Параллельных запросов"), tr("Для бесплатного тира: 1-2. Платный: до 5-6"), (setting) => {
            this.addIcon(
              setting
                .addSlider((s) =>
                  s
                    .setLimits(1, 6, 1)
                    .setValue(this.plugin.settings.deepAudit.maxConcurrent)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                      this.plugin.settings.deepAudit.maxConcurrent = v;
                      await save();
                    }),
                ),
              "zap",
            );
          }),
          row(["deepAudit.delayMs"], tr("Задержка между запросами (мс)"), tr("Увеличьте при ошибках 429 Rate Limit"), (setting) => {
            this.addIcon(
              setting
                .addSlider((s) =>
                  s
                    .setLimits(0, 5000, 250)
                    .setValue(this.plugin.settings.deepAudit.delayMs)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                      this.plugin.settings.deepAudit.delayMs = v;
                      await save();
                    }),
                ),
              "timer",
            );
          })
        ]
      },
      {
        type: "group", heading: tr("@settings.group.output"), icon: "arrow-down-to-line", items: [
          row(["defaultInsertion"], tr("Место вставки по умолчанию"), undefined, (setting) => {
            this.addIcon(
              setting.addDropdown((d) =>
                d
                  .addOption("end", tr("В конец заметки"))
                  .addOption("beginning", tr("В начало заметки"))
                  .addOption("replace", tr("Вместо выделения"))
                  .addOption("after", tr("После выделения"))
                  .addOption("new", tr("В новую заметку"))
                  .addOption("clipboard", tr("В буфер обмена"))
                  .addOption("cursor", tr("В позицию курсора"))
                  .setValue(this.plugin.settings.defaultInsertion)
                  .onChange(async (v) => {
                    this.plugin.settings.defaultInsertion = v as InsertionType;
                    await save();
                  }),
              ),
              "arrow-down-to-line",
            );
          }),
          row(["newNoteFolder"], tr("Папка для новых заметок"), tr("Пусто = корень хранилища"), (setting) => {
            this.addIcon(
              setting
                .addText((t) => {
                  t.inputEl.setAttribute("aria-label", tr("Папка для новых заметок"));
                  return t
                    .setPlaceholder("AI-Responses")
                    .setValue(this.plugin.settings.newNoteFolder)
                    .onChange(async (v) => {
                      this.plugin.settings.newNoteFolder = v.trim();
                      await save();
                    });
                }),
              "folder",
            );
          }),
          row(["mocFolder"], tr("Папка для MOC-заметок"), tr("Куда складывать MOC, сгенерированные из кластеров аудита"), (setting) => {
            this.addIcon(
              setting
                .addText((t) => {
                  t.inputEl.setAttribute("aria-label", tr("Папка для MOC-заметок"));
                  return t
                    .setPlaceholder("MOCs/")
                    .setValue(this.plugin.settings.mocFolder)
                    .onChange(async (v) => {
                      this.plugin.settings.mocFolder = v.trim();
                      await save();
                    });
                }),
              "map",
            );
          }),
          row(["atomsLocation"], tr("Куда складывать атомарные заметки"), tr("Рядом — сохраняет тематический контекст папки оригинала"), (setting) => {
            this.addIcon(
              setting
                .addDropdown((d) =>
                  d
                    .addOption("same", tr("Рядом с оригиналом"))
                    .addOption("folder", tr("В общую папку"))
                    .setValue(this.plugin.settings.atomsLocation)
                    .onChange(async (v) => {
                      this.plugin.settings.atomsLocation = v as "same" | "folder";
                      await save();
                    }),
                ),
              "git-fork",
            );
          }),
          row(["atomsFolder"], tr("Папка для атомарных заметок"), tr("Используется только в режиме «В общую папку»"), (setting) => {
            this.addIcon(
              setting
                .addText((t) => {
                  t.inputEl.setAttribute("aria-label", tr("Папка для атомарных заметок"));
                  return t
                    .setPlaceholder("Atoms/")
                    .setValue(this.plugin.settings.atomsFolder)
                    .onChange(async (v) => {
                      this.plugin.settings.atomsFolder = v.trim();
                      await save();
                    });
                }),
              "atom",
            );
          }),
          { keys: ["filenameTemplate"], name: tr("Шаблон имени файла"), desc: "Переменные: {{date}}, {{time}}, {{topic}}", control: { type: "text", key: "filenameTemplate", placeholder: "AI-{{date}}-{{topic}}" } }
        ]
      },
      {
        type: "group", heading: tr("Интерфейс"), icon: "layout-dashboard", items: [
          row(["language"], tr(tr("Язык интерфейса / Language")), tr(
            tr("Auto — как в Obsidian. Имена команд обновятся после перезагрузки плагина."),
          ), (setting) => {
            setting
              .addDropdown((d) => {
                d.addOption("auto", "Auto")
                  .addOption("en", "English")
                  .addOption("ru", "Русский")
                  .setValue(this.plugin.settings.language ?? "auto")
                  .onChange((v) => {
                    this.plugin.settings.language = v as AIHubLang;
                    setLanguage(v as AIHubLang);
                    void save();
                    this.refreshSettings();
                  });
              });
          }),
          row(["showContextMenu"], tr("Контекстное меню"), tr("Действия Veynrel при правом клике (требует перезагрузки)"), (setting) => {
            this.addIcon(
              setting
                .addToggle((t) =>
                  t
                    .setValue(this.plugin.settings.showContextMenu)
                    .onChange(async (v) => {
                      this.plugin.settings.showContextMenu = v;
                      await save();
                    }),
                ),
              "menu",
            );
          }),
          { keys: ["notifyOnCopy"], name: tr("Уведомление о копировании"), control: { type: "toggle", key: "notifyOnCopy" } }
        ]
      }
    ];
    // Search names/descriptions remain the visible row metadata. Aliases also
    // expose stable English keys and provider choices when the UI is translated.
    const legacyAliases: Record<string, string[]> = {
      cpu: ["Deep Intelligence", "Language model", "LLM", "Языковая модель"],
      binary: ["Semantic Intelligence", "Semantic", "Embeddings"],
      server: ["Veynrel Connect", "Connect", "Companion", "endpoint", "token", "timeout", "MCP"],
      microscope: ["Deep Analysis", "Deep Audit", "Глубокий аудит"],
      "arrow-down-to-line": ["Writing & Output", "MOC", "Atoms", "Insertion", "Вставка ответа"],
    };
    for (const section of sections) for (const item of section.items) {
      item.aliases = [...item.keys, section.heading, ...(legacyAliases[section.icon] ?? [])];
      if (item.keys.includes("provider")) {
        item.aliases.push("OpenAI", "OpenRouter", "Groq", "Ollama", "Custom");
      } else if (item.keys.includes("semantic.embeddingProvider")) {
        item.aliases.push("OpenAI", "OpenRouter", "Ollama", "Custom");
      }
    }
    return sections;
  }

  /** Path B: hosts older than 1.13 use these same rows through the original Setting API. */
  display(): void {
    this.containerEl.empty();
    for (const section of this.getSettingDefinitions()) {
      if (section.heading) this.addHeading(section.heading, section.icon);
      for (const row of section.items) {
        if (row.visible === false || (typeof row.visible === "function" && !row.visible())) continue;
        const setting = new Setting(this.containerEl).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        if (row.render) row.render(setting);
        else if (row.control?.type === "text") {
          const control = row.control;
          setting.addText((text) => {
            text.inputEl.setAttribute("aria-label", row.name);
            return text.setPlaceholder(control.placeholder)
              .setValue(String(this.getControlValue(control.key) ?? ""))
              .onChange((value) => { void this.setControlValue(control.key, value); });
          });
        } else if (row.control?.type === "toggle") {
          const control = row.control;
          setting.addToggle((toggle) => toggle.setValue(Boolean(this.getControlValue(control.key)))
            .onChange((value) => { void this.setControlValue(control.key, value); }));
        }
      }
    }
  }

  getControlValue(key: string): string | boolean | undefined {
    if (key === "filenameTemplate") return this.plugin.settings.filenameTemplate;
    if (key === "notifyOnCopy") return this.plugin.settings.notifyOnCopy;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "filenameTemplate" && typeof value === "string") this.plugin.settings.filenameTemplate = value;
    else if (key === "notifyOnCopy" && typeof value === "boolean") this.plugin.settings.notifyOnCopy = value;
    else throw new Error("Unsupported setting control");
    await this.plugin.saveSettings();
  }

  private refreshSettings(): void {
    if (requireApiVersion("1.13.0") && hasSettingsUpdate(this)) this.update();
    else this.display();
  }

  private customContainer(setting: Setting): HTMLElement {
    setting.settingEl.empty();
    setting.settingEl.addClass("ai-hub-custom-setting");
    return setting.settingEl;
  }

  private renderHero(containerEl: HTMLElement): void {
    // Hero
    const hero = containerEl.createDiv({ cls: "ai-hub-hero" });
    const heroIcon = hero.createDiv({ cls: "ai-hub-hero-icon" });
    setIcon(heroIcon, "brain");
    const heroText = hero.createDiv();
    heroText.createDiv({ text: "Veynrel", cls: "ai-hub-hero-title" });
    heroText.createDiv({
      text: tr("Настройки плагина"),
      cls: "ai-hub-hero-sub",
    });

  }

  // ── Карточки провайдеров ─────────────────────────────────────────────
  private renderProviderCards(
    container: HTMLElement,
    save: () => Promise<void>,
  ) {
    const grid = container.createDiv({ cls: "ai-hub-provider-grid" });

    const providers: LLMProvider[] = [
      "openrouter",
      "ollama",
      "openai",
      "groq",
      "custom",
    ];
    const cards: Map<LLMProvider, HTMLElement> = new Map();

    const setActive = (p: LLMProvider) => {
      cards.forEach((card, id) => {
        card.toggleClass("ai-hub-active", id === p);
      });
    };

    for (const p of providers) {
      const profile = PROVIDER_PROFILES[p];
      const card = grid.createDiv({ cls: "ai-hub-provider-card" });
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", tr("Провайдер: {p}", { p: profile.label }));
      cards.set(p, card);

      const iconWrap = card.createDiv({ cls: "ai-hub-provider-icon" });
      setIcon(iconWrap, profile.icon);

      card.createDiv({ text: tr(profile.label), cls: "ai-hub-provider-name" });
      card.createDiv({
        text: tr(profile.description),
        cls: "ai-hub-provider-desc",
      });

      const onClick = async () => {
        this.plugin.settings.provider = p;
        this.plugin.settings.baseUrl = profile.defaultBaseUrl;
        if (profile.defaultModel) {
          this.plugin.settings.model = profile.defaultModel;
        }
        await save();
        setActive(p);
        this.refreshSettings();
      };

      card.addEventListener("click", () => void onClick());
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onClick();
        }
      });
    }

    setActive(this.plugin.settings.provider);
  }

  private renderProviderInfo(el: HTMLElement): void {
    const provider = this.plugin.settings.provider;
    // ── Инфо-плашка ──────────────────────────────────────────────────
    const infoCard = el.createDiv({ cls: "ai-hub-info-card" });
    const infoTitle = (t: string) =>
      infoCard.createEl("strong", { text: t, cls: "ai-hub-info-title" });
    if (provider === "ollama") {
      infoTitle(tr("Ollama — локальный inference"));
      infoCard.createEl("br");
      infoCard.appendText(tr("Установи Ollama: "));
      infoCard.createEl("code", {
        text: "curl -fsSL https://ollama.com/install.sh | sh",
      });
      infoCard.createEl("br");
      infoCard.appendText(tr("Загрузи модель: "));
      infoCard.createEl("code", { text: "ollama pull llama3.2" });
    } else if (provider === "openrouter") {
      infoTitle(tr("OpenRouter — единый шлюз к 100+ моделям"));
      infoCard.createEl("br");
      infoCard.appendText(tr("API ключ: "));
      infoCard.createEl("a", {
        text: "openrouter.ai/keys",
        href: "https://openrouter.ai/keys",
      });
      infoCard.appendText(tr(" · Бесплатные модели доступны без баланса"));
    } else if (provider === "openai") {
      infoTitle("OpenAI API");
      infoCard.createEl("br");
      infoCard.appendText(tr("API ключ: "));
      infoCard.createEl("a", {
        text: "platform.openai.com/api-keys",
        href: "https://platform.openai.com/api-keys",
      });
    } else if (provider === "groq") {
      infoTitle(tr("Groq — бесплатный быстрый inference"));
      infoCard.createEl("br");
      infoCard.appendText(tr("API ключ: "));
      infoCard.createEl("a", {
        text: "console.groq.com/keys",
        href: "https://console.groq.com/keys",
      });
    } else {
      infoTitle(tr("Custom OpenAI-совместимый API"));
      infoCard.createEl("br");
      infoCard.appendText(
        tr("Укажи Base URL и при необходимости API ключ. Модель — как требует провайдер."),
      );
    }

  }

  private renderModelOptions(el: HTMLElement, save: () => Promise<void>): void {
    const provider = this.plugin.settings.provider;
    const profile = PROVIDER_PROFILES[provider];
    // Популярные модели
    const pickerRow = el.createDiv({ cls: "ai-hub-chip-row" });
    const addChip = (id: string, label: string, tag?: string) => {
      const chip = pickerRow.createEl("button", { cls: "ai-hub-model-chip" });
      chip.createSpan({ text: label });
      if (tag) {
        chip.createSpan({ text: tr(tag), cls: "ai-hub-model-chip-tag" });
      }
      chip.addEventListener("click", () => {
        this.plugin.settings.model = id;
        void save();
        const input = this.containerEl.querySelector<HTMLInputElement>(
          `input[aria-label='${tr(tr("Название модели"))}']`,
        );
        if (input) {
          input.value = id;
        }
      });
    };
    for (const m of profile.popularModels) {
      addChip(m.id, m.label, m.tag);
    }

    // Живой список бесплатных моделей OpenRouter
    if (provider === "openrouter") {
      const freeRow = el.createDiv({ cls: "ai-hub-ollama-row" });
      const freeBtn = freeRow.createEl("button", { cls: "ai-hub-ollama-btn" });
      setIcon(freeBtn.createSpan(), "refresh-cw");
      freeBtn.createSpan({ text: " Показать актуальные бесплатные модели" });
      const freeStatus = freeRow.createDiv({ cls: "ai-hub-ollama-status" });

      freeBtn.addEventListener("click", () => {
        void (async () => {
          freeBtn.setAttribute("disabled", "true");
          freeStatus.setText(tr("Загружаю список с OpenRouter..."));
          try {
            const models = await fetchOpenRouterFreeModels();
            if (models.length === 0) {
              freeStatus.setCssProps({
                "--ai-status-color": "var(--text-warning,orange)",
              });
              freeStatus.setText(tr("⚠ Бесплатные модели не найдены"));
            } else {
              pickerRow.empty();
              for (const m of models) {
                const ctx =
                  m.context >= 1000
                    ? `${Math.round(m.context / 1000)}k`
                    : undefined;
                addChip(m.id, m.name, ctx);
              }
              freeStatus.setCssProps({
                "--ai-status-color": "var(--color-green,#4caf50)",
              });
              freeStatus.setText(
                tr("✓ Бесплатных моделей: {n} — кликни чип, чтобы выбрать", { n: models.length }),
              );
            }
          } catch (e) {
            freeStatus.setCssProps({
              "--ai-status-color": "var(--color-red,#f44336)",
            });
            freeStatus.setText(
              tr("✗ Ошибка: ") + (e instanceof Error ? e.message : String(e)),
            );
          }
          freeBtn.removeAttribute("disabled");
        })();
      });
    }

    // Загрузить модели Ollama
    if (provider === "ollama") {
      const ollamaRow = el.createDiv({ cls: "ai-hub-ollama-row" });
      const ollamaBtn = ollamaRow.createEl("button", {
        cls: "ai-hub-ollama-btn",
      });
      const ollamaIcon = ollamaBtn.createSpan();
      setIcon(ollamaIcon, "refresh-cw");
      ollamaBtn.createSpan({ text: tr("Загрузить доступные модели") });

      const ollamaStatus = ollamaRow.createDiv({ cls: "ai-hub-ollama-status" });

      ollamaBtn.addEventListener("click", () => {
        void (async () => {
          ollamaBtn.setAttribute("disabled", "true");
          ollamaStatus.setText(tr("Загрузка..."));
          try {
            const models = await fetchOllamaModels(this.plugin.settings.baseUrl);
            if (models.length === 0) {
              ollamaStatus.setCssProps({ "--ai-status-color": "var(--text-warning,orange)" });
              ollamaStatus.setText(
                tr("⚠ Ollama не найден или моделей нет. Запусти: ollama pull llama3.2"),
              );
            } else {
              ollamaStatus.setCssProps({ "--ai-status-color": "var(--color-green,#4caf50)" });
              ollamaStatus.setText(tr("✓ Найдено: {list}", { list: models.join(", ") }));
            }
          } catch (e) {
            ollamaStatus.setCssProps({ "--ai-status-color": "var(--color-red,#f44336)" });
            ollamaStatus.setText(
              tr("✗ Ошибка: ") + (e instanceof Error ? e.message : String(e)),
            );
          }
          ollamaBtn.removeAttribute("disabled");
        })();
      });
    }

  }

  private renderProviderTest(el: HTMLElement): void {
    // ── Тест соединения ───────────────────────────────────────────────
    const testRow = el.createDiv({ cls: "ai-hub-test-row" });

    const testBtn = testRow.createEl("button", { cls: "ai-hub-test-btn" });
    const testIcon = testBtn.createSpan();
    setIcon(testIcon, "plug");
    testBtn.createSpan({ text: tr("Проверить соединение") });

    const testStatus = testRow.createDiv({ cls: "ai-hub-conn-status" });

    testBtn.addEventListener("click", () => {
      void (async () => {
        testBtn.setAttribute("disabled", "true");
        testStatus.setCssProps({ "--ai-status-color": "var(--text-muted)" });
        testStatus.setText(tr("Проверяю..."));
        try {
          const result = await testConnection(this.plugin.settings);
          testStatus.setCssProps({ "--ai-status-color": "var(--color-green,#4caf50)" });
          testStatus.setText(result);
        } catch (e) {
          testStatus.setCssProps({ "--ai-status-color": "var(--color-red,#f44336)" });
          testStatus.setText("✗ " + (e instanceof Error ? e.message : String(e)));
        }
        testBtn.removeAttribute("disabled");
      })();
    });
  }

  private renderEmbeddingTest(container: HTMLElement): void {
    const semantic = this.plugin.settings.semantic;
    const testRow = container.createDiv({ cls: "ai-hub-test-row" });
    const testButton = testRow.createEl("button", {
      cls: "ai-hub-test-btn",
    });
    setIcon(testButton.createSpan(), "plug-zap");
    testButton.createSpan({ text: tr("Проверить embeddings") });
    const testStatus = testRow.createDiv({
      cls: "ai-hub-conn-status ai-hub-embedding-status",
    });
    this.embeddingTestButton = testButton;
    this.embeddingTestStatus = testStatus;

    if (this.embeddingTestInFlight) {
      this.setEmbeddingTestButtonBusy(true);
      const snapshot = this.embeddingTestSnapshot;
      this.setEmbeddingTestStatus(
        snapshot
          ? [
            tr("Проверяю embeddings..."),
            tr("Провайдер: {p}", { p: snapshot.provider }),
            tr("Модель: {m}", { m: snapshot.model }),
          ].join("\n")
          : tr("Проверяю embeddings..."),
        "var(--text-muted)",
      );
    }

    testButton.addEventListener("click", () => {
      if (this.embeddingTestInFlight) return;
      void (async () => {
        const requestSettings: EmbeddingSettings = { ...semantic };
        const requestSnapshot = {
          provider:
            EMBEDDING_PROVIDER_PROFILES[requestSettings.embeddingProvider]
              .label,
          model: requestSettings.embeddingModel.trim(),
        };
        this.embeddingTestInFlight = true;
        this.embeddingTestSnapshot = requestSnapshot;
        this.setEmbeddingTestButtonBusy(true);
        this.setEmbeddingTestStatus(
          [
            tr("Проверяю embeddings..."),
            tr("Провайдер: {p}", { p: requestSnapshot.provider }),
            tr("Модель: {m}", { m: requestSnapshot.model }),
          ].join("\n"),
          "var(--text-muted)",
        );
        try {
          const result = await testEmbeddingConnection(requestSettings);
          this.setEmbeddingTestStatus(
            [
              tr("Подключение успешно"),
              tr("Провайдер: {p}", { p: result.provider }),
              tr("Модель: {m}", { m: result.model }),
              tr("Размерность: {n}", { n: result.dimensions }),
            ].join("\n"),
            "var(--color-green,#4caf50)",
          );
        } catch (error) {
          this.setEmbeddingTestStatus(
            [
              tr("Ошибка embeddings: {message}", {
                message:
                  error instanceof Error
                    ? error.message
                    : tr("Неизвестная ошибка"),
              }),
              tr("Провайдер: {p}", { p: requestSnapshot.provider }),
              tr("Модель: {m}", { m: requestSnapshot.model }),
            ].join("\n"),
            "var(--color-red,#f44336)",
          );
        } finally {
          this.embeddingTestInFlight = false;
          this.embeddingTestSnapshot = null;
          this.setEmbeddingTestButtonBusy(false);
        }
      })();
    });

  }

  private renderSemanticIndexControls(container: HTMLElement): void {
    const controller = this.plugin.getSemanticController();
    const status = controller.getSemanticStatus();
    const statusLabels: Record<typeof status.kind, string> = {
      disabled: tr("Выключен"),
      "not-initialized": tr("Не инициализирован"),
      initializing: tr("Инициализация..."),
      ready: tr("Готов"),
      indexing: tr("Индексация..."),
      incompatible: tr("Несовместимый индекс"),
      error: tr("Ошибка"),
    };

    const block = container.createDiv({
      cls: "ai-semantic-index-status",
    });
    block.createDiv({
      cls: "ai-semantic-index-status-title",
      text: tr("Семантический индекс"),
    });
    const details = [
      tr("Статус: {status}", { status: statusLabels[status.kind] }),
      tr("Провайдер: {p}", { p: status.providerLabel }),
      tr("Модель: {m}", { m: status.model }),
    ];
    if (status.kind === "ready" || status.kind === "indexing") {
      details.push(
        tr("Chunks: {n}", { n: status.vectorCount }),
        tr("Generation: {n}", { n: status.vectorGeneration }),
        tr("Размерность: {n}", { n: status.dimensions }),
      );
    }
    block.createDiv({
      cls: "ai-semantic-index-status-details",
      text: details.join("\n"),
    });

    const buttons: ButtonComponent[] = [];
    const registerAction = (
      button: ButtonComponent,
      action: () => Promise<unknown>,
      disabledWhenSemanticOff: boolean,
    ): ButtonComponent => {
      buttons.push(button);
      button.setDisabled(
        semanticControlDisabled({
          runnerBusy: this.semanticActionRunner.busy,
          statusKind: status.kind,
          semanticEnabled: this.plugin.settings.semantic.enabled,
          requiresEnabled: disabledWhenSemanticOff,
        }),
      );
      button.onClick(() => {
        void this.runSemanticControlAction(buttons, action);
      });
      return button;
    };

    const actions = new Setting(container)
      .setName(tr("Управление semantic index"))
      .setDesc(
        tr("Первое обновление, Clear и Rebuild запускаются вручную; обычные изменения Markdown затем синхронизируются автоматически."),
      )
      .addButton((button) =>
        registerAction(
          button
            .setButtonText(tr("Обновить индекс Vault"))
            .setIcon("refresh-cw"),
          () => controller.indexVault(),
          true,
        ),
      )
      .addButton((button) =>
        registerAction(
          button
            .setButtonText(tr("Очистить индекс"))
            .setIcon("trash-2")
            .setWarning(),
          () => controller.clearIndex(),
          true,
        ),
      )
      .addButton((button) =>
        registerAction(
          button
            .setButtonText(tr("Перестроить индекс"))
            .setIcon("rotate-ccw")
            .setWarning(),
          () => controller.rebuildIndex(),
          true,
        ),
      )
      .addButton((button) =>
        registerAction(
          button
            .setButtonText(tr("Обновить статус"))
            .setIcon("database"),
          () => controller.refreshSemanticStatus(),
          false,
        ),
      );
    this.addIcon(actions, "search");
  }

  private renderCompanionConnection(setting: Setting): void {
    const companion = this.plugin.settings.companion;
    const controller = this.plugin.getSemanticController();
    const state = controller.getCompanionStatus();
    const labels = {
      disabled: tr("Выключен"),
      idle: tr("Ожидает sync"),
      syncing: tr("Синхронизация..."),
      ready: tr("Готов"),
      error: tr("Ошибка"),
    };
    const row = setting
      .setName(tr("Companion connection"))
      .setDesc(`${tr("Статус: {status}", { status: labels[state.kind] })}${state.code ? ` (${state.code})` : ""}`)
      .addButton((button) => button
        .setButtonText(tr("Проверить соединение"))
        .setIcon("plug-zap")
        .onClick(() => {
          void controller.testCompanionConnection().finally(() => {
            if (this.containerEl.isConnected) this.refreshSettings();
          });
        }))
      .addButton((button) => button
        .setButtonText(tr("Sync now"))
        .setIcon("refresh-cw")
        .setDisabled(!companion.enabled)
        .onClick(() => {
          void controller.syncCompanionNow().finally(() => {
            if (this.containerEl.isConnected) this.refreshSettings();
          });
        }));
    this.addIcon(row, "server");
  }

  private async runSemanticControlAction(
    buttons: readonly ButtonComponent[],
    action: () => Promise<unknown>,
  ): Promise<void> {
    await this.semanticActionRunner.run({
      buttons,
      action,
      onError: () => {
        new Notice(
          tr(
            "Не удалось выполнить semantic-операцию. Проверьте настройки и повторите.",
          ),
        );
      },
      isContainerConnected: () => this.containerEl.isConnected,
      refresh: () => this.refreshSettings(),
    });
  }

}
