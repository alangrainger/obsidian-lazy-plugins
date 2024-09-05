import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

interface PluginSettings {
  startupType: LoadingMethod;
}

// Settings per device (desktop/mobile)
export interface DeviceSettings {
  [key: string]: any;

  shortDelaySeconds: number;
  longDelaySeconds: number;
  delayBetweenPlugins: number;
  defaultStartupType: LoadingMethod | null;
  showDescriptions: boolean;
  plugins: { [pluginId: string]: PluginSettings };
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  delayBetweenPlugins: 40, // milliseconds
  defaultStartupType: null,
  showDescriptions: true,
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

export enum LoadingMethod {
  disabled = 'disabled',
  instant = 'instant',
  short = 'short',
  long = 'long'
}

const LoadingMethods: { [key in LoadingMethod]: string } = {
  disabled: '⛔ Disable plugin',
  instant: '⚡ Instant',
  short: '⌚ Short delay',
  long: '💤 Long delay'
}

export class SettingsTab extends PluginSettingTab {
  app: App
  lazyPlugin: LazyPlugin
  dropdowns: DropdownComponent[] = []
  filter: LoadingMethod | undefined
  containerEl: HTMLElement

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.lazyPlugin = plugin
  }

  async display () {
    const { containerEl } = this
    this.containerEl = containerEl

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
    const pluginSettings = this.lazyPlugin.settings.plugins
    this.containerEl.empty()

    new Setting(this.containerEl)
      .setName('Separate desktop/mobile configuration')
      .setDesc('Enable this if you want to have different settings depending whether you\'re using a desktop or mobile device. ' +
        `All of the settings below can be configured differently on desktop and mobile. You're currently using the ${this.lazyPlugin.device} settings.`)
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
      .setName('Lazy Loader settings')
      .setHeading()

    // Create the two timer settings fields
    Object.entries({
      shortDelaySeconds: 'Short delay (seconds)',
      longDelaySeconds: 'Long delay (seconds)'
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
      .setName('Default startup type for new plugins')
      .addDropdown(dropdown => {
        dropdown.addOption('', 'Nothing configured')
        this.addDelayOptions(dropdown)
        dropdown
          .setValue(this.lazyPlugin.settings.defaultStartupType || '')
          .onChange(async (value: LoadingMethod) => {
            this.lazyPlugin.settings.defaultStartupType = value || null
            await this.lazyPlugin.saveSettings()
          })
      })

    new Setting(this.containerEl)
      .setName('Show plugin descriptions')
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
      .setName('Set the delay for all plugins at once')
      .addDropdown(dropdown => {
        dropdown.addOption('', 'Set all plugins to be:')
        this.addDelayOptions(dropdown)
        dropdown.onChange(async (value: LoadingMethod) => {
          // Update all plugins and save the config, but don't reload the plugins (would slow the UI down)
          this.lazyPlugin.manifests.forEach(plugin => {
            pluginSettings[plugin.id] = { startupType: value }
          })
          // Update all the dropdowns
          this.dropdowns.forEach(dropdown => dropdown.setValue(value))
          dropdown.setValue('')
          await this.lazyPlugin.saveSettings()
        })
      })

    // Add the filter buttons
    new Setting(this.containerEl)
      .setName('Plugins')
      .setHeading()
      .setDesc('Filter by: ')
      .then(setting => {
        this.addFilterButton(setting.descEl, 'All')
        Object.keys(LoadingMethods)
          .forEach(key => this.addFilterButton(setting.descEl, LoadingMethods[key as LoadingMethod], key as LoadingMethod))
      })

    // Add the delay settings for each installed plugin
    this.lazyPlugin.manifests
      .forEach(plugin => {
        const currentValue = this.lazyPlugin.getPluginStartup(plugin.id)

        // Filter the list of plugins if there is a filter specified
        if (this.filter && currentValue !== this.filter) return

        new Setting(this.containerEl)
          .setName(plugin.name)
          .addDropdown(dropdown => {
            this.dropdowns.push(dropdown)
            this.addDelayOptions(dropdown)
            dropdown
              .setValue(currentValue)
              .onChange(async (value: LoadingMethod) => {
                // Update the config file, and disable/enable the plugin if needed
                await this.lazyPlugin.updatePluginSettings(plugin.id, value)
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
        el.addOption(key, LoadingMethods[key as LoadingMethod])
      })
  }

  /**
   * Add a filter button in the header of the plugin list
   */
  addFilterButton (el: HTMLElement, text: string, value?: LoadingMethod) {
    const link = el.createEl('button', { text })
    link.addClass('lazy-plugin-filter')
    link.onclick = () => {
      this.filter = value
      this.buildDom()
    }
  }
}
