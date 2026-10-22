// =============================================================
// 实验三：PostGIS 最小 REST API（Express + pg）
// 端口：3001（前端 Vite 通过 /api 代理转发，无需处理跨域）
// 启动：cd server && npm install && npm start
// 说明：浏览器无法直连 PostgreSQL，本服务仅做"数据库转发"这一层最小实现
// =============================================================

const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' })) // 面要素 GeoJSON 坐标串可能较长

// ------------------------------ 数据库连接 ------------------------------
// 默认参数硬编码在此，可用环境变量覆盖（PGHOST/PGPORT/...）
// 数据库不存在或密码不同请改这里，或见 README_实验3.md
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'chengdu_gis',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '20060817',
  max: 5,
  connectionTimeoutMillis: 3000, // 连不上 3 秒内报错，避免前端探测长时间挂起
  idleTimeoutMillis: 30000
})

// 统一错误响应
const fail = (res, err, status = 500) => {
  console.error('[API ERROR]', err.message || err)
  res.status(status).json({ ok: false, error: err.message || String(err) })
}

// 把 SELECT 行集转成 GeoJSON FeatureCollection
const toFeatureCollection = (rows) => ({
  type: 'FeatureCollection',
  features: rows.map((r) => {
    const { geometry, ...properties } = r
    return { type: 'Feature', geometry, properties }
  })
})

// ------------------------------ 健康探测 ------------------------------
// 前端用该接口判断后端与数据库是否可用（不可用则回退本地 GeoJSON）
app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok')
    res.json({ ok: true, db: r.rows[0].ok === 1 })
  } catch (err) {
    // 服务在、数据库连不上：返回 200 + db:false，前端据此回退
    res.json({ ok: true, db: false, error: err.message })
  }
})

// ------------------------------ 景点（点要素） ------------------------------
// 景点列表：返回 GeoJSON，前端直接 readFeatures
app.get('/api/spots', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, name, category, district, address, ticket, open_hours,
              description, image_url, ST_AsGeoJSON(geom)::json AS geometry
         FROM scenic_spots
        ORDER BY id`
    )
    res.json(toFeatureCollection(rows))
  } catch (err) {
    fail(res, err)
  }
})

// 拉框查询 + 分类统计（实验核心接口）
// 参数：minx, miny, maxx, maxy（EPSG:4326 包围盒）
app.get('/api/spots/bbox', async (req, res) => {
  try {
    const { minx, miny, maxx, maxy } = req.query
    const nums = [minx, miny, maxx, maxy].map(Number)
    // 参数校验：必须是 4 个有效数字，且 min < max
    if (nums.some((n) => !Number.isFinite(n)) || minx >= maxx || miny >= maxy) {
      return res.status(400).json({ ok: false, error: 'bbox 参数无效，需要 minx/miny/maxx/maxy 且 min<max' })
    }

    // && 走 GiST 索引做包围盒快速过滤（同 db/04_queries.sql 示例①）
    const env = nums.map(String).join(', ')
    const { rows } = await pool.query(
      `SELECT id, code, name, category, district, address, ticket, open_hours,
              description, image_url, ST_AsGeoJSON(geom)::json AS geometry
         FROM scenic_spots
        WHERE geom && ST_MakeEnvelope(${env}, 4326)
        ORDER BY category DESC, name`
    )
    // 框内按等级分组统计（示例②）
    const { rows: statRows } = await pool.query(
      `SELECT category, count(*) AS cnt
         FROM scenic_spots
        WHERE geom && ST_MakeEnvelope(${env}, 4326)
        GROUP BY category
        ORDER BY category DESC`
    )

    res.json({
      total: rows.length,
      stats: statRows.map((s) => ({ category: s.category, cnt: s.cnt })),
      features: toFeatureCollection(rows).features
    })
  } catch (err) {
    fail(res, err)
  }
})

// ------------------------------ 面状景区（热区） ------------------------------
// 面列表：返回 GeoJSON
app.get('/api/areas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, image_url, round(area_m2)::bigint AS area_m2,
              ST_AsGeoJSON(geom)::json AS geometry
         FROM scenic_areas
        ORDER BY id`
    )
    res.json(toFeatureCollection(rows))
  } catch (err) {
    fail(res, err)
  }
})

// 新增面状景区（前端绘制 Polygon 后调用）
// body: { name, description, image_url, geometry: { type:'Polygon', coordinates:[[x,y],...] } }
app.post('/api/areas', async (req, res) => {
  try {
    const { name, description = '', image_url = '', geometry } = req.body
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: '景区名称不能为空' })
    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
      return res.status(400).json({ ok: false, error: 'geometry 必须是 Polygon 类型的 GeoJSON' })
    }

    const { rows } = await pool.query(
      `INSERT INTO scenic_areas (name, description, image_url, geom)
       VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
       RETURNING id, name, description, image_url,
                 round(area_m2)::bigint AS area_m2,
                 ST_AsGeoJSON(geom)::json AS geometry`,
      [name.trim(), description, image_url, JSON.stringify(geometry)]
    )
    res.status(201).json({ type: 'Feature', geometry: rows[0].geometry, properties: { ...rows[0], geometry: undefined } })
  } catch (err) {
    fail(res, err)
  }
})

// 编辑面状景区属性（只改名称/描述/图片，不动几何）
app.put('/api/areas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, description } = req.body
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id 无效' })
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: '景区名称不能为空' })

    const { rowCount, rows } = await pool.query(
      `UPDATE scenic_areas
          SET name = $1, description = $2
        WHERE id = $3
        RETURNING id, name, description, image_url,
                  round(area_m2)::bigint AS area_m2,
                  ST_AsGeoJSON(geom)::json AS geometry`,
      [name.trim(), description || '', id]
    )
    if (!rowCount) return res.status(404).json({ ok: false, error: `景区 id=${id} 不存在` })
    res.json({ type: 'Feature', geometry: rows[0].geometry, properties: { ...rows[0], geometry: undefined } })
  } catch (err) {
    fail(res, err)
  }
})

// 删除面状景区
app.delete('/api/areas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'id 无效' })

    const { rowCount } = await pool.query('DELETE FROM scenic_areas WHERE id = $1', [id])
    if (!rowCount) return res.status(404).json({ ok: false, error: `景区 id=${id} 不存在` })
    res.json({ ok: true, deleted: id })
  } catch (err) {
    fail(res, err)
  }
})

// ------------------------------ 启动 ------------------------------
const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => {
  console.log(`[实验三 API] http://localhost:${PORT}`)
  console.log('[实验三 API] 接口：GET /api/health | GET /api/spots | GET /api/spots/bbox?minx&miny&maxx&maxy | GET/POST /api/areas | PUT/DELETE /api/areas/:id')
})
