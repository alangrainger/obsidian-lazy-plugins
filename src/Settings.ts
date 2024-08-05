import { App, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

const lazyPluginId = require('../manifest.json').id

export interface LazySettings {
  shortDelaySeconds: number;
  longDelaySeconds: number;
  plugins: {
    [key: string]: {
      startupType: LoadingMethod
    }
  };
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

    containerEl.empty()

    new Setting(containerEl)
      .setName('Short delay (seconds)')
      .addText(text => text
        .setValue(this.lazyPlugin.settings.shortDelaySeconds.toString())
        .onChange(async (value) => {
          this.lazyPlugin.settings.shortDelaySeconds = parseFloat(parseFloat(value).toFixed(3))
          await this.lazyPlugin.saveSettings()
        }))
    new Setting(containerEl)
      .setName('Long delay (seconds)')
      .addText(text => text
        .setValue(this.lazyPlugin.settings.longDelaySeconds.toString())
        .onChange(async (value) => {
          this.lazyPlugin.settings.longDelaySeconds = parseFloat(parseFloat(value).toFixed(3))
          await this.lazyPlugin.saveSettings()
        }))

    // Delay settings for each individual plugin
    new Setting(containerEl)
      .setName('Plugin settings')
      .setHeading()

    const pluginSettings = this.lazyPlugin.settings.plugins
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
                pluginSettings[plugin.id] = {
                  startupType: value
                }
                await this.lazyPlugin.saveSettings()
                this.lazyPlugin.setPluginStartup(plugin.id, value).then()
              })
          })
      })
  }
}
