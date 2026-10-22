<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 图层管理面板（右上角） -->
    <div class="layer-panel ol-card ol-layer-panel">
      <h4 class="ol-layer-panel__title">图层管理</h4>

      <p class="ol-layer-panel__group">业务数据图层</p>
      <label>
        <input type="checkbox" v-model="showProvince" @change="toggleProvince" />
        <span class="lay-swatch" style="background: #2563eb"></span>
        <span>省级边界 (GeoJSON)</span>
      </label>
      <label>
        <input type="checkbox" v-model="showEarthquake" @change="toggleEarthquake" />
        <span class="lay-swatch" style="background: #ef4444"></span>
        <span>地震事件 (KML)</span>
      </label>
      <label>
        <input type="checkbox" v-model="showWms" @change="toggleWms" />
        <span class="lay-swatch" style="background: #8b5cf6"></span>
        <span>成都市 (WMS)</span>
      </label>

      <p class="ol-layer-panel__group">本地回退图层</p>
      <label>
        <input type="checkbox" v-model="showChengdu" @change="toggleChengdu" />
        <span class="lay-swatch" style="background: #22c55e"></span>
        <span>成都市 (GeoJSON)</span>
      </label>
    </div>

    <!-- 底图切换（顶部居中：矢量 / 影像 / 地形） -->
    <BaseMapSwitcher :bases="['vec', 'img', 'ter']" @change="switchBaseMap" />

    <!-- 左侧功能工具面板（最左端隔离区域，集中放置测量与绘制功能按键） -->
    <aside class="tool-panel ol-card">
      <h4 class="tool-panel__title">功能工具</h4>

      <p class="tool-panel__group">测量</p>
      <button
        class="tool-btn ol-btn"
        :class="{ 'is-active': measureType === 'distance' }"
        @click="startMeasure('distance')"
      >
        <span class="tool-btn__icon">📏</span>
        <span>距离测量</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--green"
        :class="{ 'is-active': measureType === 'area' }"
        @click="startMeasure('area')"
      >
        <span class="tool-btn__icon">⬛</span>
        <span>面积测量</span>
      </button>

      <p class="tool-panel__group">绘制</p>
      <button
        class="tool-btn ol-btn"
        :class="{ 'is-active': drawType === 'Point' }"
        @click="startDraw('Point')"
      >
        <span class="tool-btn__icon">📍</span>
        <span>绘制点</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--green"
        :class="{ 'is-active': drawType === 'LineString' }"
        @click="startDraw('LineString')"
      >
        <span class="tool-btn__icon">✏️</span>
        <span>绘制线</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--amber"
        :class="{ 'is-active': drawType === 'Polygon' }"
        @click="startDraw('Polygon')"
      >
        <span class="tool-btn__icon">🔷</span>
        <span>绘制面</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--slate"
        :class="{ 'is-active': drawType === 'Circle' }"
        @click="startDraw('Circle')"
      >
        <span class="tool-btn__icon">⭕</span>
        <span>绘制圆</span>
      </button>

      <div class="tool-panel__divider"></div>

      <button class="tool-btn ol-btn ol-btn--ghost tool-btn--clear" @click="clearMeasure">
        <span class="tool-btn__icon">🧹</span>
        <span>清除测量</span>
      </button>
      <button class="tool-btn ol-btn ol-btn--ghost tool-btn--clear" @click="clearDraw">
        <span class="tool-btn__icon">🧹</span>
        <span>清除图形</span>
      </button>
    </aside>

    <!-- 测量提示气泡 -->
    <div ref="tipDiv" class="measure-tip ol-measure-tip"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Map, View, Overlay } from 'ol'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import TileWMS from 'ol/source/TileWMS'
import GeoJSON from 'ol/format/GeoJSON'
import KML from 'ol/format/KML'
import { fromLonLat } from 'ol/proj'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Snap from 'ol/interaction/Snap'
import { getLength, getArea } from 'ol/sphere'
import { unByKey } from 'ol/Observable'
import {
  ZoomSlider,
  ScaleLine,
  FullScreen,
  OverviewMap,
  MousePosition,
  defaults as defaultControls
} from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)
const tipDiv = ref(null)

// GeoServer 服务配置（通过 Vite 代理转发到本地 GeoServer）
const WMS_URL = '/geoserver/test/wms'
const WMS_LAYER = 'test:chengdu'

let map

// 底图图层（矢量 / 影像 / 地形，各自带注记）
const baseLayers = { vec: null, cva: null, img: null, cia: null, ter: null, cta: null }

// 业务数据图层
let provinceLayer
let earthquakeLayer
let chengduLayer
let wmsLayer

// 测量 / 绘制图层
let measureLayer
let measureSource
let drawLayer
let drawSource

// 交互实例
let measureDraw
let sketchFeature
let geometryListener
let overlay
let drawInteraction
let modifyInteraction
let snapInteraction

const showProvince = ref(true)
const showEarthquake = ref(true)
const showChengdu = ref(false)
const showWms = ref(true)
const measureType = ref('')
const drawType = ref('')

// ------------------------------ 图层样式 ------------------------------
const provinceStyle = new Style({
  fill: new Fill({ color: 'rgba(37, 99, 235, 0.08)' }),
  stroke: new Stroke({ color: '#2563eb', width: 1.2 })
})

const earthquakeStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: '#ef4444' }),
    stroke: new Stroke({ color: '#fff', width: 1.5 })
  })
})

const chengduStyle = new Style({
  fill: new Fill({ color: 'rgba(34, 197, 94, 0.18)' }),
  stroke: new Stroke({ color: '#22c55e', width: 2 })
})

const measureStyle = new Style({
  fill: new Fill({ color: 'rgba(37, 99, 235, 0.12)' }),
  stroke: new Stroke({ color: '#2563eb', width: 2, lineDash: [6, 6] }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: '#2563eb' }),
    stroke: new Stroke({ color: '#fff', width: 1.5 })
  })
})

const drawColor = '#f59e0b'
function createDrawStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(245, 158, 11, 0.2)' }),
    stroke: new Stroke({ color: drawColor, width: 2.5 }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: drawColor }),
      stroke: new Stroke({ color: '#fff', width: 2 })
    })
  })
}

// ------------------------------ 初始化 ------------------------------
onMounted(() => {
  // 天地图底图
  baseLayers.vec = new TileLayer({ source: new XYZ({ url: buildTdtUrl('vec'), wrapX: false }) })
  baseLayers.cva = new TileLayer({ source: new XYZ({ url: buildTdtUrl('cva'), wrapX: false }) })
  baseLayers.img = new TileLayer({ source: new XYZ({ url: buildTdtUrl('img'), wrapX: false }) })
  baseLayers.cia = new TileLayer({ source: new XYZ({ url: buildTdtUrl('cia'), wrapX: false }) })
  baseLayers.ter = new TileLayer({ source: new XYZ({ url: buildTdtUrl('ter'), wrapX: false }) })
  baseLayers.cta = new TileLayer({ source: new XYZ({ url: buildTdtUrl('cta'), wrapX: false }) })
  baseLayers.img.setVisible(false)
  baseLayers.cia.setVisible(false)
  baseLayers.ter.setVisible(false)
  baseLayers.cta.setVisible(false)

  // 1. GeoJSON 省级边界（手动 loader，异常可被捕获、避免静默失败）
  const provinceSource = new VectorSource()
  provinceLayer = new VectorLayer({ source: provinceSource, style: provinceStyle })
  const provinceFormat = new GeoJSON()
  fetch('/data/province.geojson')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((geo) => {
      const features = provinceFormat.readFeatures(geo, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      })
      provinceSource.addFeatures(features)
    })
    .catch((err) => console.error('[DataLoad] province.geojson 加载失败：', err))

  // 2. KML 地震事件（KML 构造器忽略 featureProjection，须在 readFeatures 显式传入）
  const earthquakeSource = new VectorSource()
  earthquakeLayer = new VectorLayer({ source: earthquakeSource, style: earthquakeStyle })
  const kmlFormat = new KML({ extractStyles: false })
  fetch('/data/earthquakes.kml')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    })
    .then((kmlText) => {
      const features = kmlFormat.readFeatures(kmlText, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      })
      earthquakeSource.addFeatures(features)
    })
    .catch((err) => console.error('[DataLoad] earthquakes.kml 加载失败：', err))

  // 3. 本地 GeoJSON 成都市（WMS 不可用时的回退）
  const chengduSource = new VectorSource()
  chengduLayer = new VectorLayer({ source: chengduSource, style: chengduStyle })
  const chengduFormat = new GeoJSON()
  fetch('/data/chengdu.geojson')
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((geo) => {
      const features = chengduFormat.readFeatures(geo, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
      })
      chengduSource.addFeatures(features)
    })
    .catch((err) => console.error('[DataLoad] chengdu.geojson 加载失败：', err))
  chengduLayer.setVisible(false)
  showChengdu.value = false

  // 4. GeoServer WMS 图层（TileWMS）
  wmsLayer = new TileLayer({
    source: new TileWMS({
      url: WMS_URL,
      params: {
        LAYERS: WMS_LAYER,
        TILED: true,
        VERSION: '1.1.0',
        FORMAT: 'image/png',
        TRANSPARENT: true
      },
      serverType: 'geoserver',
      transition: 0
    })
  })

  // 测量图层
  measureSource = new VectorSource()
  measureLayer = new VectorLayer({ source: measureSource, style: measureStyle })

  // 绘制图层
  drawSource = new VectorSource()
  drawLayer = new VectorLayer({ source: drawSource, style: createDrawStyle() })

  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [
      baseLayers.vec,
      baseLayers.cva,
      baseLayers.img,
      baseLayers.cia,
      baseLayers.ter,
      baseLayers.cta,
      wmsLayer,
      chengduLayer,
      provinceLayer,
      earthquakeLayer,
      measureLayer,
      drawLayer
    ],
    view: new View({
      center: fromLonLat([104, 31]),
      zoom: 6,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  // 基本控件：缩放滑块 / 比例尺 / 全屏 / 鹰眼 / 鼠标位置
  map.addControl(new ZoomSlider())
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))
  map.addControl(new FullScreen())
  map.addControl(
    new OverviewMap({
      layers: [
        new TileLayer({ source: new XYZ({ url: buildTdtUrl('vec'), wrapX: false }) }),
        new TileLayer({ source: new XYZ({ url: buildTdtUrl('cva'), wrapX: false }) })
      ],
      collapsed: false
    })
  )
  map.addControl(
    new MousePosition({
      projection: 'EPSG:4326',
      coordinateFormat: (c) => `经度 ${c[0].toFixed(4)}°　纬度 ${c[1].toFixed(4)}°`,
      className: 'ol-mouse-position',
      placeholder: '经度：—　纬度：—',
      undefinedHTML: '经度：—　纬度：—'
    })
  )

  // 测量提示气泡 Overlay
  overlay = new Overlay({
    element: tipDiv.value,
    positioning: 'bottom-left',
    offset: [10, -10]
  })
  map.addOverlay(overlay)

  // 探测 WMS 是否可用
  probeWmsAndFallback()
})

// ------------------------------ WMS 探测与回退 ------------------------------
function probeWmsAndFallback() {
  const testUrl =
    `${WMS_URL}?service=WMS&version=1.1.0&request=GetMap` +
    `&layers=${encodeURIComponent(WMS_LAYER)}` +
    `&bbox=103.5,30.2,104.7,30.9&width=100&height=100` +
    `&srs=EPSG:4326&format=image/png&transparent=true`

  const img = new Image()
  img.crossOrigin = 'anonymous'
  let settled = false

  const fallback = () => {
    if (settled) return
    settled = true
    wmsLayer.setVisible(false)
    chengduLayer.setVisible(true)
    showWms.value = false
    showChengdu.value = true
    console.warn('[DataLoad] GeoServer WMS 不可用，已回退到本地 chengdu.geojson')
  }

  img.onload = () => {
    settled = true
    wmsLayer.setVisible(true)
    chengduLayer.setVisible(false)
    showWms.value = true
    showChengdu.value = false
    console.info('[DataLoad] GeoServer WMS 加载成功')
  }
  img.onerror = fallback
  setTimeout(fallback, 3000)
  img.src = testUrl
}

// ------------------------------ 底图切换 ------------------------------
const BASE_PAIRS = {
  vec: ['vec', 'cva'],
  img: ['img', 'cia'],
  ter: ['ter', 'cta']
}

function switchBaseMap(type) {
  Object.keys(baseLayers).forEach((k) => baseLayers[k].setVisible(false))
  BASE_PAIRS[type].forEach((k) => baseLayers[k].setVisible(true))
}

// ------------------------------ 图层显隐 ------------------------------
function toggleProvince() {
  provinceLayer.setVisible(showProvince.value)
}
function toggleEarthquake() {
  earthquakeLayer.setVisible(showEarthquake.value)
}
function toggleChengdu() {
  chengduLayer.setVisible(showChengdu.value)
}
function toggleWms() {
  wmsLayer.setVisible(showWms.value)
}

// ------------------------------ 测量 ------------------------------
function startMeasure(type) {
  // 如果已处于该测量模式，再次点击则取消
  if (measureType.value === type) {
    clearMeasure()
    return
  }
  stopDraw()
  clearMeasure()
  measureType.value = type

  const drawTypeName = type === 'area' ? 'Polygon' : 'LineString'
  measureDraw = new Draw({ source: measureSource, type: drawTypeName })
  map.addInteraction(measureDraw)

  measureDraw.on('drawstart', (evt) => {
    sketchFeature = evt.feature
    const geom = sketchFeature.getGeometry()
    geometryListener = geom.on('change', () => {
      const g = sketchFeature.getGeometry()
      let output = ''
      let coord
      if (type === 'distance') {
        output = '总长：' + distanceFormat(getLength(g))
        coord = g.getLastCoordinate()
      } else if (type === 'area') {
        output = '面积：' + formatArea(getArea(g))
        coord = g.getInteriorPoint().getCoordinates()
      }
      tipDiv.value.innerHTML = output
      if (coord) overlay.setPosition(coord)
    })
  })

  measureDraw.on('drawend', () => {
    unByKey(geometryListener)
    map.removeInteraction(measureDraw)
    measureDraw = null
    measureType.value = ''
  })
}

function clearMeasure() {
  if (measureDraw) {
    map.removeInteraction(measureDraw)
    measureDraw = null
  }
  if (measureSource) measureSource.clear()
  measureType.value = ''
  if (geometryListener) {
    unByKey(geometryListener)
    geometryListener = null
  }
  if (tipDiv.value) tipDiv.value.innerHTML = ''
  if (overlay) overlay.setPosition(undefined)
}

function distanceFormat(length) {
  return length > 1000 ? (length / 1000).toFixed(2) + ' km' : length.toFixed(2) + ' m'
}
function formatArea(area) {
  return area > 10000 ? (area / 1000000).toFixed(2) + ' km²' : area.toFixed(2) + ' m²'
}

// ------------------------------ 绘制 ------------------------------
function startDraw(type) {
  // 再次点击同一类型则退出绘制
  if (drawType.value === type) {
    removeDrawInteractions()
    drawType.value = ''
    return
  }
  clearMeasure()
  removeDrawInteractions()
  drawType.value = type

  drawInteraction = new Draw({ source: drawSource, type, style: createDrawStyle() })
  map.addInteraction(drawInteraction)
  snapInteraction = new Snap({ source: drawSource })
  map.addInteraction(snapInteraction)

  drawInteraction.on('drawend', () => {
    enableModify()
  })
}

function enableModify() {
  removeDrawInteractions()
  modifyInteraction = new Modify({ source: drawSource })
  map.addInteraction(modifyInteraction)
  snapInteraction = new Snap({ source: drawSource })
  map.addInteraction(snapInteraction)
}

function removeDrawInteractions() {
  ;[drawInteraction, modifyInteraction, snapInteraction].forEach((i) => {
    if (i) map.removeInteraction(i)
  })
  drawInteraction = null
  modifyInteraction = null
  snapInteraction = null
}

function clearDraw() {
  removeDrawInteractions()
  drawSource.clear()
  drawType.value = ''
}

// 停止绘制交互（测量时调用，避免冲突）
function stopDraw() {
  removeDrawInteractions()
  drawType.value = ''
}

onBeforeUnmount(() => {
  clearMeasure()
  clearDraw()
})
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

/* 图层管理面板 */
.layer-panel {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 20;
  max-height: calc(100% - 306px);
  overflow-y: auto;
}
.ol-layer-panel__group {
  margin: 14px 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.lay-swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
}

/* 左侧功能工具面板（让开缩放滑块列，限高到比例尺上方，超高内部滚动） */
.tool-panel {
  position: absolute;
  left: 116px;
  top: 76px;
  z-index: 20;
  width: 216px;
  max-height: calc(100% - 236px);
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-panel__title {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--ink);
}
.tool-panel__group {
  margin: 10px 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--muted);
  text-transform: uppercase;
}
.tool-panel__divider {
  height: 1px;
  margin: 6px 2px;
  background: var(--card-border);
}

/* 面板内按钮：全宽、统一高度与间距、左对齐 */
.tool-btn {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  font-size: 15px;
  gap: 12px;
  border-radius: 11px;
  justify-content: flex-start;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.14);
}
.tool-btn:hover {
  transform: translateY(-2px);
}
.tool-btn__icon {
  font-size: 19px;
  width: 22px;
  text-align: center;
  flex: none;
}

/* 清除按钮：更矮、ghost 风格，位于分隔线下方 */
.tool-btn--clear {
  min-height: 38px;
  font-size: 14px;
  color: var(--ink-2);
}

.measure-tip {
  position: absolute;
}
</style>