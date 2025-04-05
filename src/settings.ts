import { App, DropdownComponent, PluginSettingTab, Setting } from 'obsidian'
import LazyPlugin from './main'

export enum LoadingMethod {
  disabled = 'disabled',
  instant = 'instant',
  short = 'short',
  long = 'long'
}

// Change to store a nullable groupId. If not set, value is taken from manifest?
export interface PluginSettings {
  startupType?: LoadingMethod;
  loadAfter?: string;
  groupIds?: string[]
}

// TODO: me - Might be better to have id for plugin => group mapping
// As that is more easily supportable for backwards compatability
export interface PluginGroupSettings {
  enablePluginsDuringStartup: boolean;
  generateEnableDisableCommands: boolean;
  startupDelaySeconds: number;
  autoAddNewPlugins: boolean;
  plugins: string[];
}

// Settings per device (desktop/mobile)
export interface DeviceSettings {
  [key: string]: any;

  shortDelaySeconds: number;
  longDelaySeconds: number;
  delayBetweenPlugins: number;
  defaultStartupType: LoadingMethod | null;
  showDescriptions: boolean;
  enableDependencies: boolean;
  plugins: { [pluginId: string]: PluginSettings };
  loadOrder: string[];
  groups: { [groupId: string]: PluginGroupSettings };
}

// Default groups have their values from the device settings
export function createDefaultGroups(device: DeviceSettings): PluginGroupSettings[] {
  return [{
    enablePluginsDuringStartup: true,
    generateEnableDisableCommands: false,
    startupDelaySeconds: 0,
    autoAddNewPlugins: device.defaultStartupType == LoadingMethod.disabled,
    plugins: []
  },{
    enablePluginsDuringStartup: true,
    generateEnableDisableCommands: false,
    startupDelaySeconds: device.shortDelaySeconds,
    autoAddNewPlugins: device.defaultStartupType == LoadingMethod.short,
    plugins: []
  },{
    enablePluginsDuringStartup: true,
    generateEnableDisableCommands: false,
    startupDelaySeconds: device.longDelaySeconds,
    autoAddNewPlugins: device.defaultStartupType == LoadingMethod.long,
    plugins: []
  },{
    enablePluginsDuringStartup: false,
    generateEnableDisableCommands: false,
    startupDelaySeconds: 0,
    autoAddNewPlugins: device.defaultStartupType == LoadingMethod.disabled,
    plugins: []
  }];
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  shortDelaySeconds: 5,
  longDelaySeconds: 15,
  delayBetweenPlugins: 40, // milliseconds
  defaultStartupType: null,
  showDescriptions: true,
  enableDependencies: false,
  plugins: {},
  loadOrder: []
}

// Global settings for the plugin
export interface LazySettings {
  dualConfigs: boolean;
  showConsoleLog: boolean;
  desktop: DeviceSettings;
  mobile?: DeviceSettings;
}

export const DEFAULT_SETTINGS: LazySettings = {
  dualConfigs: false,
  showConsoleLog: false,
  desktop: DEFAULT_DEVICE_SETTINGS,
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
  dropdowns: DropdownComponent[] = []
  filterMethod: LoadingMethod | undefined
  filterString: string | undefined
  containerEl: HTMLElement
  pluginListContainer: HTMLElement
  // groupsListContainer: HTMLElement
  pluginSettings: { [pluginId: string]: PluginSettings } = {}
  // groupSettings: { [groupId: string]: PluginGroupSettings } = {}

  constructor (app: App, plugin: LazyPlugin) {
    super(app, plugin)
    this.app = app
    this.lazyPlugin = plugin
    this.pluginSettings = this.lazyPlugin.settings.plugins
  }

  async display () {
    const { containerEl } = this
    this.containerEl = containerEl

    // Load the settings from disk when the settings modal is displayed.
    // This avoids the issue where someone has synced the settings from another device,
    // but since the plugin has already been loaded, the new settings do not show up.
    await this.lazyPlugin.loadSettings()

    this.buildDom()
  }

  /**
   * Build the Settings modal DOM elements
   */
  buildDom () {
    this.containerEl.empty()

    new Setting(this.containerEl)
      .setName('Separate desktop/mobile configuration')
      .setDesc('Enable this if you want to have different settings depending whether you\'re using a desktop or mobile device. ' +
        `All of the settings below can be configured differently on desktop and mobile. You're currently using the ${this.lazyPlugin.device} settings.`)
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.data.dualConfigs)
          .onChange(async (value) => {
            this.lazyPlugin.data.dualConfigs = value
            await this.lazyPlugin.saveSettings()
            // Refresh the settings to make sure the mobile section is configured
            await this.lazyPlugin.loadSettings()
            this.buildDom()
          })
      })

    new Setting(this.containerEl)
      .setName('Lazy Loader settings')
      .setHeading()

    // Create the two timer settings fields
    Object.entries({
      shortDelaySeconds: 'Short delay (seconds)',
      longDelaySeconds: 'Long delay (seconds)'
    })
      .forEach(([key, name]) => {
        new Setting(this.containerEl)
          .setName(name)
          .addText(text => text
            .setValue(this.lazyPlugin.settings[key].toString())
            .onChange(async (value) => {
              this.lazyPlugin.settings[key] = parseFloat(parseFloat(value).toFixed(3))
              await this.lazyPlugin.saveSettings()
            }))
      })

    new Setting(this.containerEl)
      .setName('Default startup type for new plugins')
      .addDropdown(dropdown => {
        dropdown.addOption('', 'Nothing configured')
        this.addDelayOptions(dropdown)
        dropdown
          .setValue(this.lazyPlugin.settings.defaultStartupType || '')
          .onChange(async (value: LoadingMethod) => {
            this.lazyPlugin.settings.defaultStartupType = value || null
            await this.lazyPlugin.saveSettings()
          })
      })

    new Setting(this.containerEl)
      .setName('Show plugin descriptions')
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.settings.showDescriptions)
          .onChange(async (value) => {
            this.lazyPlugin.settings.showDescriptions = value
            await this.lazyPlugin.saveSettings()
            this.buildDom()
          })
      })

    new Setting(this.containerEl)
      .setName('Enable dependencies')
      .setDesc('Turn this on if you need to have some plugins wait for another plugin to load first')
      .addToggle(toggle => {
        toggle
          .setValue(this.lazyPlugin.settings.enableDependencies)
          .onChange(async (value) => {
            this.lazyPlugin.settings.enableDependencies = value
            await this.lazyPlugin.saveSettings()
            this.buildDom()
          })
      })

    new Setting(this.containerEl)
      .setName('Set the delay for all plugins at once')
      .addDropdown(dropdown => {
        dropdown.addOption('', 'Set all plugins to be:')
        this.addDelayOptions(dropdown)
        dropdown.onChange(async (value: LoadingMethod) => {
          // Update all plugins and save the config, but don't reload the plugins (would slow the UI down)
          this.lazyPlugin.manifests.forEach(plugin => {
            this.pluginSettings[plugin.id] = { startupType: value }
          })
          // Update all the dropdowns
          this.dropdowns.forEach(dropdown => dropdown.setValue(value))
          dropdown.setValue('')
          await this.lazyPlugin.saveSettings()
        })
      })

    // Add the filter buttons
    new Setting(this.containerEl)
      .setName('Plugins')
      .setHeading()
      .setDesc('Filter by: ')
      // Add the buttons to filter by startup method
      .then(setting => {
        this.addFilterButton(setting.descEl, 'All')
        Object.keys(LoadingMethods)
          .forEach(key => this.addFilterButton(setting.descEl, LoadingMethods[key as LoadingMethod], key as LoadingMethod))
      })
    new Setting(this.containerEl)
      // Add a free-text filter
      .addText(text => text
        .setPlaceholder('Type to filter list')
        .onChange(value => {
          this.filterString = value
          this.buildPluginList()
        }))

    // Add an element to contain the plugin list
    this.pluginListContainer = this.containerEl.createEl('div')
    this.buildPluginList()

    // Add an element to contain the groups list
    // This should default to hidden via switch
    // With the "4 group" defaulting to show via switch
    // this.groupsListContainer = this.containerEl.createEl('div')
    // this.buildGroupList()
  }

  // Eventual building point for the UI controls necessary to support
  // groups as a plugin loading mechanism
  buildGroupList() {
    // this.groupsListContainer.textContent = ''
  }

  buildPluginList () {
    this.pluginListContainer.textContent = ''
    // Add the delay settings for each installed plugin
    this.lazyPlugin.manifests
      .forEach(plugin => {
        const currentValue = this.lazyPlugin.getPluginStartup(plugin.id)

        // Filter the list of plugins if there is a filter specified
        if (this.filterMethod && currentValue !== this.filterMethod) return
        if (this.filterString && !plugin.name.toLowerCase().includes(this.filterString.toLowerCase())) return

        new Setting(this.pluginListContainer)
          .setName(plugin.name)
          .addDropdown(dropdown => {
            this.dropdowns.push(dropdown)
            this.addDelayOptions(dropdown)
            dropdown
              .setValue(currentValue)
              .onChange(async (value: LoadingMethod) => {
                // Update the config file, and disable/enable the plugin if needed
                await this.lazyPlugin.updatePluginSettings(plugin.id, value)
                this.lazyPlugin.setPluginStartup(plugin.id).then()
              })
          })
          .then(setting => {
            if (this.lazyPlugin.settings.showDescriptions) {
              // Show or hide the plugin description depending on the user's choice
              setting.setDesc(plugin.description)
            }
            if (this.lazyPlugin.settings.enableDependencies) {
              // Plugin dependencies
              setting.addDropdown(dropdown => {
                dropdown.addOption('', 'Load after:')
                this.lazyPlugin.manifests
                  .filter(x => x.id !== plugin.id && this.pluginSettings?.[x.id]?.startupType !== LoadingMethod.disabled)
                  .forEach(x => dropdown.addOption(x.id, x.name))

                dropdown
                  .setValue(this.pluginSettings?.[plugin.id]?.loadAfter || '')
                  .onChange(async (value: LoadingMethod) => {
                    // Update the config file, and disable/enable the plugin if needed
                    await this.lazyPlugin.updatePluginSettings(plugin.id, value)
                    await this.saveLoadOrder()
                  })
              })
            }
          })
      })
  }

  /**
   * Add the dropdown select options for each delay type
   */
  addDelayOptions (el: DropdownComponent) {
    Object.keys(LoadingMethods)
      .forEach(key => {
        el.addOption(key, LoadingMethods[key as LoadingMethod])
      })
  }

  /**
   * Add a filter button in the header of the plugin list
   */
  addFilterButton (el: HTMLElement, text: string, value?: LoadingMethod) {
    const link = el.createEl('button', { text })
    link.addClass('lazy-plugin-filter')
    link.onclick = () => {
      this.filterMethod = value
      this.buildPluginList()
    }
  }

  /**
   * For people who have dependencies set, this creates a plugin load order taking those dependencies into account.
   */
  async saveLoadOrder () {
    const plugins = this.lazyPlugin.settings.plugins

    // Get the list of all plugin IDs, and order them into their basic groups
    const toProcess = [
      ...Object.keys(plugins).filter(id => plugins[id].startupType === LoadingMethod.instant),
      ...Object.keys(plugins).filter(id => plugins[id].startupType === LoadingMethod.short),
      ...Object.keys(plugins).filter(id => plugins[id].startupType === LoadingMethod.long)
    ]
    const total = toProcess.length
    let count = 0

    const loadOrder: string[] = []
    while (toProcess.length && count < total + 10) {
      const id = toProcess.shift()
      if (!id) break

      // Check if this plugin is dependent on another
      if (
        plugins[id].loadAfter && // If this plugin has a parent specified
        !loadOrder.find(x => x === plugins[id].loadAfter) && // And the parent is not yet in the load order
        plugins?.[plugins[id].loadAfter || '']?.startupType !== LoadingMethod.disabled // And the parent is not disabled
      ) {
        // The parent plugin is not yet in the load order, move it to the back of the queue to process again
        toProcess.push(id)
      } else {
        loadOrder.push(id)
      }
      // Break if we loop too many times, to protect from people who put two plugins as dependencies of each other
      count++
    }
    this.lazyPlugin.settings.loadOrder = loadOrder
    await this.lazyPlugin.saveSettings()
  }
}
