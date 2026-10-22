-- =============================================================
-- 实验三：scenic_areas 表示例数据（3 个面状景区 / 热区）
-- 使用：psql -U postgres -d gis_lab -f 03_seed_areas.sql
-- 说明：geom 使用 ST_GeomFromText 直接写入 WKT 多边形（EPSG:4326）；
--       area_m2 由 01_schema.sql 中的触发器按 geography 自动计算
-- =============================================================

TRUNCATE TABLE scenic_areas RESTART IDENTITY CASCADE;

-- ① 青城山-都江堰文旅片区（覆盖：青城山-都江堰景区 CD001、灌县古城 CD035）
INSERT INTO scenic_areas (name, geom, description, image_url) VALUES (
    '青城山-都江堰文旅片区',
    ST_GeomFromText('POLYGON((103.5300 31.0600, 103.7200 31.0600, 103.7200 30.9300, 103.5300 30.9300, 103.5300 31.0600))', 4326),
    '以都江堰水利工程与青城山世界文化遗产为核心，串联灌县古城，是成都世界遗产与道教文化的集中展示区。',
    '/images/attractions/CD001.jpg'
);

-- ② 大熊猫生态旅游片区（覆盖：成都大熊猫繁育研究基地 CD007）
INSERT INTO scenic_areas (name, geom, description, image_url) VALUES (
    '大熊猫生态旅游片区',
    ST_GeomFromText('POLYGON((104.1000 30.7700, 104.2000 30.7700, 104.2000 30.7000, 104.1000 30.7000, 104.1000 30.7700))', 4326),
    '以成都大熊猫繁育研究基地为核心的城市生态片区，集大熊猫科研保护、科普教育与旅游观光于一体。',
    '/images/attractions/CD007.jpg'
);

-- ③ 安仁古镇文博片区（覆盖：安仁古镇景区 CD002）
INSERT INTO scenic_areas (name, geom, description, image_url) VALUES (
    '安仁古镇文博片区',
    ST_GeomFromText('POLYGON((103.5700 30.5400, 103.6600 30.5400, 103.6600 30.4800, 103.5700 30.4800, 103.5700 30.5400))', 4326),
    '以安仁古镇民国公馆建筑群与建川博物馆聚落为核心的文博旅游片区，被称为"中国博物馆小镇"。',
    '/images/attractions/CD002.jpg'
);

-- 验证：应返回 3 行，面积单位为平方米
-- SELECT id, name, round(area_m2) AS area_m2 FROM scenic_areas;
