const en = {
  separateConfig: 'Separate desktop/mobile configuration',
  separateConfigDescription: 'Enable this if you want to have different settings depending whether you\'re using a desktop or mobile device. All of the settings below can be configured differently on desktop and mobile. You\'re currently using the {{device}} settings.',
  deviceDesktop: 'desktop/global',
  deviceMobile: 'mobile',
  settingsTitle: 'Lazy Loader settings',
  shortDelay: 'Short delay (seconds)',
  longDelay: 'Long delay (seconds)',
  defaultStartupType: 'Default startup type for new plugins',
  nothingConfigured: 'Nothing configured',
  showDescriptions: 'Show plugin descriptions',
  setAllDelays: 'Set the delay for all plugins at once',
  setAllPluginsTo: 'Set all plugins to be:',
  plugins: 'Plugins',
  filterBy: 'Filter by: ',
  all: 'All',
  filterPlaceholder: 'Type to filter list',
  disabled: '⛔ Disable plugin',
  instant: '⚡ Instant',
  short: '⌚ Short delay',
  long: '💤 Long delay'
}

export type TranslationKey = keyof typeof en

const zh: Record<TranslationKey, string> = {
  deviceDesktop: '桌面端/全局',
  deviceMobile: '移动端',
  separateConfig: '桌面端/移动端独立配置',
  separateConfigDescription: '启用后，可以根据当前使用桌面端还是移动端来应用不同设置。下方所有设置均可在桌面端和移动端分别配置。你当前使用的是「{{device}}」设置。',
  settingsTitle: '延迟加载器设置',
  shortDelay: '短延迟（秒）',
  longDelay: '长延迟（秒）',
  defaultStartupType: '新插件的默认启动方式',
  nothingConfigured: '未设置',
  showDescriptions: '显示插件描述',
  setAllDelays: '一次性设置所有插件的延迟',
  setAllPluginsTo: '将所有插件设置为：',
  plugins: '插件',
  filterBy: '筛选：',
  all: '全部',
  filterPlaceholder: '输入以筛选列表',
  disabled: '⛔ 禁用插件',
  instant: '⚡ 立即启动',
  short: '⌚ 短延迟',
  long: '💤 长延迟'
}

const translations: Record<'en' | 'zh', Record<TranslationKey, string>> = { en, zh }

function getObsidianLanguage (): string {
  // getLanguage() was added in Obsidian 1.8.7, while this plugin supports 1.6.0.
  const obsidian = require('obsidian') as { getLanguage?: () => string }
  const language = obsidian.getLanguage?.()
  if (language) return language

  // Obsidian stores its UI language here; Moment's locale is for dates only.
  try {
    return typeof localStorage === 'undefined' ? 'en' : localStorage.getItem('language') || 'en'
  } catch {
    return 'en'
  }
}

function normalizeLocale (locale: string): 'en' | 'zh' {
  return locale.replace('_', '-').toLowerCase().split('-')[0] === 'zh' ? 'zh' : 'en'
}

export function t (key: TranslationKey, values: Record<string, string> = {}): string {
  const locale = translations[normalizeLocale(getObsidianLanguage())]

  return Object.entries(values)
    .reduce((text, [name, value]) => text.split(`{{${name}}}`).join(value), locale[key])
}
