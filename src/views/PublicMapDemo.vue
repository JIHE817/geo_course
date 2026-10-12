<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 公共底图切换（顶部居中）：天地图 / 高德 / 百度 / OSM -->
    <div class="pub-switcher ol-card">
      <button
        v-for="s in sourceList"
        :key="s.key"
        type="button"
        class="pub-switcher__btn"
        :class="{ 'is-active': current === s.key }"
        @click="switchTo(s.key)"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- 当前服务信息面板（左上，避开缩放滑块） -->
    <div class="info-panel ol-card">
      <h4 class="info-panel__title">当前服务：{{ activeSource.label }}</h4>
      <p><span class="k">服务类型</span>{{ activeSource.type }}</p>
      <p><span class="k">坐标系</span>{{ activeSource.proj }}</p>
      <p class="info-panel__url">{{ activeSource.url }}</p>
      <p class="info-panel__note">{{ activeSource.note }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import OSM from 'ol/source/OSM'
import TileGrid from 'ol/tilegrid/TileGrid'
import { fromLonLat } from 'ol/proj'
import {
  ZoomSlider, ScaleLine, FullScreen, defaults as defaultControls
} from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'

const mapContainer = ref(null)

// 各公共地图服务的说明信息（教学面板展示用）
const sourceList = [
  {
    key: 'tdt',
    label: '天地图',
    type: 'XYZ 瓦片（WMTS 服务）',
    proj: 'CGCS2000（经纬度 → EPSG:3857）',
    url: 't{0-7}.tianditu.gov.cn/vec_w / cva_w (WMTS)',
    note: '国家地理信息公共服务平台，需申请浏览器端密钥。视图为 EPSG:3857，须用 Web 墨卡托瓦片（vec_w 底图 + cva_w 注记）叠加而成，注记图层必须放在底图之上。'
  },
  {
    key: 'gaode',
    label: '高德地图',
    type: 'XYZ 瓦片',
    proj: 'GCJ-02（火星坐标系）',
    url: 'wprd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7',
    note: '通过 ol/source/XYZ 指定瓦片 URL 模板即可直接加载，style=7 为矢量电子地图，无需密钥。'
  },
  {
    key: 'baidu',
    label: '百度地图',
    type: 'XYZ 瓦片（自定义 TileGrid）',
    proj: 'BD-09',
    url: 'online{1-3}.map.bdimg.com/tile/?qt=tile&x={x}&y={y}&z={z}',
    note: '百度瓦片的分辨率数组和 y 轴方向与 Web 墨卡托不一致：需自定义 TileGrid（原点 [0,0]、分辨率 2^18→2^0）并在拼 URL 时翻转 y（-y-1）。'
  },
  {
    key: 'osm',
    label: 'OSM',
    type: 'XYZ 瓦片',
    proj: 'WGS84 / Web 墨卡托',
    url: 'tile.openstreetmap.org/{z}/{x}/{y}.png',
    note: 'OpenStreetMap 开源地图数据，OpenLayers 内置 ol/source/OSM 数据源，开箱即用。'
  }
]

const current = ref('tdt')
const activeSource = computed(
  () => sourceList.find((s) => s.key === current.value) || sourceList[0]
)

let map
// 各服务的图层组（懒创建，首次切换时生成）
const layerGroups = { tdt: [], gaode: [], baidu: [], osm: [] }

// ------------------------------ 各公共底图图层工厂 ------------------------------

// 天地图：矢量底图 + 注记（注记在上）
function createTdtLayers() {
  return [
    new TileLayer({ source: new XYZ({ url: buildTdtUrl('vec'), wrapX: false }) }),
    new TileLayer({ source: new XYZ({ url: buildTdtUrl('cva'), wrapX: false }) })
  ]
}

// 高德：标准 XYZ 瓦片，style=7 矢量电子地图
function createGaodeLayers() {
  return [
    new TileLayer({
      source: new XYZ({
        url: 'https://wprd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}',
        wrapX: false
      })
    })
  ]
}

// 百度：需自定义瓦片网格（原点在 [0,0]，分辨率自 2^18 递减）并翻转 y 坐标
function createBaiduLayers() {
  const resolutions = []
  for (let i = 0; i < 19; i++) resolutions.push(Math.pow(2, 18 - i))

  return [
    new TileLayer({
      source: new XYZ({
        wrapX: false,
        tileGrid: new TileGrid({
          origin: [0, 0],
          resolutions
        }),
        tileUrlFunction(tileCoord) {
          if (!tileCoord) return undefined
          const [z, x, y] = tileCoord
          // 百度瓦片 y 轴方向与 OpenLayers 相反
          const baiduY = -y - 1
          const server = (Math.abs(x) + Math.abs(baiduY)) % 3 + 1
          return (
            `http://online${server}.map.bdimg.com/tile/?qt=tile` +
            `&x=${x}&y=${baiduY}&z=${z}&styles=pl&scaler=1`
          )
        }
      })
    })
  ]
}

// OSM：OpenLayers 内置数据源
function createOsmLayers() {
  return [new TileLayer({ source: new OSM() })]
}

const FACTORIES = {
  tdt: createTdtLayers,
  gaode: createGaodeLayers,
  baidu: createBaiduLayers,
  osm: createOsmLayers
}

// ------------------------------ 初始化 ------------------------------
onMounted(() => {
  // 初始加载天地图
  layerGroups.tdt = createTdtLayers()

  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [...layerGroups.tdt],
    // 按课件：以北京为初始中心
    view: new View({
      center: fromLonLat([116.4, 39.9]),
      zoom: 10,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  map.addControl(new ZoomSlider())
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))
  map.addControl(new FullScreen())
})

// ------------------------------ 底图切换 ------------------------------
function switchTo(key) {
  if (current.value === key) return
  current.value = key

  // 隐藏当前全部图层
  Object.values(layerGroups).forEach((group) => group.forEach((l) => l.setVisible(false)))

  // 懒创建并显示目标服务图层（新图层自动加到最上层）
  if (layerGroups[key].length === 0) {
    layerGroups[key] = FACTORIES[key]()
    layerGroups[key].forEach((l) => map.addLayer(l))
  } else {
    layerGroups[key].forEach((l) => l.setVisible(true))
  }
}
</script>

<style scoped>
.wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
.map-container {
  width: 100%;
  height: 100%;
}

/* 公共底图切换条（顶部居中） */
.pub-switcher {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 5px;
}
.pub-switcher__btn {
  border: 0;
  border-radius: 9px;
  padding: 9px 20px;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.3px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}
.pub-switcher__btn:hover {
  background: rgba(91, 125, 153, 0.14);
}
.pub-switcher__btn.is-active {
  background: linear-gradient(180deg, #5b7d99 0%, #456280 100%);
  color: #fff;
  box-shadow: 0 3px 10px rgba(69, 98, 128, 0.4);
}

/* 服务信息面板（左上，避开缩放滑块） */
.info-panel {
  position: absolute;
  top: 14px;
  left: 120px;
  z-index: 20;
  width: 330px;
  padding: 14px 16px 12px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink);
}
.info-panel__title {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--card-border);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.info-panel p {
  margin: 4px 0;
}
.info-panel .k {
  display: inline-block;
  min-width: 62px;
  margin-right: 8px;
  color: var(--muted);
  font-weight: 700;
}
.info-panel__url {
  margin-top: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.06);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.info-panel__note {
  margin-top: 8px;
  color: var(--ink-2);
  font-size: 13px;
}

@media (max-width: 900px) {
  .info-panel {
    display: none;
  }
}
</style>
