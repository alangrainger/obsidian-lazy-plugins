const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(obsidian, storage) {
  const source = fs.readFileSync(path.join(__dirname, '../src/i18n.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => { assert.equal(name, 'obsidian'); return obsidian; },
    ...(storage === undefined ? {} : { localStorage: storage }),
  });
  return exports;
}

function momentMustNotBeRead() {
  throw new Error('Date locale must never select UI translations');
}

for (const [language, expected] of [
  ['en', 'Lazy Loader settings'], ['en-US', 'Lazy Loader settings'],
  ['zh', '延迟加载器设置'], ['ZH_CN', '延迟加载器设置'],
  ['zh-TW', '延迟加载器设置'], ['fr', 'Lazy Loader settings'],
]) {
  test(`UI API takes precedence for ${language}`, () => {
    const { t } = load({ getLanguage: () => language, moment: { locale: momentMustNotBeRead } }, {
      getItem: () => { throw new Error('API should take precedence'); },
    });
    assert.equal(t('settingsTitle'), expected);
  });
  test(`old app uses stored UI language ${language}`, () => {
    const { t } = load({ moment: { locale: momentMustNotBeRead } }, {
      getItem: (key) => { assert.equal(key, 'language'); return language; },
    });
    assert.equal(t('settingsTitle'), expected);
  });
}

for (const [name, storage] of [
  ['missing', undefined], ['empty', { getItem: () => null }],
  ['unavailable', { getItem: () => { throw new Error('Storage denied'); } }],
]) {
  test(`old app defaults to English with ${name} storage`, () => {
    const { t } = load({ moment: { locale: momentMustNotBeRead } }, storage);
    assert.equal(t('settingsTitle'), 'Lazy Loader settings');
  });
}

test('translations follow the UI language when date locale changes independently', () => {
  let language = 'zh';
  let dateLocale = 'en';
  const { t } = load({ getLanguage: () => language, moment: { locale: () => dateLocale } });
  assert.equal(t('settingsTitle'), '延迟加载器设置');
  dateLocale = 'zh-cn';
  language = 'en';
  assert.equal(t('settingsTitle'), 'Lazy Loader settings');
});

test('device placeholders remain interpolated in English and Chinese', () => {
  for (const language of ['en', 'zh']) {
    const { t } = load({ getLanguage: () => language });
    const device = t('deviceDesktop');
    const description = t('separateConfigDescription', { device });
    assert.ok(description.includes(device));
    assert.ok(!description.includes('{{device}}'));
  }
});
