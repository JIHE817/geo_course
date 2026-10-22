-- =============================================================
-- 实验三：成都市景区数据库 —— PostgreSQL + PostGIS 建表脚本
-- 坐标系：WGS-84 / EPSG:4326（与天地图底图一致）
-- 数据库：PostgreSQL 14+ ，PostGIS 3.x
-- 使用：psql -U postgres -d gis_lab -f 01_schema.sql
-- =============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- 重复执行时先删旧表（实验环境方便重跑）
DROP TABLE IF EXISTS scenic_areas CASCADE;
DROP TABLE IF EXISTS scenic_spots CASCADE;

-- -------------------------------------------------------------
-- 1. 景点表 scenic_spots（点要素）：存储 60 个成都 A 级景区
--    核心字段：id, name, category, geom, image_url, description, address
--    扩展字段：code, district, ticket, open_hours, lon, lat
-- -------------------------------------------------------------
CREATE TABLE scenic_spots (
    id          SERIAL         PRIMARY KEY,
    name        VARCHAR(120)   NOT NULL,                       -- 景点名称
    category    VARCHAR(4)     NOT NULL                        -- 景区等级（5A/4A/3A/2A/1A）
                 CHECK (category IN ('5A', '4A', '3A', '2A', '1A')),
    geom        GEOMETRY(Point, 4326) NOT NULL,                -- 点位（WGS-84 经纬度）
    image_url   VARCHAR(200),                                  -- 景点图片（前端可访问的相对路径）
    description TEXT,                                          -- 景点简介
    address     VARCHAR(200),                                  -- 详细地址
    -- ---- 扩展属性（数据已采集，一并入库便于演示） ----
    code        VARCHAR(10)   NOT NULL UNIQUE,                 -- 业务编码 CD001~CD060
    district    VARCHAR(30),                                   -- 所属区（市）县
    ticket      NUMERIC(8,2)   DEFAULT 0,                      -- 参考票价（元），0 表示免费
    open_hours  VARCHAR(60),                                    -- 开放时间
    lon         NUMERIC(10,6)  NOT NULL CHECK (lon BETWEEN -180 AND 180),
    lat         NUMERIC(10,6)  NOT NULL CHECK (lat BETWEEN -90 AND 90),
    created_at  TIMESTAMPTZ    DEFAULT now()
);

COMMENT ON TABLE  scenic_spots IS '成都市A级旅游景区兴趣点（共60个）';
COMMENT ON COLUMN scenic_spots.category IS '景区等级分类：5A/4A/3A/2A/1A';
COMMENT ON COLUMN scenic_spots.geom IS '景点点位，WGS-84 经纬度，SRID=4326';
COMMENT ON COLUMN scenic_spots.image_url IS '景点图片相对路径，如 /images/attractions/CD001.jpg';

-- 空间索引：拉框查询、热力图取点必须走 GiST 索引
CREATE INDEX idx_spots_geom    ON scenic_spots USING GIST (geom);
-- 属性索引：按等级分类统计
CREATE INDEX idx_spots_category ON scenic_spots (category);

-- lon/lat 与 geom 自动同步：录入时只需给经纬度，geom 由触发器生成
-- （INSERT 语句简洁，也保证 geom 与属性列严格一致）
CREATE OR REPLACE FUNCTION fn_spots_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_spots_geom
BEFORE INSERT OR UPDATE OF lon, lat ON scenic_spots
FOR EACH ROW EXECUTE FUNCTION fn_spots_geom();

-- -------------------------------------------------------------
-- 2. 面状景区表 scenic_areas（面要素 / 热区）：实验内容7
--    支持前端绘制 Polygon 后录入，及查看 / 编辑属性 / 删除
-- -------------------------------------------------------------
CREATE TABLE scenic_areas (
    id          SERIAL           PRIMARY KEY,
    name        VARCHAR(120)     NOT NULL,                    -- 景区名称
    geom        GEOMETRY(Polygon, 4326) NOT NULL,              -- 面边界（WGS-84）
    description TEXT,                                          -- 景区描述
    image_url   VARCHAR(200),                                  -- 景区图片
    area_m2     NUMERIC(14,2),                                 -- 面积（平方米），由触发器按几何自动计算
    created_at  TIMESTAMPTZ      DEFAULT now(),
    updated_at  TIMESTAMPTZ      DEFAULT now()
);

COMMENT ON TABLE  scenic_areas IS '面状景区（热区），前端可绘制录入、编辑、删除';
COMMENT ON COLUMN scenic_areas.area_m2 IS '面积（平方米），geography 类型计算更接近真实值，由触发器自动维护';

CREATE INDEX idx_areas_geom ON scenic_areas USING GIST (geom);

-- 插入/更新时自动计算面积并刷新 updated_at
CREATE OR REPLACE FUNCTION fn_areas_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.area_m2 := ST_Area(NEW.geom::geography);
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_areas_update
BEFORE INSERT OR UPDATE ON scenic_areas
FOR EACH ROW EXECUTE FUNCTION fn_areas_update();

-- -------------------------------------------------------------
-- 3. 常用统计视图：按等级分类统计（供实验演示直接 SELECT）
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_spots_category_stat AS
SELECT category,
       count(*)   AS cnt,
       string_agg(name, '、' ORDER BY name) AS names
FROM scenic_spots
GROUP BY category
ORDER BY category DESC;
