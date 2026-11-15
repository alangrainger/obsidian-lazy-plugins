import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'
import { t, TranslationKey } from './i18n'

export enum LoadingMethod {
  disabled = 'disabled',
  instant = 'instant',
  short = 'short',
  long = 'long'
}

export interface PluginSettings {
  startupType?: LoadingMethod;
}

// Settings per device (desktop/mobile)
export interface DeviceSettings {
  shortDelaySeconds: number;
  longDelaySeconds: number;
  delayBetweenPlugins: number;
  defaultStartupType: LoadingMethod | null;
  showDescriptions: boolean;
  enableDependencies: boolean;
  plugins: { [pluginId: string]: PluginSettings };

  [key: string]: any;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  delayBetweenPlugins: 40, // milliseconds
  defaultStartupType: null,
  showDescriptions: true,
  enableDependencies: false,
  plugins: {}
}

// Global settings for the plugin
export interface LazySettings {
  dualConfigs: boolean;
  showConsoleLog: boolean;
  desktop: DeviceSettings;
  mobile?: DeviceSettings;
}

export const DEFAULT_SETTINGS: LazySettings = {
  dualConfigs: false,
  showConsoleLog: false,
  desktop: DEFAULT_DEVICE_SETTINGS
}

const LoadingMethods: { [key in LoadingMethod]: TranslationKey } = {
  disabled: 'disabled',
  instant: 'instant',
  short: 'short',
  long: 'long'
}

export class SettingsTab extends PluginSettingTab {
  app: App
  lazyPlugin: LazyPlugin
  dropdowns: DropdownComponent[] = []
  filterMethod: LoadingMethod | undefined
  filterString: string | undefined
  containerEl!: HTMLElement
  pluginListContainer!: HTMLElement
  pluginSettings: { [pluginId: string]: PluginSettings } = {}

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.lazyPlugin = plugin
    this.pluginSettings = this.lazyPlugin.settings.plugins
  }

  async display () {
    const { containerEl } = this
    this.containerEl = containerEl

    // Update the list of installed plugins
    this.lazyPlugin.updateManifests()

    // Load the settings from disk when the settings modal is displayed.
    // This avoids the issue where someone has synced the settings from another device,
    // but since the plugin has already been loaded, the new settings do not show up.
    await this.lazyPlugin.loadSettings()

    this.buildDom()
  }

  /**
   * Build the Settings modal DOM elements
   */
  buildDom () {
    this.containerEl.empty()

    new Setting(this.containerEl)
      .setName(t('separateConfig'))
      .setDesc(t('separateConfigDescription', {
        device: t(this.lazyPlugin.device === 'mobile' ? 'deviceMobile' : 'deviceDesktop')
      }))
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.data.dualConfigs)
          .onChange(async (value) => {
            this.lazyPlugin.data.dualConfigs = value
            await this.lazyPlugin.saveSettings()
            // Refresh the settings to make sure the mobile section is configured
            await this.lazyPlugin.loadSettings()
            this.buildDom()
          })
      })

    new Setting(this.containerEl)
      .setName(t('settingsTitle'))
      .setHeading()

    // Create the two timer settings fields
    Object.entries({
      shortDelaySeconds: t('shortDelay'),
      longDelaySeconds: t('longDelay')
    })
      .forEach(([key, name]) => {
        new Setting(this.containerEl)
          .setName(name)
          .addText(text => text
            .setValue(this.lazyPlugin.settings[key].toString())
            .onChange(async (value) => {
              this.lazyPlugin.settings[key] = parseFloat(parseFloat(value).toFixed(3))
              await this.lazyPlugin.saveSettings()
            }))
      })

    new Setting(this.containerEl)
      .setName(t('defaultStartupType'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('nothingConfigured'))
        this.addDelayOptions(dropdown)
        dropdown
          .setValue(this.lazyPlugin.settings.defaultStartupType || '')
          .onChange(async (value) => {
            this.lazyPlugin.settings.defaultStartupType = (value as LoadingMethod) || null
            await this.lazyPlugin.saveSettings()
          })
      })

    new Setting(this.containerEl)
      .setName(t('showDescriptions'))
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.settings.showDescriptions)
          .onChange(async (value) => {
            this.lazyPlugin.settings.showDescriptions = value
            await this.lazyPlugin.saveSettings()
            this.buildDom()
          })
      })

    new Setting(this.containerEl)
      .setName(t('setAllDelays'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('setAllPluginsTo'))
        this.addDelayOptions(dropdown)
        dropdown.onChange(async (value) => {
          const startupType = value as LoadingMethod
          // Update all plugins and save the config, but don't reload the plugins (would slow the UI down)
          this.lazyPlugin.manifests.forEach(plugin => {
            this.pluginSettings[plugin.id] = { startupType }
          })
          // Update all the dropdowns
          this.dropdowns.forEach(dropdown => dropdown.setValue(value))
          dropdown.setValue('')
          await this.lazyPlugin.saveSettings()
        })
      })

    // Add the filter buttons
    new Setting(this.containerEl)
      .setName(t('plugins'))
      .setHeading()
      .setDesc(t('filterBy'))
      // Add the buttons to filter by startup method
      .then(setting => {
        this.addFilterButton(setting.descEl, t('all'))
        Object.keys(LoadingMethods)
          .forEach(key => this.addFilterButton(setting.descEl, t(LoadingMethods[key as LoadingMethod]), key as LoadingMethod))
      })
    new Setting(this.containerEl)
      // Add a free-text filter
      .addText(text => text
        .setPlaceholder(t('filterPlaceholder'))
        .onChange(value => {
          this.filterString = value
          this.buildPluginList()
        }))

    // Add an element to contain the plugin list
    this.pluginListContainer = this.containerEl.createEl('div')
    this.buildPluginList()
  }

  buildPluginList () {
    this.pluginListContainer.textContent = ''
    // Add the delay settings for each installed plugin
    this.lazyPlugin.manifests
      .forEach(plugin => {
        const currentValue = this.lazyPlugin.getPluginStartup(plugin.id)

        // Filter the list of plugins if there is a filter specified
        if (this.filterMethod && currentValue !== this.filterMethod) return
        if (this.filterString && !plugin.name.toLowerCase().includes(this.filterString.toLowerCase())) return

        new Setting(this.pluginListContainer)
          .setName(plugin.name)
          .addDropdown(dropdown => {
            this.dropdowns.push(dropdown)
            this.addDelayOptions(dropdown)
            dropdown
              .setValue(currentValue)
              .onChange(async (value) => {
                // Update the config file, and disable/enable the plugin if needed
                await this.lazyPlugin.updatePluginSettings(plugin.id, value as LoadingMethod)
                this.lazyPlugin.setPluginStartup(plugin.id).then()
              })
          })
          .then(setting => {
            if (this.lazyPlugin.settings.showDescriptions) {
              // Show or hide the plugin description depending on the user's choice
              setting.setDesc(plugin.description)
            }
          })
      })
  }

  /**
   * Add the dropdown select options for each delay type
   */
  addDelayOptions (el: DropdownComponent) {
    Object.keys(LoadingMethods)
      .forEach(key => {
        el.addOption(key, t(LoadingMethods[key as LoadingMethod]))
      })
  }

  /**
   * Add a filter button in the header of the plugin list
   */
  addFilterButton (el: HTMLElement, text: string, value?: LoadingMethod) {
    const link = el.createEl('button', { text })
    link.addClass('lazy-plugin-filter')
    link.onclick = () => {
      this.filterMethod = value
      this.buildPluginList()
    }
  }
}
