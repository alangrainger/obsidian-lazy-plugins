import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, LazySettings, LoadingMethod, SettingsTab } from './Settings'

export default class LazyPlugin extends Plugin {
  settings: LazySettings

  async onload () {
    await this.loadSettings()
    this.addSettingTab(new SettingsTab(this.app, this))

    // Iterate over the installed plugins and load them with the specified delay
    Object.entries(this.settings.plugins)
      .forEach(([pluginId, data]) => {
        this.setPluginStartup(pluginId, data.startupType)
      })
  }

  async setPluginStartup (pluginId: string, startupType: LoadingMethod) {
    const plugins = this.app.plugins
    const plugin = plugins.manifests[pluginId]
    if (!plugin) return

    const isActiveOnStartup = plugins.enabledPlugins.has(pluginId)
    const isRunning = !!this.app.plugins.plugins?.[pluginId]?._loaded

    switch (startupType) {
      // For disabled plugins
      case LoadingMethod.disabled:
        await plugins.disablePluginAndSave(pluginId)
        break
      // For instant-start plugins
      case LoadingMethod.instant:
        if (!isActiveOnStartup && !isRunning) await plugins.enablePluginAndSave(pluginId)
        break
      // For plugins with a delay
      case LoadingMethod.short:
      case LoadingMethod.long:
        if (isActiveOnStartup) {
          // Disable and save so that it won't auto-start next time
          await plugins.disablePluginAndSave(pluginId)
          // Immediately re-enable, since the plugin is already active and in-use
          await plugins.enablePlugin(pluginId)
        } else if (!isRunning) {
          // Start with a delay
          const seconds = startupType === LoadingMethod.short ? this.settings.shortDelaySeconds : this.settings.longDelaySeconds
          setTimeout(async () => {
            if (this.settings.showConsoleLog) console.log(`Starting ${pluginId} after a ${startupType} delay`)
            await plugins.enablePlugin(pluginId)
          }, seconds * 1000)
        }
        break
    }
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }
}
