# Разработка

Требования: Node.js 20+.

```bash
npm install
npm run build      # сборка в dist/ (без тестов)
npm run dev        # запуск из исходников (tsx watch)
npm test           # юнит-тесты (без сети)
npm run typecheck  # проверка типов: исходники + тесты (без эмита)
```

## Локальный запуск из сборки

Вместо `npx` можно указать путь к собранному файлу:

```json
{
  "mcpServers": {
    "vk-ads": {
      "command": "node",
      "args": ["/абсолютный/путь/к/mcp-vk-ads/dist/index.js"],
      "env": { "VK_ADS_TOKEN": "ваш_токен" }
    }
  }
}
```

## Smoke-проверка (вживую, только чтение)

`npm run smoke` делает несколько **read-only** вызовов к кабинету из окружения
(данные аккаунта, лимиты API, первые кампании). Запись не выполняется. Запускайте
локально со своим токеном — никогда не кладите боевой токен в CI:

```bash
VK_ADS_TOKEN=ваш_токен npm run smoke
```

## CI

GitHub Actions прогоняет `typecheck` + `build` + `test` на Node 20/22/24 при push и pull request.
