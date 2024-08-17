import { Platform, Plugin, PluginManifest } from 'obsidian'
import { DEFAULT_SETTINGS, LazySettings, LoadingMethod, SettingsTab } from './settings'

const lazyPluginId = require('../manifest.json').id

export default class LazyPlugin extends Plugin {
  settings: LazySettings
  manifests: PluginManifest[]
  pendingTimeouts: NodeJS.Timeout[] = []

  async onload () {
    await this.loadSettings()

    // Get the list of installed plugins
    this.manifests = Object.values(this.app.plugins.manifests)
      .filter(plugin => plugin.id !== lazyPluginId) // Filter out the Lazy Loader plugin
      .filter(plugin => !(Platform.isMobile && plugin.isDesktopOnly)) // Filter out desktop-only plugins from mobile
      .sort((a, b) => a.name.localeCompare(b.name))

    await this.setInitialPluginsConfiguration()
    this.addSettingTab(new SettingsTab(this.app, this))

    // Iterate over the installed plugins and load them with the specified delay
    this.manifests.forEach(plugin => this.setPluginStartup(plugin.id))
  }

  /**
   * Configure and load a plugin based on its startup settings.
   * This uses Obsidian's enablePluginAndSave() and disablePluginAndSave() functions
   * to save the configuration state for Obsidian's next start.
   */
  async setPluginStartup (pluginId: string) {
    const obsidian = this.app.plugins

    const startupType = this.getPluginStartup(pluginId)
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
        } else {
          // Start with a delay
          const seconds = startupType === LoadingMethod.short ? this.settings.shortDelaySeconds : this.settings.longDelaySeconds
          // Add a short additional delay to each plugin, for two purposes:
          // 1. Have them load in a consistent order, which helps them appear in the sidebar in the same order
          // 2. Stagger them slightly so there's not a big slowdown when they all fire at once
          const delay = this.manifests.findIndex(x => x.id === pluginId) * 40
          const timeout = setTimeout(async () => {
            if (!obsidian.plugins?.[pluginId]?._loaded) {
              if (this.settings.showConsoleLog) {
                console.log(`Starting ${pluginId} after a ${startupType} delay`)
              }
              await obsidian.enablePlugin(pluginId)
            }
          }, seconds * 1000 + delay)
          // Store the timeout so we can cancel it later if needed during plugin unload
          this.pendingTimeouts.push(timeout)
        }
        break
    }
  }

  getPluginStartup (pluginId: string): LoadingMethod {
    let value
    if (Platform.isMobile) value = this.settings.plugins?.[pluginId]?.startupMobile
    return value ||
      this.settings.plugins?.[pluginId]?.startupType ||
      (this.app.plugins.enabledPlugins.has(pluginId) ? LoadingMethod.instant : LoadingMethod.disabled)
  }

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings () {
    await this.saveData(this.settings)
  }

  /**
   * Set the initial config value for all installed plugins.
   * This will also set the value for any new plugin in the future, depending on what default value
   * is chosen in the Settings page.
   */
  async setInitialPluginsConfiguration () {
    for (const plugin of this.manifests) {
      if (!this.settings.plugins?.[plugin.id]?.startupType) {
        // There is no existing setting for this plugin, so create one
        await this.updatePluginSettings(plugin.id,
          this.settings.defaultStartupType ||
          (this.app.plugins.enabledPlugins.has(plugin.id) ? LoadingMethod.instant : LoadingMethod.disabled)
        )
      }
    }
  }

  /**
   * Update an individual plugin's configuration and the settings file
   */
  async updatePluginSettings (pluginId: string, startupType: LoadingMethod) {
    const settings = this.settings.plugins[pluginId] || { startupType }
    if (Platform.isMobile) {
      settings.startupMobile = startupType
    } else {
      settings.startupType = startupType
    }
    this.settings.plugins[pluginId] = settings
    await this.saveSettings()
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
