import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

interface PluginSettings {
  startupType: LoadingMethod;
}

export interface DeviceSettings {
  [key: string]: any;

  shortDelaySeconds: number;
  longDelaySeconds: number;
  defaultStartupType: LoadingMethod | null;
  plugins: { [pluginId: string]: PluginSettings };
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  defaultStartupType: null,
  plugins: {}
}

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

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.lazyPlugin = plugin
  }

  display (): void {
    const { containerEl } = this
    const pluginSettings = this.lazyPlugin.settings.plugins

    containerEl.empty()

    new Setting(containerEl)
      .setName('Separate desktop/mobile configuration')
      .setDesc('Enable this if you want to have different settings depending whether you\'re using a desktop or mobile device. ' +
        'All of the settings below can be configured differently on desktop and mobile.')
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.data.dualConfigs)
          .onChange(async (value) => {
            this.lazyPlugin.data.dualConfigs = value
            await this.lazyPlugin.saveSettings()
            // Refresh the settings to make sure the mobile section is configured
            await this.lazyPlugin.loadSettings()
          })
      })

    new Setting(containerEl)
      .setName('Global plugin delay settings')
      .setHeading()

    // Create the two timer settings fields
    Object.entries({
      shortDelaySeconds: 'Short delay (seconds)',
      longDelaySeconds: 'Long delay (seconds)'
    })
      .forEach(([key, name]) => {
        new Setting(containerEl)
          .setName(name)
          .addText(text => text
            .setValue(this.lazyPlugin.settings[key].toString())
            .onChange(async (value) => {
              this.lazyPlugin.settings[key] = parseFloat(parseFloat(value).toFixed(3))
              await this.lazyPlugin.saveSettings()
            }))
      })

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName('Individual plugin delay settings')
      .setHeading()

    new Setting(containerEl)
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
    // Add the delay settings for each installed plugin
    this.lazyPlugin.manifests
      .forEach(plugin => {
        new Setting(containerEl)
          .setName(plugin.name)
          .setDesc(plugin.description)
          .addDropdown(dropdown => {
            this.dropdowns.push(dropdown)
            this.addDelayOptions(dropdown)

            dropdown
              .setValue(this.lazyPlugin.getPluginStartup(plugin.id))
              .onChange(async (value: LoadingMethod) => {
                // Update the config file, and disable/enable the plugin if needed
                await this.lazyPlugin.updatePluginSettings(plugin.id, value)
                this.lazyPlugin.setPluginStartup(plugin.id).then()
              })
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
}
