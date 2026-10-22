-- =============================================================
-- 实验三：PostGIS 空间查询示例（可直接在 psql 中逐段执行）
-- 拉框统计的 SQL 即后端 server/index.js 中
--   GET /api/spots/bbox 端点实际执行的语句
-- =============================================================

-- ① 拉框查询：给定包围盒（minx, miny, maxx, maxy），返回框内所有景点
--    && 运算符走 GiST 索引做包围盒快速过滤，是拉框查询的标准写法
SELECT id, name, category, address
FROM scenic_spots
WHERE geom && ST_MakeEnvelope(103.90, 30.60, 104.10, 30.72, 4326)
ORDER BY category DESC, name;

-- ② 拉框 + 分类统计（前端"拉框查询与统计"面板的核心 SQL）
--    返回：框内景点总数 + 按等级分组的数量
SELECT count(*) AS total
FROM scenic_spots
WHERE geom && ST_MakeEnvelope(103.90, 30.60, 104.10, 30.72, 4326);

SELECT category, count(*) AS cnt
FROM scenic_spots
WHERE geom && ST_MakeEnvelope(103.90, 30.60, 104.10, 30.72, 4326)
GROUP BY category
ORDER BY category DESC;

-- ③ 精确相交过滤：&& 只比较包围盒，ST_Intersects 判断几何是否真正相交
--    （拉框场景中框本身是矩形，两者结果一致；多边形选择场景必须用 ST_Intersects）
SELECT id, name
FROM scenic_spots
WHERE ST_Intersects(geom, ST_MakeEnvelope(103.90, 30.60, 104.10, 30.72, 4326));

-- ④ 缓冲区查询：天府广场（约 104.0657, 30.6574）5 公里范围内的景点，按距离排序
--    geography 类型按地球椭球计算真实米制距离
SELECT name, category,
       round(ST_Distance(geom::geography,
             ST_SetSRID(ST_MakePoint(104.0657, 30.6574), 4326)::geography)) AS dist_m
FROM scenic_spots
WHERE ST_DWithin(geom::geography,
      ST_SetSRID(ST_MakePoint(104.0657, 30.6574), 4326)::geography, 5000)
ORDER BY dist_m;

-- ⑤ 点在面内：统计每个面状景区（热区）内包含多少个景点
SELECT a.name AS area_name, count(s.id) AS spot_cnt
FROM scenic_areas a
LEFT JOIN scenic_spots s ON ST_Contains(a.geom, s.geom)
GROUP BY a.name
ORDER BY spot_cnt DESC;

-- ⑥ 最近邻查询：离武侯祠博物馆（约 104.0472, 30.6488）最近的 5 个其他景点
--    <->（几何距离运算符）配合 ORDER BY 可走 GiST 索引，是 PostGIS KNN 标准写法
SELECT name, category,
       round(ST_Distance(geom::geography,
             ST_SetSRID(ST_MakePoint(104.0472, 30.6488), 4326)::geography)) AS dist_m
FROM scenic_spots
WHERE name <> '武侯祠博物馆'
ORDER BY geom <-> ST_SetSRID(ST_MakePoint(104.0472, 30.6488), 4326)
LIMIT 5;

-- ⑦ 热区面积与基本信息（area_m2 由触发器自动维护）
SELECT id, name, round(area_m2) AS area_m2,
       ST_GeometryType(geom) AS geom_type, ST_NumPoints(geom) AS vertex_cnt
FROM scenic_areas;
