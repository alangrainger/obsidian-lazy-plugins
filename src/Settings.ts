import { App, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

const lazyPluginId = require('../manifest.json').id

interface PluginSettings {
  startupType: LoadingMethod
}

export interface LazySettings {
  [key: string]: any;

  shortDelaySeconds: number;
  longDelaySeconds: number;
  plugins: { [pluginId: string]: PluginSettings };
  showConsoleLog: boolean;
}

export const DEFAULT_SETTINGS: LazySettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  plugins: {},
  showConsoleLog: false
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

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.lazyPlugin = plugin
  }

  display (): void {
    const { containerEl } = this
    const pluginSettings = this.lazyPlugin.settings.plugins

    containerEl.empty()

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
      .setName('Plugin delay settings')
      .setHeading()

    // Add the delay settings for each installed plugin
    Object.values(this.app.plugins.manifests)
      .sort((a, b) => {
        // Sort alphabetically by the plugin name
        return a.name.localeCompare(b.name)
      })
      .forEach(plugin => {
        if (plugin.id === lazyPluginId) return // Don't set a config for this plugin
        new Setting(containerEl)
          .setName(plugin.name)
          .setDesc(plugin.description)
          .addDropdown(dropdown => {
            // Add the dropdown selection options
            Object.keys(LoadingMethods).forEach(key => {
              dropdown.addOption(key, LoadingMethods[key as LoadingMethod])
            })

            // Get the initial value for the dropdown
            let initialValue = pluginSettings?.[plugin.id]?.startupType
            if (!initialValue || !LoadingMethods[initialValue]) {
              // If there is no setting for this plugin, set the initial value to instant or disabled,
              // depending on its current state
              initialValue = this.app.plugins.enabledPlugins.has(plugin.id) ? LoadingMethod.instant : LoadingMethod.disabled
            }

            dropdown
              .setValue(initialValue)
              .onChange(async (value: LoadingMethod) => {
                // Update the config file, and disable/enable the plugin if needed
                pluginSettings[plugin.id] = { startupType: value }
                await this.lazyPlugin.saveSettings()
                this.lazyPlugin.setPluginStartup(plugin.id, value).then()
              })
          })
      })
  }
}
