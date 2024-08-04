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

    const isActive = plugins.enabledPlugins.has(pluginId)
    switch (startupType) {
      case LoadingMethod.disabled:
        await plugins.disablePluginAndSave(pluginId)
        break
      case LoadingMethod.instant:
        if (!isActive) await plugins.enablePluginAndSave(pluginId)
        break
      case LoadingMethod.short:
      case LoadingMethod.long:
        if (isActive) {
          // Disable and save so that it won't auto-start next time
          await plugins.disablePluginAndSave(pluginId)
          // Immediately re-enable, since the plugin is already active and in-use
          await plugins.enablePlugin(pluginId)
        } else {
          // This is the normal state for a delayed plugin to be in
          await plugins.disablePluginAndSave(pluginId)
          // Start with a delay
          const seconds = startupType === LoadingMethod.short ? this.settings.shortDelaySeconds : this.settings.longDelaySeconds
          setTimeout(async () => {
            console.log(`Starting ${pluginId} after a ${startupType} delay`)
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
