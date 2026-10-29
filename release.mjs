#!/usr/bin/env node
/**
 * Release one bundle from this Git repository: validate it, pin its current
 * commit into the market index, and commit the index.
 *
 *   node release.mjs packages/dsh-voice-broadcast        # prepare the index
 *   node release.mjs packages/dsh-voice-broadcast --push # also `git push`
 *
 * The index must reference a commit that is already pushed, so the order is:
 * edit code -> commit code -> run this script -> push.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = path.join(HERE, 'market', 'index.json')
const CONFIG_PATH = path.join(HERE, 'shop.config.json')

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/
const ICON_MAX_BYTES = 256 * 1024

const problems = []
const warnings = []
const fail = (message) => problems.push(message)
const warn = (message) => warnings.push(message)

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const hasCjk = (value) => typeof value === 'string' && /[\u3400-\u9fff]/.test(value)
const git = (args) => execSync(`git ${args}`, { cwd: HERE, encoding: 'utf8' }).trim()

/* ---------------------------------------------------------------- bundle */

function checkBundle(dir) {
  const manifestPath = path.join(dir, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    fail(`no package.json in ${dir}`)
    return null
  }
  const pkg = readJson(manifestPath)

  if (!pkg.name || !NPM_NAME.test(pkg.name) || pkg.name.length > 214) fail('name must be a valid package name')
  if (!pkg.version || !SEMVER.test(pkg.version)) fail('version must be an exact SemVer version')
  if (pkg.name && pkg.name.startsWith('@local/')) fail('@local/ cannot be installed from Git; use your own scope such as @yourname/dsh-voice-broadcast')

  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
  if (!patch) fail('package.json needs dsh.bundle.patch')
  else if (!fs.existsSync(path.join(dir, patch))) fail(`dsh.bundle.patch points at a missing file: ${patch}`)

  const client = pkg.dsh && pkg.dsh.client
  if (client && client.platform !== 'web') fail('dsh.client.platform must be "web"')
  if (client && !pkg.exports['./client']) fail('a client bundle needs the "./client" export')

  if (!pkg.engines || typeof pkg.engines.dsh !== 'string') {
    fail('engines.dsh is required: the market refuses versions without a DSH range')
  } else if (pkg.engines.dsh.startsWith('workspace:')) {
    fail('engines.dsh must not be a workspace: range')
  }

  const files = Array.isArray(pkg.files) ? pkg.files.map((name) => name.replace(/^\.\//, '')) : []
  for (const needed of [patch, 'index.js', client ? 'client.js' : null, 'locale/*.json', 'icon.svg'].filter(Boolean)) {
    if (!files.includes(needed.replace(/^\.\//, ''))) warn(`files[] does not list ${needed}; packed installs would omit it`)
  }

  const localeEn = path.join(dir, 'locale', 'en.json')
  if (!fs.existsSync(localeEn)) fail('locale/en.json is required for the plugin card')
  else {
    const meta = readJson(localeEn).meta || {}
    if (!meta.title) fail('locale/en.json meta.title is required')
    if (!meta.description) fail('locale/en.json meta.description is required')
  }
  if (!fs.existsSync(path.join(dir, 'locale', 'zh.json'))) warn('locale/zh.json missing; Chinese users see English card text')

  const icon = path.join(dir, 'icon.svg')
  if (!fs.existsSync(icon)) fail('icon.svg is required')
  else if (fs.statSync(icon).size > ICON_MAX_BYTES) fail('icon.svg exceeds 256 KiB')

  if (patch && fs.existsSync(path.join(dir, patch))) {
    const patchName = (fs.readFileSync(path.join(dir, patch), 'utf8').match(/name:\s*'?"?([^'"\r\n]+?)'?"?\s*$/m) || [])[1]
    if (patchName && patchName !== pkg.name) fail(`cordis.patch.yml inserts "${patchName}" but package.json is "${pkg.name}"`)
  }
  const clientFile = path.join(dir, 'client.js')
  if (client && fs.existsSync(clientFile)) {
    const loaderId = (fs.readFileSync(clientFile, 'utf8').match(/__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/) || [])[1]
    if (loaderId && loaderId !== pkg.name) fail(`client.js registers as "${loaderId}" but package.json is "${pkg.name}"`)
  }

  return pkg
}

/* ------------------------------------------------------------------ main */

function main() {
  const args = process.argv.slice(2)
  const push = args.includes('--push')
  const dirArg = args.find((arg) => !arg.startsWith('--')) || 'packages'
  const shop = readJson(CONFIG_PATH)

  if (/REPLACE-ME/.test(shop.repo)) {
    fail('shop.config.json still says REPLACE-ME: put your GitHub repository URL there first')
    report()
    return
  }
  if (!/^https:\/\/[^/]+\/.+/.test(shop.repo)) fail('shop.config.json repo must be an https GitHub URL')

  const dir = path.resolve(HERE, dirArg)
  const pkg = checkBundle(dir)
  if (!pkg || problems.length) {
    report()
    return
  }

  const relative = path.relative(HERE, dir).split(path.sep).join('/')
  if (!relative.split('/').every((segment) => PATH_SEGMENT.test(segment))) {
    fail(`package directory "${relative}" must use letters, digits and ._@+- only`)
  }
  if (problems.length) {
    report()
    return
  }

  const dirty = git(`status --porcelain -- "${relative}"`)
  if (dirty) {
    fail(`uncommitted changes in ${relative}: commit the bundle first, then pin its commit\n${dirty}`)
  }
  if (problems.length) {
    report()
    return
  }
  const commit = git('rev-parse HEAD')

  const index = fs.existsSync(INDEX_PATH)
    ? readJson(INDEX_PATH)
    : { format: 1, title: { en: 'My DSH plugins', zh: '我的 DSH 插件' }, plugins: [] }

  const en = readJson(path.join(dir, 'locale', 'en.json')).meta
  const zhFile = path.join(dir, 'locale', 'zh.json')
  const zh = fs.existsSync(zhFile) ? readJson(zhFile).meta : null

  const iconName = pkg.name.replace(/^@/, '').replace(/[/.]/g, '__') + '.svg'
  fs.mkdirSync(path.join(HERE, 'market', 'icons'), { recursive: true })
  fs.copyFileSync(path.join(dir, 'icon.svg'), path.join(HERE, 'market', 'icons', iconName))

  let entry = index.plugins.find((plugin) => plugin.name === pkg.name)
  if (!entry) {
    entry = { name: pkg.name, versions: [] }
    index.plugins.push(entry)
  }

  entry.title = zh ? { en: en.title, zh: zh.title } : { en: en.title }
  entry.description = zh ? { en: en.description, zh: zh.description } : { en: en.description }
  entry.icon = `icons/${iconName}`
  entry.metadata = { keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [] }

  entry.versions = entry.versions.filter((item) => item.version !== pkg.version)
  entry.versions.push({
    version: pkg.version,
    publishTimestamp: Math.floor(Date.now() / 1000),
    source: { type: 'git', url: shop.repo.replace(/\.git$/, ''), commit, path: relative },
    engines: { dsh: pkg.engines.dsh },
  })
  entry.versions.sort((left, right) => (left.version < right.version ? 1 : -1))

  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true })
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')

  console.log(`index: ${pkg.name}@${pkg.version} -> ${commit.slice(0, 8)} (${relative})`)
  if (problems.length) {
    report()
    return
  }

  git(`add market/index.json market/icons`)
  try {
    git(`commit -m "release ${pkg.name}@${pkg.version}"`)
    console.log('index committed')
  } catch (error) {
    warn('nothing to commit: the index already pointed at this version and commit')
  }

  if (push) {
    try {
      execSync(`git push origin ${shop.branch}`, { cwd: HERE, stdio: 'inherit' })
    } catch (error) {
      fail('git push failed')
    }
  } else {
    console.log(`\nnext: git push origin ${shop.branch}`)
    console.log(`customers add: ${shop.indexUrl}`)
  }

  report()
}

function report() {
  for (const warning of warnings) console.warn(`warn  ${warning}`)
  for (const problem of problems) console.error(`error ${problem}`)
  if (problems.length) {
    console.error(`\n${problems.length} problem(s); nothing was committed`)
    process.exitCode = 1
    return
  }
  console.log('\nindex ok')
}

main()

