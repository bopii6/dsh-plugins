# dsh-plugins —— 我的 DSH 插件店

一个公开 GitHub 仓库，既是插件源码，也是客户的货架。客户在 Discover 里填一次索引地址，之后所有插件都能浏览、安装、更新。

## 为什么是 Git 而不是 npm

索引里记的是**某个提交的哈希**，客户装的就是那一版代码：

```json
"source": { "type": "git", "url": "https://github.com/你/dsh-plugins", "commit": "40位哈希", "path": "packages/dsh-voice-broadcast" }
```

好处：公开仓库免费、可回滚、不用 npm 账号；缺点是每次发版必须「先提交代码，再把提交号写进索引」。

## 目录

```
packages/<插件>/   各个插件的源码（一个包一个目录）
market/index.json  货架清单（客户读到的是这个）
market/icons/      图标（必须与索引同源）
shop.config.json   仓库地址与客户用的索引地址
release.mjs        校验插件 + 把当前提交写进索引
serve.mjs          本地预览货架
```

## 一次性准备

1. 在 GitHub 建一个**公开**仓库，名字随意（例如 `dsh-plugins`）。
2. 编辑 `shop.config.json`，把两处 `REPLACE-ME` 换成你的 GitHub 用户名：

```json
{
  "repo": "https://github.com/你的用户名/dsh-plugins",
  "branch": "main",
  "indexUrl": "https://你的用户名.github.io/dsh-plugins/market/index.json"
}
```

3. 推送：

```bash
cd E:\dsh-plugins
git remote add origin https://github.com/你的用户名/dsh-plugins.git
git push -u origin main
```

4. 仓库 Settings → Pages → Source 选 `main` / `/ (root)`。
   索引地址就是 `https://你的用户名.github.io/dsh-plugins/market/index.json`。

## 每次发版

```bash
# 1. 改代码、改 package.json 的 version
git add -A && git commit -m "feat: 说说改了什么"

# 2. 把这次提交写进货架（会自己再提交一次索引）
node release.mjs packages/dsh-voice-broadcast

# 3. 推上去（索引里的提交必须已经在远端）
git push
```

`release.mjs` 会检查：包名/版本合法、`engines.dsh` 有范围、
`cordis.patch.yml`、`client.js` 的 loader id 与 `package.json` 三处名字一致、
locale 有中英文标题描述、图标 ≤256KB、工作区干净。

## 客户怎么装

1. 设置 → 插件 → 打开「自定义插件市场」
2. Discover → 添加 `shop.config.json` 里的 `indexUrl`
3. 找到插件 → 安装

## 本地预览

```bash
node serve.mjs      # http://127.0.0.1:8791/index.json
```

## 注意

- 仓库是**公开**的，任何人都能看到源码。要收费，下一步加授权码（离线签名校验）。
- 客户装的版本由索引里的提交决定，升级时把新提交写进去即可，旧版本记录保留可回滚。
- 索引里的 `commit` 必须是**已经推送**的提交，否则客户拉不到。
