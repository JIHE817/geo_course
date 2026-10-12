<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 绘制工具栏（左侧，避开缩放滑块等控件） -->
    <div class="draw-toolbar ol-card">
      <h4 class="draw-toolbar__title">图形绘制</h4>
      <button
        class="mini-btn"
        :class="{ 'is-active': drawType === 'Point' }"
        @click="startDraw('Point')"
      >
        <span>📍</span>绘制点
      </button>
      <button
        class="mini-btn"
        :class="{ 'is-active': drawType === 'LineString' }"
        @click="startDraw('LineString')"
      >
        <span>📏</span>绘制线
      </button>
      <button
        class="mini-btn"
        :class="{ 'is-active': drawType === 'Polygon' }"
        @click="startDraw('Polygon')"
      >
        <span>🔷</span>绘制多边形
      </button>
      <button
        class="mini-btn"
        :class="{ 'is-active': drawType === 'Circle' }"
        @click="startDraw('Circle')"
      >
        <span>⭕</span>绘制圆
      </button>

      <div class="draw-toolbar__divider"></div>

      <button class="mini-btn mini-btn--slate" :class="{ 'is-active': editing }" @click="enableModify">
        <span>✋</span>编辑图形
      </button>
      <button class="mini-btn mini-btn--ghost" @click="clearDraw">
        <span>🧹</span>清除全部
      </button>
    </div>

    <!-- 样式交互编辑面板（右上） -->
    <div class="style-panel ol-card">
      <h4 class="style-panel__title">图形样式交互编辑</h4>
      <p class="style-panel__hint">
        绘制完成后自动进入编辑模式：点选图形高亮显示，可拖动顶点修改形状；调整下方参数可实时更新全部图形样式。
      </p>

      <label class="style-row">
        <span class="style-row__label">边框颜色</span>
        <input type="color" v-model="strokeColor" @input="updateStyle" />
        <code>{{ strokeColor }}</code>
      </label>
      <label class="style-row">
        <span class="style-row__label">边框宽度</span>
        <input
          type="range"
          min="1"
          max="10"
          step="0.5"
          v-model.number="strokeWidth"
          @input="updateStyle"
        />
        <code>{{ strokeWidth }}px</code>
      </label>
      <label class="style-row">
        <span class="style-row__label">填充颜色</span>
        <input type="color" v-model="fillColor" @input="updateStyle" />
        <code>{{ fillColor }}</code>
      </label>
      <label class="style-row">
        <span class="style-row__label">填充透明度</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          v-model.number="fillOpacity"
          @input="updateStyle"
        />
        <code>{{ fillOpacity }}</code>
      </label>

      <div class="style-panel__divider"></div>

      <div class="style-panel__status">
        已选中 <b>{{ selectedCount }}</b> 个图形
        <button class="mini-btn mini-btn--ghost mini-btn--inline" @click="clearSelection">
          清除选中
        </button>
      </div>
    </div>

    <BaseMapSwitcher @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Snap from 'ol/interaction/Snap'
import Select from 'ol/interaction/Select'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import {
  ZoomSlider, ScaleLine, FullScreen, defaults as defaultControls
} from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)

// ------------------------------ 样式控制变量（响应式，供面板绑定） ------------------------------
const strokeColor = ref('#ff0000') // 边框颜色，默认红色
const strokeWidth = ref(2) // 边框宽度，默认 2px
const fillColor = ref('#ff0000') // 填充颜色，默认红色
const fillOpacity = ref(0.2) // 填充透明度，默认 0.2

const drawType = ref('')
const editing = ref(false)
const selectedCount = ref(0)

let map
let vecLayer
let cvaLayer
let imgLayer
let ciaLayer

let source
let vectorLayer
let drawInteraction = null
let modifyInteraction = null
let snapInteraction = null
let selectInteraction = null

// 十六进制颜色 + 透明度 → rgba 字符串
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ------------------------------ 样式工厂 ------------------------------
// 默认图形样式：随面板参数动态生成
function createStyle() {
  return new Style({
    fill: new Fill({
      color: hexToRgba(fillColor.value, fillOpacity.value)
    }),
    stroke: new Stroke({
      color: strokeColor.value,
      width: strokeWidth.value
    }),
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: strokeColor.value }),
      stroke: new Stroke({
        color: strokeColor.value,
        width: strokeWidth.value
      })
    })
  })
}

// 选中状态高亮样式（紫色加粗）
function createSelectStyle() {
  return new Style({
    stroke: new Stroke({ color: '#ff00ff', width: 3 }),
    fill: new Fill({ color: 'rgba(255, 0, 255, 0.3)' }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: '#ff00ff' }),
      stroke: new Stroke({ color: '#fff', width: 2 })
    })
  })
}

// ------------------------------ 初始化 ------------------------------
onMounted(() => {
  // 天地图底图
  vecLayer = new TileLayer({
    source: new XYZ({ url: buildTdtUrl('vec'), wrapX: false })
  })
  cvaLayer = new TileLayer({
    source: new XYZ({ url: buildTdtUrl('cva'), wrapX: false })
  })
  imgLayer = new TileLayer({
    source: new XYZ({ url: buildTdtUrl('img'), wrapX: false })
  })
  ciaLayer = new TileLayer({
    source: new XYZ({ url: buildTdtUrl('cia'), wrapX: false })
  })
  imgLayer.setVisible(false)
  ciaLayer.setVisible(false)

  // 空矢量图层：存储绘制的几何图形
  source = new VectorSource()
  vectorLayer = new VectorLayer({
    source,
    style: createStyle()
  })

  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [vecLayer, cvaLayer, imgLayer, ciaLayer, vectorLayer],
    view: new View({
      center: fromLonLat([104, 31]),
      zoom: 8,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  map.addControl(new ZoomSlider())
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))
  map.addControl(new FullScreen())
})

function switchBaseMap(type) {
  const isImg = type === 'img'
  vecLayer.setVisible(!isImg)
  cvaLayer.setVisible(!isImg)
  imgLayer.setVisible(isImg)
  ciaLayer.setVisible(isImg)
}

// ------------------------------ 交互管理 ------------------------------
// 移除所有交互
function removeInteractions() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction)
    drawInteraction = null
  }
  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction)
    modifyInteraction = null
  }
  if (selectInteraction) {
    map.removeInteraction(selectInteraction)
    selectInteraction = null
  }
  if (snapInteraction) {
    map.removeInteraction(snapInteraction)
    snapInteraction = null
  }
  editing.value = false
  drawType.value = ''
  selectedCount.value = 0
}

// 开始绘制指定类型的图形（'Point' | 'LineString' | 'Polygon' | 'Circle'）
function startDraw(type) {
  removeInteractions()
  drawType.value = type

  drawInteraction = new Draw({
    source,
    type,
    style: createStyle() // 使用当前面板样式
  })
  map.addInteraction(drawInteraction)

  // 吸附交互：绘制时可吸附到已有图形的顶点
  snapInteraction = new Snap({ source })
  map.addInteraction(snapInteraction)

  // 绘制完成后自动进入编辑模式
  drawInteraction.on('drawend', () => {
    enableModify()
  })
}

// 启用图形编辑模式：Select 高亮 + Modify 顶点编辑 + Snap 吸附
function enableModify() {
  removeInteractions()
  editing.value = true

  // 选择交互：指定可选图层与选中高亮样式
  selectInteraction = new Select({
    layers: [vectorLayer],
    style: createSelectStyle()
  })

  // 修改交互：绑定到选中的图形集合，顶点手柄使用青色样式
  modifyInteraction = new Modify({
    features: selectInteraction.getFeatures(),
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#00ffff' }),
        stroke: new Stroke({ color: '#fff', width: 2 })
      })
    })
  })

  // 编辑时吸附到其他图形的顶点
  snapInteraction = new Snap({ source })

  map.addInteraction(selectInteraction)
  map.addInteraction(modifyInteraction)
  map.addInteraction(snapInteraction)

  // 选中数量实时同步到面板
  const syncCount = () => {
    selectedCount.value = selectInteraction.getFeatures().getLength()
  }
  selectInteraction.on('select', syncCount)
  selectInteraction.getFeatures().on(['add', 'remove'], syncCount)
}

// 更新所有图形的样式（面板参数变化时调用）
function updateStyle() {
  if (!vectorLayer) return
  vectorLayer.setStyle(createStyle())
  if (drawInteraction) {
    drawInteraction.setStyle(createStyle())
  }
}

// 清除当前选中的图形（仅取消选中，不删除数据）
function clearSelection() {
  if (selectInteraction) {
    selectInteraction.getFeatures().clear()
    selectedCount.value = 0
  }
}

// 清除所有图形
function clearDraw() {
  removeInteractions()
  source.clear()
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

/* 绘制工具栏（左侧，避开缩放滑块） */
.draw-toolbar {
  position: absolute;
  top: 520px;
  left: 14px;
  z-index: 20;
  width: 200px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.draw-toolbar__title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--ink);
}
.draw-toolbar__divider {
  height: 1px;
  margin: 5px 2px;
  background: var(--card-border);
}

/* 紧凑按钮 */
.mini-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 13px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #5b7d99 0%, #456280 100%);
  box-shadow: 0 2px 8px rgba(69, 98, 128, 0.35);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.3px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    filter 0.15s var(--ease);
}
.mini-btn span {
  font-size: 17px;
  width: 20px;
  text-align: center;
}
.mini-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(69, 98, 128, 0.45);
}
.mini-btn.is-active {
  filter: saturate(1.2);
  outline: 2.5px solid rgba(255, 255, 255, 0.9);
  outline-offset: -5px;
}
.mini-btn--slate {
  background: linear-gradient(180deg, #64748b 0%, #475569 100%);
}
.mini-btn--ghost {
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
  color: var(--ink);
}
.mini-btn--ghost:hover {
  background: #f8fafc;
}
.mini-btn--inline {
  min-height: 32px;
  padding: 0 12px;
  font-size: 13px;
}

/* 样式编辑面板（右上） */
.style-panel {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 20;
  width: 292px;
  padding: 14px 16px 12px;
  color: var(--ink);
}
.style-panel__title {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--card-border);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.style-panel__hint {
  margin: 0 0 10px;
  color: var(--ink-2);
  font-size: 12.5px;
  line-height: 1.55;
}
.style-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  margin: 0;
  padding: 0 4px;
  border-radius: 9px;
  font-size: 14px;
  cursor: pointer;
}
.style-row:hover {
  background: rgba(37, 99, 235, 0.06);
}
.style-row__label {
  flex: 0 0 72px;
  color: var(--ink-2);
  font-weight: 600;
}
.style-row input[type='color'] {
  width: 38px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--card-border);
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
}
.style-row input[type='range'] {
  flex: 1;
  accent-color: var(--brand);
  cursor: pointer;
}
.style-row code {
  flex: 0 0 52px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: var(--muted);
  text-align: right;
}
.style-panel__divider {
  height: 1px;
  margin: 8px 2px;
  background: var(--card-border);
}
.style-panel__status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--ink-2);
}
.style-panel__status b {
  color: var(--brand);
  font-size: 16px;
}

@media (max-width: 900px) {
  .style-panel {
    display: none;
  }
}
</style>
