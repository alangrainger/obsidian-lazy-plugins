import { Platform, Plugin, PluginManifest } from 'obsidian'
import {
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_SETTINGS,
  DeviceSettings,
  LazySettings,
  LoadingMethod,
  SettingsTab
} from './settings'

const lazyPluginId = require('../manifest.json').id

export default class LazyPlugin extends Plugin {
  data: LazySettings
  settings: DeviceSettings
  device = 'desktop/global'
  manifests: PluginManifest[]
  pendingTimeouts: NodeJS.Timeout[] = []

  async onload () {
    await this.loadSettings()

    // Get the list of installed plugins
    this.manifests = Object.values(this.app.plugins.manifests)
      .filter(plugin =>
        plugin.id !== lazyPluginId &&                  // Filter out the Lazy Loader plugin
        !(Platform.isMobile && plugin.isDesktopOnly))  // Filter out desktop-only plugins from mobile
      .sort((a, b) => a.name.localeCompare(b.name))

    await this.setInitialPluginsConfiguration()
    this.addSettingTab(new SettingsTab(this.app, this))

    // Iterate over the installed plugins and load them with the specified delay
    this.manifests.forEach(plugin => this.setPluginStartup(plugin.id))
  }

  /**
   * Configure and load a plugin based on its startup settings.
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
        } else if (!isRunning) {
          // Start with a delay
          const seconds = startupType === LoadingMethod.short ? this.settings.shortDelaySeconds : this.settings.longDelaySeconds
          // Add a short additional delay to each plugin, for two purposes:
          // 1. Have them load in a consistent order, which helps them appear in the sidebar in the same order
          // 2. Stagger them slightly so there's not a big slowdown when they all fire at once
          const stagger = isNaN(this.settings.delayBetweenPlugins) ? 40 : this.settings.delayBetweenPlugins
          const delay = this.manifests.findIndex(x => x.id === pluginId) * stagger
          const timeout = setTimeout(async () => {
            if (!obsidian.plugins?.[pluginId]?._loaded) {
              if (this.data.showConsoleLog) {
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

  /**
   * Get the startup type for a given pluginId, falling back to Obsidian's current
   * loading method (enabled/disabled) if no configuration is found for this plugin.
   */
  getPluginStartup (pluginId: string): LoadingMethod {
    return this.settings.plugins?.[pluginId]?.startupType ||
      this.settings.defaultStartupType ||
      (this.app.plugins.enabledPlugins.has(pluginId) ? LoadingMethod.instant : LoadingMethod.disabled)
  }

  async loadSettings () {
    this.data = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    // Object.assign only works 1 level deep, so need to clone the sub-level as well
    this.data.desktop = Object.assign({}, DEFAULT_DEVICE_SETTINGS, this.data.desktop)

    // If user has dual mobile/desktop settings enabled
    if (this.data.dualConfigs && Platform.isMobile) {
      if (!this.data.mobile) {
        // No existing configuration - copy the desktop one
        this.data.mobile = JSON.parse(JSON.stringify(this.data.desktop)) as DeviceSettings
      } else {
        this.data.mobile = Object.assign({}, DEFAULT_DEVICE_SETTINGS, this.data.mobile)
      }
      this.settings = this.data.mobile
      this.device = 'mobile'
    } else {
      this.settings = this.data.desktop
      this.device = 'desktop/global'
    }
  }

  async saveSettings () {
    await this.saveData(this.data)
  }

  /**
   * Set the initial config value for all installed plugins. This will also set the value
   * for any new plugin in the future, depending on what default value is chosen in the
   * Settings page.
   */
  async setInitialPluginsConfiguration () {
    for (const plugin of this.manifests) {
      if (!this.settings.plugins?.[plugin.id]?.startupType) {
        // There is no existing setting for this plugin, so create one
        await this.updatePluginSettings(plugin.id, this.getPluginStartup(plugin.id))
      }
    }
  }

  /**
   * Update an individual plugin's configuration in the settings file
   */
  async updatePluginSettings (pluginId: string, startupType: LoadingMethod) {
    this.settings.plugins[pluginId] = { startupType }
    await this.saveSettings()
  }

  /*
   * Originally this was set up so that when the plugin unloaded, it would enablePluginAndSave()
   * the other plugins based on their Lazy Loader startup config.
   *
   * The problem with that is that the onunload() function is called during plugin *update* also,
   * which means that every time you get an update for this plugin, it would cause:
   *
   * a) A slowdown across the vault for the next 1-2 restarts.
   * b) The possibility of plugins being loaded twice / duplicated.
   *
   * Since across all users, updating the plugin is common, and uninstalling the plugin is less
   * common, I decided to remove this function.
   *
   * I apologise to the people who have to manually re-enable their plugins once they uninstall this one :(
   *
   * --------------------
   *
   * When the Lazy Loader plugin is disabled / deleted from Obsidian, iterate over
   * the configured plugins and re-enable any that are set to be delayed.
   *
   * This will cause a short slowdown as each plugin has to be disabled and then
   * re-enabled to save its new startup state.
   *
  async onunload () {
    // Clear any pending timeouts
    this.pendingTimeouts.forEach(timeout => clearTimeout(timeout))
    // Iterate over the configured plugins
    for (const plugin of this.manifests) {
      const startupType = this.settings.plugins?.[plugin.id]?.startupType
      if (startupType !== LoadingMethod.disabled) {
        await this.app.plugins.disablePlugin(plugin.id)
        await this.app.plugins.enablePluginAndSave(plugin.id)
        console.log(`Set ${plugin.id} back to instant start`)
      }
    }
  } */
}
