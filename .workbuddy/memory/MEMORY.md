# geo_course 项目长期备忘

- 项目：《地理信息系统设计与实现》课程配套 OpenLayers 10 + Vue3 + Vite 示例站（vite dev + /geoserver 代理到 localhost:8080）。
- 天地图密钥在 `src/config.js`（浏览器端 key），底图必须用 `_w`（Web 墨卡托）系列图层 + TILEMATRIXSET=w，视图统一 EPSG:3857 + WORLD_EXTENT 限制；用 `_c` 会瓦片错位。
- 全站 UI 类：`src/theme.css` 提供 ol-card/ol-btn/ol-toolbar 等；页面为全屏地图 + 浮层卡片布局，顶部 62px 导航。
- 数据在 `public/data/`：province.geojson、earthquakes.kml、chengdu.geojson；GeoServer WMS (test:chengdu) 不可用时自动回退本地 chengdu.geojson。
- 页面验证套路：playwright-core（装在 C:/Users/31663/.workbuddy/binaries/node/workspace）+ 系统 Chrome headless，截图 + pageerror 监听 + download 事件捕获；agent-browser 在本机不可用（Chromium 下载被 SIGTERM）。
- 章节对应：Ch5→ShowTianditu/ControlsDemo/MeasureDemo；Ch6→DataLoadDemo(6.1.2/6.1.4/6.1.5)、PublicMapDemo(6.1.3)、MapExportDemo(6.2 图片+PDF)、DrawEditDemo(6.3.2)、StyleEditDemo(6.3.3)。
