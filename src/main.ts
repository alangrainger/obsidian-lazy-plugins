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
    const obsidian = this.app.plugins
    const plugin = obsidian.manifests[pluginId]
    if (!plugin) return

    const isActiveOnStartup = obsidian.enabledPlugins.has(pluginId)
    const isRunning = obsidian.plugins?.[pluginId]?._loaded

    switch (startupType) {
      // For disabled plugins
      case LoadingMethod.disabled:
        await obsidian.disablePluginAndSave(pluginId)
        break
      // For instant-start plugins
      case LoadingMethod.instant:
        if (!isActiveOnStartup && !isRunning) await obsidian.enablePluginAndSave(pluginId)
        break
      // For plugins with a delay
      case LoadingMethod.short:
      case LoadingMethod.long:
        if (isActiveOnStartup) {
          // Disable and save so that it won't auto-start next time
          await obsidian.disablePluginAndSave(pluginId)
          // Immediately re-enable, since the plugin is already active and in-use
          await obsidian.enablePlugin(pluginId)
        } else if (!isRunning) {
          // Start with a delay
          const seconds = startupType === LoadingMethod.short ? this.settings.shortDelaySeconds : this.settings.longDelaySeconds
          setTimeout(async () => {
            if (this.settings.showConsoleLog) console.log(`Starting ${pluginId} after a ${startupType} delay`)
            await obsidian.enablePlugin(pluginId)
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
