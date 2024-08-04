import { App, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

export interface LazySettings {
  shortDelaySeconds: number;
  longDelaySeconds: number;
  plugins: {
    [key: string]: {
      startupType: LoadingMethod
    }
  }
}

export const DEFAULT_SETTINGS: LazySettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  plugins: {}
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
  plugin: LazyPlugin

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.plugin = plugin
  }

  display (): void {
    const { containerEl } = this

    containerEl.empty()

    new Setting(containerEl)
      .setName('Short delay (seconds)')
      .addText(text => text
        .setValue(this.plugin.settings.shortDelaySeconds.toString())
        .onChange(async (value) => {
          this.plugin.settings.shortDelaySeconds = parseInt(value, 10)
          await this.plugin.saveSettings()
        }))
    new Setting(containerEl)
      .setName('Long delay (seconds)')
      .addText(text => text
        .setValue(this.plugin.settings.longDelaySeconds.toString())
        .onChange(async (value) => {
          this.plugin.settings.longDelaySeconds = parseInt(value, 10)
          await this.plugin.saveSettings()
        }))

    // Delay settings for each individual plugin
    new Setting(containerEl)
      .setName('Plugin settings')
      .setHeading()
    const pluginSettings = this.plugin.settings.plugins
    Object.values(this.app.plugins.manifests)
      .sort((a, b) => {
        // Sort alphabetically by the plugin name
        return a.name.localeCompare(b.name)
      })
      .forEach(plugin => {
        if (plugin.id === 'lazy-plugins') return // Can't set the config for this plugin
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
            if (!initialValue || !LoadingMethods[initialValue as LoadingMethod]) {
              initialValue = this.app.plugins.enabledPlugins.has(plugin.id) ? LoadingMethod.instant : LoadingMethod.disabled
            }

            dropdown
              .setValue(initialValue)
              .onChange(async value => {
                pluginSettings[plugin.id] = { startupType: value as LoadingMethod }
                await this.plugin.saveSettings()
                this.plugin.setPluginStartup(plugin.id, value as LoadingMethod).then()
              })
          })
      })
  }
}
