<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 左侧功能工具面板：绘制 / 选择 / 编辑 / 删除 -->
    <aside class="tool-panel ol-card">
      <h4 class="tool-panel__title">图形绘制与编辑</h4>

      <p class="tool-panel__group">绘制图形</p>
      <div class="tool-grid">
        <button
          v-for="s in SHAPES"
          :key="s.key"
          class="tool-btn"
          :class="{ 'is-active': drawKey === s.key }"
          @click="startDraw(s.key)"
        >
          <span class="tool-btn__icon">{{ s.icon }}</span>
          <span>{{ s.label }}</span>
        </button>
      </div>

      <div class="tool-panel__divider"></div>

      <p class="tool-panel__group">选择与编辑</p>
      <button
        class="tool-btn tool-btn--slate"
        :class="{ 'is-active': selectOn }"
        @click="toggleSelect"
      >
        <span class="tool-btn__icon">🖱️</span>
        <span>点选 / 框选</span>
      </button>
      <button
        class="tool-btn tool-btn--slate"
        :class="{ 'is-active': modifyOn }"
        @click="toggleModify"
      >
        <span class="tool-btn__icon">✋</span>
        <span>形状编辑</span>
      </button>
      <button
        class="tool-btn tool-btn--danger"
        :disabled="!selected.length"
        @click="deleteSelected"
      >
        <span class="tool-btn__icon">🗑️</span>
        <span>删除选中（{{ selected.length }}）</span>
      </button>
      <button class="tool-btn tool-btn--ghost" @click="clearAll">
        <span class="tool-btn__icon">🧹</span>
        <span>清除全部</span>
      </button>

      <p v-if="statusText" class="tool-panel__status">{{ statusText }}</p>
      <p class="tool-panel__hint">按住 Shift 拖拽可框选；Delete 键删除选中图形</p>
    </aside>

    <!-- 右上属性编辑面板：选中图形后出现 -->
    <div v-if="selected.length" class="prop-panel ol-card">
      <h4 class="prop-panel__title">属性编辑</h4>

      <template v-if="selected.length === 1">
        <div class="prop-info">
          <div><span>图形</span><b>{{ info.shape }}</b></div>
          <div><span>几何类型</span><b>{{ info.type }}</b></div>
          <div><span>节点数</span><b>{{ info.nodes }}</b></div>
        </div>
        <label class="prop-field">
          <span>名称</span>
          <input v-model="form.name" type="text" placeholder="输入图形名称" />
        </label>
        <label class="prop-field">
          <span>备注</span>
          <textarea v-model="form.remark" rows="3" placeholder="输入备注信息"></textarea>
        </label>
        <div class="prop-actions">
          <button class="prop-btn prop-btn--primary" @click="saveProps">保存属性</button>
          <button class="prop-btn" @click="resetProps">重置</button>
        </div>
      </template>

      <p v-else class="prop-panel__hint">
        已选中 {{ selected.length }} 个图形，请只选中 1 个图形以编辑属性；批量删除请用左侧「删除选中」。
      </p>
    </div>

    <BaseMapSwitcher :bases="['vec', 'img', 'ter']" @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import Draw, { createBox, createRegularPolygon } from 'ol/interaction/Draw'
import Select from 'ol/interaction/Select'
import Modify from 'ol/interaction/Modify'
import Snap from 'ol/interaction/Snap'
import DragBox from 'ol/interaction/DragBox'
import { shiftKeyOnly } from 'ol/events/condition'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import {
  ZoomSlider, ScaleLine, FullScreen, defaults as defaultControls
} from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)

// 可绘制的图形类型：正方形/长方形都基于 Circle 类型 + geometryFunction 生成
const SHAPES = [
  { key: 'Point', label: '点', icon: '📍', type: 'Point' },
  { key: 'LineString', label: '线', icon: '📏', type: 'LineString' },
  { key: 'Polygon', label: '多边形', icon: '🔷', type: 'Polygon' },
  { key: 'Circle', label: '圆', icon: '⭕', type: 'Circle' },
  { key: 'Square', label: '正方形', icon: '⬜', type: 'Circle', geom: 'regular' },
  { key: 'Rectangle', label: '长方形', icon: '▭', type: 'Circle', geom: 'box' }
]

// ------------------------------ 底图配置 ------------------------------
// 每种底图 = 底图图层 + 对应注记图层
const BASE_PAIRS = {
  vec: ['vec', 'cva'],
  img: ['img', 'cia'],
  ter: ['ter', 'cta']
}
const baseLayers = { vec: null, cva: null, img: null, cia: null, ter: null, cta: null }

let map
let vectorLayer
let source

// 交互实例
let drawInteraction = null
let selectInteraction = null
let dragBoxInteraction = null
let modifyInteraction = null
let snapInteraction = null

// ------------------------------ 响应式状态 ------------------------------
const drawKey = ref('') // 当前绘制图形类型
const selectOn = ref(false) // 是否开启选择（点选 / 框选）
const modifyOn = ref(false) // 是否开启形状编辑
const selected = ref([]) // 当前选中的图形集合
const statusText = ref('')
const form = ref({ name: '', remark: '' })
const info = ref({ shape: '—', type: '—', nodes: 0 })

// ------------------------------ 样式 ------------------------------
// 默认图形样式（黄色）
const defaultStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 204, 51, 0.22)' }),
  stroke: new Stroke({ color: '#f0b429', width: 2.5 }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#f0b429' }),
    stroke: new Stroke({ color: '#fff', width: 2 })
  })
})

// 选中高亮样式（蓝色加粗，与默认黄色形成明显区分）
const selectedStyle = new Style({
  fill: new Fill({ color: 'rgba(37, 99, 235, 0.38)' }),
  stroke: new Stroke({ color: '#2563eb', width: 3.5 }),
  image: new CircleStyle({
    radius: 10,
    fill: new Fill({ color: '#2563eb' }),
    stroke: new Stroke({ color: '#fff', width: 2.5 })
  })
})

// 形状编辑时顶点手柄样式（青色）
const modifyStyle = new Style({
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({ color: '#06b6d4' }),
    stroke: new Stroke({ color: '#fff', width: 2 })
  })
})

// 根据图形类型生成 geometryFunction（正方形 / 长方形）
function buildGeometryFunction(shape) {
  if (shape.geom === 'regular') return createRegularPolygon(4)
  if (shape.geom === 'box') return createBox()
  return undefined
}

// 统计几何节点数
function nodeCount(geometry) {
  const type = geometry.getType()
  const coords = geometry.getCoordinates()
  if (type === 'Point' || type === 'Circle') return 1
  if (type === 'LineString') return coords.length
  if (type === 'Polygon') return coords[0].length
  return 0
}

// ------------------------------ 初始化 ------------------------------
onMounted(() => {
  // 天地图底图（矢量 / 影像 / 地形，各带注记）
  Object.entries(baseLayers).forEach(([type]) => {
    baseLayers[type] = new TileLayer({
      source: new XYZ({ url: buildTdtUrl(type), wrapX: false })
    })
  })
  baseLayers.img.setVisible(false)
  baseLayers.cia.setVisible(false)
  baseLayers.ter.setVisible(false)
  baseLayers.cta.setVisible(false)

  // 空矢量图层：存储绘制的几何图形
  source = new VectorSource()
  vectorLayer = new VectorLayer({ source, style: defaultStyle })

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
      vectorLayer
    ],
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

  // 默认开启「点选 / 框选 + 形状编辑」，绘制后可直接点选图形查看高亮与属性
  enableSelect()

  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  removeDraw()
  removeSelect()
  removeModify()
})

// ------------------------------ 底图切换 ------------------------------
function switchBaseMap(type) {
  const pair = BASE_PAIRS[type] || BASE_PAIRS.vec
  Object.entries(baseLayers).forEach(([key, layer]) => {
    layer.setVisible(pair.includes(key))
  })
}

// ------------------------------ 绘制 ------------------------------
function startDraw(key) {
  // 再次点击同一按钮 → 退出绘制模式，并恢复选择与编辑
  if (drawKey.value === key) {
    removeDraw()
    enableSelect()
    statusText.value = '已退出绘制模式，可点选图形进行编辑'
    return
  }

  // 绘制与选择/编辑互斥，避免单击同时触发两种交互
  removeDraw()
  removeSelect()
  removeModify()
  selectOn.value = false
  modifyOn.value = false

  const shape = SHAPES.find((s) => s.key === key)
  drawKey.value = key

  drawInteraction = new Draw({
    source,
    type: shape.type,
    geometryFunction: buildGeometryFunction(shape),
    style: defaultStyle
  })
  map.addInteraction(drawInteraction)

  // 绘制完成时写入默认属性，便于后续属性编辑
  drawInteraction.on('drawend', (evt) => {
    evt.feature.set('shape', shape.label, true)
    evt.feature.set('name', '', true)
    evt.feature.set('remark', '', true)
    statusText.value = `已绘制${shape.label}，当前共 ${source.getFeatures().length} 个图形`
  })

  statusText.value = `正在绘制：${shape.label}（再次点击按钮可结束绘制）`
}

function removeDraw() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction)
    drawInteraction = null
  }
  drawKey.value = ''
}

// ------------------------------ 选择（点选 + 框选） ------------------------------
// 建立选择交互：Select 负责点选，DragBox 负责 Shift 拖拽框选
function ensureSelect() {
  if (selectInteraction) return

  selectInteraction = new Select({
    layers: [vectorLayer],
    hitTolerance: 6,
    style: selectedStyle // 选中后图形变为蓝色高亮，实现「变色」效果
  })
  // 选中集合变化时同步到面板
  selectInteraction.on('select', syncSelection)
  selectInteraction.getFeatures().on(['add', 'remove'], syncSelection)
  map.addInteraction(selectInteraction)

  // Shift + 拖拽 = 框选
  dragBoxInteraction = new DragBox({ condition: shiftKeyOnly })
  dragBoxInteraction.on('boxend', onBoxEnd)
  map.addInteraction(dragBoxInteraction)
}

// 框选：把框内的所有图形加入选中集合
function onBoxEnd() {
  const extent = dragBoxInteraction.getGeometry().getExtent()
  const hits = []
  // 注意：forEachFeatureIntersectingExtent 的回调一旦返回真值就会提前终止遍历
  // （Array.push 返回新长度，首个元素即返回 1，会只收集到第一个图形），
  // 因此这里必须用块级函数体，确保回调返回 undefined。
  source.forEachFeatureIntersectingExtent(extent, (feature) => {
    hits.push(feature)
  })

  const features = selectInteraction.getFeatures()
  features.clear()
  if (hits.length) features.extend(hits)
  syncSelection()
  statusText.value = hits.length ? `框选到 ${hits.length} 个图形` : '框选区域内没有图形'
}

// 同步选中状态到面板（计数 + 属性表单）
function syncSelection() {
  const features = selectInteraction ? selectInteraction.getFeatures().getArray() : []
  selected.value = features.slice()

  if (features.length === 1) {
    const feature = features[0]
    form.value = {
      name: feature.get('name') || '',
      remark: feature.get('remark') || ''
    }
    info.value = {
      shape: feature.get('shape') || '—',
      type: feature.getGeometry().getType(),
      nodes: nodeCount(feature.getGeometry())
    }
  } else {
    form.value = { name: '', remark: '' }
    info.value = { shape: '—', type: '—', nodes: 0 }
  }
}

// 点选 / 框选 开关
function toggleSelect() {
  if (selectOn.value) {
    removeDraw()
    removeSelect()
    removeModify()
    statusText.value = '已关闭选择与编辑'
  } else {
    removeDraw()
    enableSelect()
    statusText.value = '单击可点选图形，按住 Shift 拖拽可框选'
  }
}

// 开启选择 + 形状编辑
function enableSelect() {
  ensureSelect()
  addModify()
  selectOn.value = true
  modifyOn.value = true
}

function removeSelect() {
  if (selectInteraction) {
    map.removeInteraction(selectInteraction)
    selectInteraction = null
  }
  if (dragBoxInteraction) {
    map.removeInteraction(dragBoxInteraction)
    dragBoxInteraction = null
  }
  selectOn.value = false
  selected.value = []
  form.value = { name: '', remark: '' }
  info.value = { shape: '—', type: '—', nodes: 0 }
}

// ------------------------------ 形状编辑 ------------------------------
// 形状编辑：对选中的图形拖动顶点改变形状，也可整体拖动平移
function addModify() {
  if (modifyInteraction) return
  // 只允许编辑当前选中的图形（含顶点拖拽与整体平移）
  modifyInteraction = new Modify({
    features: selectInteraction.getFeatures(),
    style: modifyStyle
  })
  snapInteraction = new Snap({ source })
  map.addInteraction(modifyInteraction)
  map.addInteraction(snapInteraction)
  modifyOn.value = true
}

function removeModify() {
  if (modifyInteraction) {
    map.removeInteraction(modifyInteraction)
    modifyInteraction = null
  }
  if (snapInteraction) {
    map.removeInteraction(snapInteraction)
    snapInteraction = null
  }
  modifyOn.value = false
}

function toggleModify() {
  if (modifyOn.value) {
    removeModify()
    statusText.value = '已关闭形状编辑'
  } else {
    removeDraw()
    ensureSelect()
    selectOn.value = true
    addModify()
    statusText.value = '先点选图形，再拖动顶点即可修改形状'
  }
}

// ------------------------------ 属性编辑 ------------------------------
function saveProps() {
  if (selected.value.length !== 1) return
  const feature = selected.value[0]
  feature.set('name', form.value.name, true)
  feature.set('remark', form.value.remark, true)
  statusText.value = `已保存属性：${form.value.name || '（未命名）'}`
}

function resetProps() {
  if (selected.value.length !== 1) return
  const feature = selected.value[0]
  form.value = {
    name: feature.get('name') || '',
    remark: feature.get('remark') || ''
  }
  statusText.value = '已还原为当前图形的属性值'
}

// ------------------------------ 删除 ------------------------------
function deleteSelected() {
  if (!selected.value.length) {
    statusText.value = '请先点选或框选要删除的图形'
    return
  }
  const count = selected.value.length
  selected.value.forEach((feature) => source.removeFeature(feature))
  // 删除后必须清空选中集合，避免残留已移除的要素
  if (selectInteraction) selectInteraction.getFeatures().clear()
  syncSelection()
  statusText.value = `已删除 ${count} 个图形`
}

// Delete / Backspace 快捷键删除选中图形
function onKeyDown(evt) {
  if (evt.key !== 'Delete' && evt.key !== 'Backspace') return
  const tag = document.activeElement && document.activeElement.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (!selected.value.length) return
  evt.preventDefault()
  deleteSelected()
}

// ------------------------------ 清除 ------------------------------
function clearAll() {
  removeDraw()
  removeSelect()
  removeModify()
  source.clear()
  statusText.value = '已清除全部图形'
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

/* ------------------------- 左侧功能工具面板 -------------------------
   紧贴缩放滑块右侧的空白区域（left 让开 86px 宽的滑块），
   避免落到滑块下方导致可用高度不足、按钮被挤出可视区域 */
.tool-panel {
  position: absolute;
  left: 116px;
  top: 76px;
  z-index: 20;
  width: 236px;
  max-height: calc(100% - 236px);
  overflow-y: auto;
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tool-panel__title {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--ink);
}
.tool-panel__group {
  margin: 4px 0 1px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--muted);
}
.tool-panel__divider {
  height: 1px;
  margin: 5px 2px;
  background: var(--card-border);
}
.tool-panel__status {
  margin: 2px 0 0;
  color: var(--brand);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
}
.tool-panel__hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

/* 绘制按钮两列网格，压缩面板高度 */
.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

/* ------------------------- 面板内按钮 ------------------------- */
.tool-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #5b7d99 0%, #456280 100%);
  box-shadow: 0 2px 7px rgba(69, 98, 128, 0.3);
  color: #fff;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    filter 0.15s var(--ease);
}
.tool-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(69, 98, 128, 0.42);
}
.tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tool-btn.is-active {
  filter: saturate(1.2) brightness(1.08);
  outline: 2.5px solid rgba(255, 255, 255, 0.9);
  outline-offset: -5px;
}
.tool-btn__icon {
  flex: none;
  width: 17px;
  font-size: 15px;
  text-align: center;
}
.tool-btn--slate {
  background: linear-gradient(180deg, #64748b 0%, #475569 100%);
  box-shadow: 0 2px 7px rgba(71, 85, 105, 0.32);
}
.tool-btn--danger {
  background: linear-gradient(180deg, #b91c1c 0%, #991b1b 100%);
  box-shadow: 0 2px 7px rgba(153, 27, 27, 0.32);
}
.tool-btn--ghost {
  background: #fff;
  box-shadow: 0 2px 7px rgba(15, 23, 42, 0.12);
  color: var(--ink);
}
.tool-btn--ghost:hover:not(:disabled) {
  background: #f8fafc;
}

/* ------------------------- 右上属性编辑面板 ------------------------- */
.prop-panel {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 20;
  width: 292px;
  max-height: calc(100% - 306px);
  overflow-y: auto;
  padding: 14px 16px 14px;
  color: var(--ink);
}
.prop-panel__title {
  margin: 0 0 10px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--card-border);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.4px;
}
.prop-panel__hint {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.6;
}
.prop-info {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.prop-info > div {
  flex: 1;
  padding: 7px 8px;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.07);
  text-align: center;
}
.prop-info span {
  display: block;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}
.prop-info b {
  display: block;
  margin-top: 3px;
  color: var(--brand);
  font-size: 14px;
}
.prop-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-2);
}
.prop-field input,
.prop-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--card-border);
  border-radius: 9px;
  background: #fff;
  color: var(--ink);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  resize: vertical;
}
.prop-field input:focus,
.prop-field textarea:focus {
  outline: 2px solid rgba(37, 99, 235, 0.4);
  outline-offset: 0;
  border-color: var(--brand);
}
.prop-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.prop-btn {
  flex: 1;
  min-height: 38px;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.prop-btn:hover {
  background: #f1f5f9;
  transform: translateY(-1px);
}
.prop-btn--primary {
  border-color: transparent;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
}
.prop-btn--primary:hover {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
}

/* 窄屏下收窄属性面板（不隐藏，保证属性编辑始终可用，避免遮挡地图） */
@media (max-width: 1080px) {
  .prop-panel {
    width: 232px;
    padding: 12px 13px;
  }
  .tool-panel {
    width: 214px;
  }
}
@media (max-width: 860px) {
  .prop-panel {
    width: 200px;
    padding: 11px 12px;
    font-size: 13px;
  }
  .prop-info {
    gap: 6px;
  }
  .prop-info > div {
    padding: 6px 5px;
  }
  .prop-info b {
    font-size: 13px;
  }
}
</style>