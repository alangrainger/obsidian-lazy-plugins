import { Platform, Plugin, PluginManifest } from 'obsidian'
import {
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_SETTINGS,
  DeviceSettings,
  LazySettings,
  LoadingMethod,
  PluginGroupSettings,
  SettingsTab,
  createDefaultGroups
} from './settings'

const lazyPluginId = require('../manifest.json').id

export default class LazyPlugin extends Plugin {
  data: LazySettings
  settings: DeviceSettings
  device = 'desktop/global'
  manifests: PluginManifest[]
  pendingTimeouts: NodeJS.Timeout[] = []

  /* Plugin manager code
    m = Manager.getInstance()
    m.main = this;
    await m.loadSettings();

    this.manifests.forEach(/* add new plugins to "Auto-Add" group *\/)

    // TODO: merge `PluginGroupSettings` into `SettingsTab`
    Manager.getInstance().updateStatusbarItem();

    m.groupsMap
      .forEach(group => {
        if (m.generateCommands) {
          CommandManager.getInstance().AddEnableDisableCommands(group)
        }
        if (group.loadAtStartup) {
          group.startup()
        }
      });
  */

  async loadGroupSettings() {
    /*
    loadData
    select between mobile and desktop
    */
  }

  async onload() {
    await this.loadSettings()

    // Get the list of installed plugins
    this.manifests = Object.values(this.app.plugins.manifests)
      .filter(plugin =>
        plugin.id !== lazyPluginId &&                  // Filter out the Lazy Loader plugin
        !(Platform.isMobile && plugin.isDesktopOnly))  // Filter out desktop-only plugins from mobile
      // TODO: me - In a separate branch, enable mobile only plugins
      .sort((a, b) => a.name.localeCompare(b.name))

    await this.setInitialPluginsConfiguration()
    this.addSettingTab(new SettingsTab(this.app, this))

    // Iterate over the installed plugins and load them with the specified delay
    this.manifests.forEach(plugin => this.setPluginStartup(plugin.id))
  }

  /**
   * Configure and load a plugin based on its startup settings.
   */
  async setPluginStartup(pluginId: string) {
    const obsidian = this.app.plugins

    const groups = this.getPluginsGroups(pluginId).map(groupId => this.settings?.groups[groupId]).filter(group => group.enablePluginsDuringStartup).sort(group => group.startupDelaySeconds)

    // If there are no groups set to enable during startup, then we
    // disable the plugin and exit
    if (!groups) {
      await obsidian.disablePluginAndSave(pluginId)
      return
    }

    // If the plugin is currently active and is not part of a group that
    // is set to auto-load immediately on startup. Quick disable and then
    // re-enable the plugin so the plugin doesn't load immediately on
    // the next startup. In fact, we only care about the first group duing
    // loading, even though we allow for a plugin to exist in multiple groups
    const loadGroup = groups[0]
    const isEnabled = obsidian.enabledPlugins.has(pluginId)
    const isRunning = obsidian.plugins?.[pluginId]?._loaded
    const currentlyActive = isEnabled && isRunning
    if (loadGroup.startupDelaySeconds == 0) {
      await obsidian.enablePluginAndSave(pluginId)
    } else if (currentlyActive) {
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
  getPluginStartup(pluginId: string): LoadingMethod {
    return this.settings.plugins?.[pluginId]?.startupType ||
      this.settings.defaultStartupType ||
      (this.app.plugins.enabledPlugins.has(pluginId) ? LoadingMethod.instant : LoadingMethod.disabled)
  }

  // TODO: me - Not sure how to map from group to group id
  getPluginsGroups(pluginId: string): string[] {
    this.settings.plugins[pluginId].groupIds = Object.assign([], Object.values(LoadingMethod).filter(v => typeof v == "string"), this.settings.plugins[pluginId].groupIds);
    return this.settings.plugins[pluginId].groupIds
  }

  // This should only be added for new groups
  // TODO: me - This needs to not reference `startup_type` if possible
  // Might need to wait for second cl
  getAutoAddGroups(pluginId: string): string[] {
    this.settings.plugins?.[pluginId]
    var groups = this.settings.groups.filter((id, group) => group.autoAddNewPlugins)
      .map((id: string, group) => id)
    if (!groups) {
      return [this.settings.plugins?.[pluginId]?.startupType ||
        this.settings.defaultStartupType ||
        (this.app.plugins.enabledPlugins.has(pluginId) ? LoadingMethod.instant : LoadingMethod.disabled)]
    }
    return groups
  }

  async loadSettings() {
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

    // TODO: me - Not sure how groups will be saveable
    // This should load in the groups from data.json if already present
    // If not, this creates the default groups based on startup
    // TODO: me - This would need to also have an ability to switch the auto add target
    this.settings.groups = Object.assign({}, createDefaultGroups(this.settings), this.settings.groups)
  }

  async saveSettings() {
    await this.saveData(this.data)
  }

  /**
   * Set the initial config value for all installed plugins. This will also set the value
   * for any new plugin in the future, depending on what default value is chosen in the
   * Settings page.
   */
  async setInitialPluginsConfiguration() {
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
  async updatePluginSettings(pluginId: string, startupType: LoadingMethod) {
    this.settings.plugins[pluginId] = {
      startupType: startupType,
      // TODO: me - Not sure if this will overwrite any assignments made before hand
      groupIds: Object.values(LoadingMethod)
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
