# 实验三：成都景区管理系统（PostGIS + OpenLayers）

在第二次上机（OpenLayers 基础）之上的增量开发，**未改动任何旧页面**，全部新功能集中在 `/lab3` 页面（导航栏"实验三·景区管理"）。

## 一、功能清单

| 功能 | 说明 |
| --- | --- |
| 聚合标注 | `ol.source.Cluster` 聚合 60 个景点；**zoom ≥ 14 自动解聚**，按等级（5A/4A/3A/2A）显示不同颜色图标 |
| 点击弹窗 | `ol.Overlay`：聚合点显示景点列表，单点显示详情（名称/等级/地址/描述/图片/门票/开放时间） |
| 热力图 | `ol.layer.Heatmap`，右上角滑块**实时**调节模糊度（blur）与半径（radius） |
| 拉框查询 | `ol.interaction.DragBox` 拉框 → 走 PostGIS `ST_MakeEnvelope` 空间查询（回退模式为前端 `extent` 过滤）→ 弹出总数 + 按等级分组统计 |
| 面状景区绘制 | `ol.interaction.Draw`(Polygon) 绘制 → 表单录入名称/描述 → 保存进 `scenic_areas` 表 |
| 面状景区管理 | 点击面要素弹出菜单：查看详情 / 编辑属性 / 删除（均同步数据库） |

## 二、新增文件结构

```
geo_course/
├── db/                          # 数据库脚本（按序号顺序执行）
│   ├── 01_schema.sql            # 建表 + 空间索引 + 触发器
│   ├── 02_seed_spots.sql        # 60 个景点 INSERT
│   ├── 03_seed_areas.sql        # 3 个面状景区 INSERT
│   └── 04_queries.sql           # PostGIS 空间查询示例
├── server/                      # 最小 REST API（Express + pg，端口 3001）
│   ├── index.js
│   └── package.json
├── public/data/
│   ├── lab3_spots.json          # 回退数据：60 景点 GeoJSON
│   └── lab3_areas.json          # 回退数据：3 面 GeoJSON
├── public/images/attractions/   # 景点图片 CD001~CD060.jpg
└── src/views/Lab3ScenicDemo.vue # 实验三页面（唯一新页面）
```

改动过的旧文件（均为小改动）：`vite.config.js`（加 `/api` 代理）、`src/router/index.js`（加 `/lab3` 路由）、`src/App.vue`（导航加链接）。

## 三、数据库配置（PostgreSQL 14+ / PostGIS 3）

```powershell
# 1. 建库（需已安装 PostGIS 扩展）
psql -U postgres -c "CREATE DATABASE gis_lab;"

# 2. 按顺序执行脚本（01 中已含 CREATE EXTENSION postgis）
psql -U postgres -d gis_lab -f db/01_schema.sql
psql -U postgres -d gis_lab -f db/02_seed_spots.sql
psql -U postgres -d gis_lab -f db/03_seed_areas.sql
psql -U postgres -d gis_lab -f db/04_queries.sql   # 可选：查询示例
```

要点：
- `scenic_spots` 只需写 `lon/lat`，`geom` 由触发器自动生成；等级字段带 CHECK 约束（5A~1A）。
- `scenic_areas` 的面积（`area_m2`）由触发器按 `ST_Area(geom::geography)` 自动计算。
- 两个表均在 `geom` 上建了 **GiST 空间索引**，拉框查询走索引。

## 四、启动步骤

```powershell
# 终端 1：后端 API（端口 3001）
cd server
npm install        # 首次
npm start

# 终端 2：前端（端口 5173）
npm run dev
```

浏览器访问 `http://localhost:5173/lab3`。

### 数据库连接参数

默认连接 `localhost:5432` 的 `gis_lab` 库，用户/密码 `postgres/postgres`。**如果你的 PostgreSQL 密码不是 postgres**，两种改法：

1. 环境变量（推荐）：`$env:PGPASSWORD="你的密码"; npm start`
2. 直接改 `server/index.js` 顶部 Pool 配置。

## 五、降级策略

页面加载时先探测 `/api/health`（3 秒超时）：
- **后端 + 数据库都正常** → 左上角显示"数据源：PostGIS 数据库"，全部增删改同步数据库；
- 后端没启动或数据库连不上 → 自动回退 `public/data/*.json`，页面照常可用（改动仅保留在本次会话），左上角显示"本地 GeoJSON（API不可用）"。

## 六、API 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康探测（db:false 触发前端回退） |
| GET | `/api/spots` | 全部景点（GeoJSON） |
| GET | `/api/spots/bbox?minx&miny&maxx&maxy` | 拉框查询 + 分组统计（total + stats） |
| GET | `/api/areas` | 全部面状景区（GeoJSON） |
| POST | `/api/areas` | 新增面状景区（GeoJSON Feature） |
| PUT | `/api/areas/:id` | 编辑属性 |
| DELETE | `/api/areas/:id` | 删除 |

## 七、已验证功能（浏览器实测）

- 60 景点 + 3 面渲染、聚合/解聚切换、聚合列表与单点详情弹窗（图片正常加载）
- 热力图开关与 blur/radius 滑块实时生效
- 拉框统计（选中数 + 等级分组）、绘制四边形 → 表单录入 → 新面出现
- 面管理：菜单 / 查看详情 / 返回 / 删除（confirm 确认后数量 3→2，刷新恢复）
- 旧页面（如 /dataload）回归正常，控制台无报错
