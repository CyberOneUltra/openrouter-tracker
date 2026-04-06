# OpenRouter Token Tracker

每日自动采集 OpenRouter 模型 Token 排名数据，生成可视化 Dashboard。

## 结构

- `scraper.js` — 数据采集脚本，抓取 OpenRouter rankings 页面
- `data.json` — 历史数据（daily + weekly）
- `dashboard.html` — 自动生成的可视化页面

## 自动化

GitHub Actions 每天 **UTC 1:05**（北京时间 9:05）自动运行：

1. 执行 `node scraper.js` 抓取最新数据
2. 更新 `data.json` 和 `dashboard.html`
3. 自动 commit & push

## 手动运行

```bash
node scraper.js
```

## 查看 Dashboard

开启 GitHub Pages（Settings → Pages → Source: `main` / root）后访问：

```
https://<username>.github.io/<repo>/dashboard.html
```
