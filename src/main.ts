import { Platform, Plugin, PluginManifest } from 'obsidian'
import {
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_SETTINGS,
  DeviceSettings,
  LazySettings,
  LoadingMethod,
  SettingsTab,
  createDefaultPluginGroups
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

    const groups = this.getPluginsGroups(pluginId)
      .map(groupId => this.settings?.groups[groupId])
      .filter(group => group.enablePluginsDuringStartup)
      .sort(group => group.startupDelaySeconds)

    // If there are no groups set to enable during startup, then we
    // disable the plugin and exit
    if (!groups) {
      await obsidian.disablePluginAndSave(pluginId)
      return
    }

    // Otherwise, since we've sorted the list by the startup delay
    // the earliest load binding will be the first in the final list
    // If the delay is 0, we just immediately enable the plugin and return
    const loadGroup = groups[0]
    const isActiveOnStartup = obsidian.enabledPlugins.has(pluginId)
    const isRunning = obsidian.plugins?.[pluginId]?._loaded
    if (loadGroup.startupDelaySeconds == 0) {
      if (!isActiveOnStartup && !isRunning) await obsidian.enablePluginAndSave(pluginId)
      return
    }

    // If the delay isn't 0, we have to handle the case where the plugin
    // was enabled through some other mechanism already (normally when
    // a new plugin was just installed). If we detect this, we quick disable
    // and re-enable the plugin so it doesn't load automatically on the next
    // time. Otherwise, we just need to wait out the startup delay
    if (isActiveOnStartup) {
      await obsidian.disablePluginAndSave(pluginId)
      await obsidian.enablePlugin(pluginId)

    } else if (!isRunning) {
      // Add a short additional delay to each plugin, for two purposes:
      // 1. Have them load in a consistent order, which helps them appear in the sidebar in the same order
      // 2. Stagger them slightly so there's not a big slowdown when they all fire at once
      const stagger = isNaN(this.settings.delayBetweenPlugins) ? 40 : this.settings.delayBetweenPlugins
      const delay = this.manifests.findIndex(x => x.id === pluginId) * stagger
      const timeout = setTimeout(async () => {
        if (!obsidian.plugins?.[pluginId]?._loaded) {
          if (this.data.showConsoleLog) {
            console.log(`Starting ${pluginId} after a ${loadGroup.startupDelaySeconds}s delay`)
          }
          await obsidian.enablePlugin(pluginId)
        }
      }, loadGroup.startupDelaySeconds * 1000 + delay)
      // Store the timeout so we can cancel it later if needed during plugin unload
      this.pendingTimeouts.push(timeout)
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

  getPluginsGroups (pluginId: string): string[] {
    this.settings.plugins[pluginId].groupIds = Object.assign([],
      Object.values(LoadingMethod),
      this.settings.plugins[pluginId].groupIds);
    return this.settings.plugins?.[pluginId]?.groupIds ?? []
  }

  // List out all groups that this plugin should be auto-assigned to
  // This is only called when initializing a plugin's loading settings
  getAutoAddGroups (pluginId: string): string[] {
    // Since we don't have a method for creating custom groups, we can just
    // keep this as assigning the current default option
    return [LoadingMethod[this.getPluginStartup(pluginId)]]
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

    // Plugin groups are stored alongside the normal settings data
    // If an existing configuration isn't found, we construct a default
    // mapping based on the default startup times
    this.settings.groups = Object.assign(
      {}, createDefaultPluginGroups(this.settings), this.settings.groups)
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
        await this.updatePluginSettings(plugin.id)
      }
    }
  }

  /**
   * Update an individual plugin's configuration in the settings file
   */
  async updatePluginSettings (pluginId: string) {
    const startupType = this.getPluginStartup(pluginId)
    this.settings.plugins[pluginId] = {
      startupType: startupType,
      groupIds: [LoadingMethod[startupType]]
    }
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
