import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, LazySettings, LoadingMethod, SettingsTab } from './Settings'

export default class LazyPlugin extends Plugin {
  settings: LazySettings
  pendingTimeouts: NodeJS.Timeout[] = []

  async onload () {
    await this.loadSettings()
    this.addSettingTab(new SettingsTab(this.app, this))

    // Iterate over the installed plugins and load them with the specified delay
    Object.entries(this.settings.plugins)
      .forEach(([pluginId, data]) => {
        this.setPluginStartup(pluginId, data.startupType)
      })
  }

  /**
   * Configure and load a plugin based on its startup settings
   * @param pluginId
   * @param startupType
   */
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
          const timeout = setTimeout(async () => {
            if (this.settings.showConsoleLog) {
              console.log(`Starting ${pluginId} after a ${startupType} delay`)
            }
            await obsidian.enablePlugin(pluginId)
          }, seconds * 1000 + Math.random() * 200)
          // Store the timeout so we can cancel it later if needed during plugin unload
          this.pendingTimeouts.push(timeout)
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

  /**
   * When the Lazy Loader plugin is disabled / deleted from Obsidian, iterate over
   * the configured plugins and re-enable any that are set to be delayed.
   *
   * This will cause a short slowdown as each plugin has to be disabled and then
   * re-enabled to save its new startup state.
   */
  async onunload () {
    // Clear any pending timeouts
    this.pendingTimeouts.forEach(timeout => clearTimeout(timeout))
    // Iterate over the configured plugins
    for (const [pluginId, data] of Object.entries(this.settings.plugins)) {
      if (data.startupType === LoadingMethod.short || data.startupType === LoadingMethod.long) {
        await this.app.plugins.disablePlugin(pluginId)
        await this.app.plugins.enablePluginAndSave(pluginId)
        console.log(`Set ${pluginId} back to instant start`)
      }
    }
  }
}
