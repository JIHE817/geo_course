<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- ==================== 左侧功能工具面板（遵循项目约定：46px按钮 / 22px图标 / 8px间距） ==================== -->
    <aside class="tool-panel ol-card">
      <h4 class="tool-panel__title">实验三·景区管理</h4>
      <p class="tool-panel__source" :class="{ 'is-local': dataSource === 'local' }">
        数据源：{{ dataSource === 'api' ? 'PostGIS 数据库' : dataSource === 'local' ? '本地 GeoJSON（API不可用）' : '检测中…' }}
      </p>

      <p class="tool-panel__group">图层显示</p>
      <button
        class="tool-btn ol-btn"
        :class="{ 'is-active': showCluster }"
        @click="toggleCluster"
      >
        <span class="tool-btn__icon">🎯</span>
        <span>聚合标注</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--amber"
        :class="{ 'is-active': showHeatmap }"
        @click="toggleHeatmap"
      >
        <span class="tool-btn__icon">🔥</span>
        <span>热力图</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--green"
        :class="{ 'is-active': showAreas }"
        @click="toggleAreas"
      >
        <span class="tool-btn__icon">🔷</span>
        <span>面状景区</span>
      </button>

      <p class="tool-panel__group">交互工具</p>
      <button
        class="tool-btn ol-btn"
        :class="{ 'is-active': boxActive }"
        @click="toggleBox"
      >
        <span class="tool-btn__icon">🔲</span>
        <span>拉框查询</span>
      </button>
      <button
        class="tool-btn ol-btn ol-btn--green"
        :class="{ 'is-active': drawActive }"
        @click="toggleDraw"
      >
        <span class="tool-btn__icon">✏️</span>
        <span>绘制景区面</span>
      </button>

      <div class="tool-panel__divider"></div>

      <button class="tool-btn ol-btn ol-btn--ghost tool-btn--clear" @click="clearBox">
        <span class="tool-btn__icon">🧹</span>
        <span>清除拉框结果</span>
      </button>
      <p class="tool-panel__hint">
        拉框：激活后在地图上按住左键拖出矩形<br />
        放大到 14 级及以上自动解聚显示单点
      </p>
    </aside>

    <!-- ==================== 右上角：热力图参数面板（模糊度 / 半径滑块实时调节） ==================== -->
    <div v-if="showHeatmap" class="heat-panel ol-card">
      <h4 class="heat-panel__title">热力图参数</h4>
      <label class="heat-field">
        <span>模糊度 blur：<b>{{ heatBlur }}</b></span>
        <input type="range" min="0" max="50" step="1" v-model.number="heatBlur" @input="onHeatBlurChange" />
      </label>
      <label class="heat-field">
        <span>半径 radius：<b>{{ heatRadius }}</b> px</span>
        <input type="range" min="2" max="50" step="1" v-model.number="heatRadius" @input="onHeatRadiusChange" />
      </label>
    </div>

    <!-- ==================== 景点弹窗（ol.Overlay）：聚合点显示列表 / 单点显示详情 ==================== -->
    <div ref="spotPopupEl" class="ol-popup spot-popup">
      <template v-if="spotPopup.type === 'detail'">
        <button class="ol-popup__close" @click="closeSpotPopup">✕</button>
        <div class="spot-popup__head">
          <img
            class="spot-popup__img"
            :src="spotPopup.data.image_url"
            alt="景点图片"
            @error="onImgError"
          />
          <div class="spot-popup__meta">
            <h4 class="spot-popup__name">{{ spotPopup.data.name }}</h4>
            <span class="spot-popup__tag" :class="'cat-' + spotPopup.data.category">{{
              spotPopup.data.category
            }}</span>
            <p class="spot-popup__addr">📍 {{ spotPopup.data.address }}</p>
          </div>
        </div>
        <p class="spot-popup__desc">{{ spotPopup.data.description }}</p>
        <p class="spot-popup__row">
          <span>🎟️ 门票：{{ Number(spotPopup.data.ticket) > 0 ? spotPopup.data.ticket + ' 元' : '免费' }}</span>
          <span>🕐 {{ spotPopup.data.open_hours }}</span>
        </p>
      </template>

      <template v-else-if="spotPopup.type === 'cluster'">
        <button class="ol-popup__close" @click="closeSpotPopup">✕</button>
        <h4 class="spot-popup__name">该聚合点含 {{ spotPopup.items.length }} 个景点</h4>
        <ul class="spot-popup__list">
          <li
            v-for="(it, i) in spotPopup.items"
            :key="i"
            @click="zoomToClusterItem(it)"
          >
            <span class="spot-popup__tag small" :class="'cat-' + it.category">{{ it.category }}</span>
            {{ it.name }}
          </li>
        </ul>
      </template>
    </div>

    <!-- ==================== 面状景区管理菜单（ol.Overlay）：查看 / 编辑 / 删除 ==================== -->
    <div ref="areaPopupEl" class="ol-popup area-popup">
      <template v-if="areaPopup.visible && areaPopup.data">
        <button class="ol-popup__close" @click="closeAreaPopup">✕</button>

        <!-- 菜单态 -->
        <div v-if="areaPopup.mode === 'menu'">
          <h4 class="area-popup__name">{{ areaPopup.data.name }}</h4>
          <p class="area-popup__sub">面积：{{ formatAreaM2(areaPopup.data.area_m2) }}</p>
          <div class="area-popup__menu">
            <button class="area-btn area-btn--blue" @click="showAreaDetail">查看详情</button>
            <button class="area-btn area-btn--amber" @click="startAreaEdit">编辑属性</button>
            <button class="area-btn area-btn--red" @click="removeArea">删除</button>
          </div>
        </div>

        <!-- 详情态 -->
        <div v-else-if="areaPopup.mode === 'detail'">
          <h4 class="area-popup__name">{{ areaPopup.data.name }}</h4>
          <img
            v-if="areaPopup.data.image_url"
            class="area-popup__img"
            :src="areaPopup.data.image_url"
            alt="景区图片"
            @error="onImgError"
          />
          <p class="area-popup__sub">面积：{{ formatAreaM2(areaPopup.data.area_m2) }}</p>
          <p class="area-popup__desc">{{ areaPopup.data.description || '（暂无描述）' }}</p>
          <button class="area-btn area-btn--ghost" @click="areaPopup.mode = 'menu'">返回</button>
        </div>

        <!-- 编辑态 -->
        <div v-else-if="areaPopup.mode === 'edit'">
          <h4 class="area-popup__name">编辑景区属性</h4>
          <label class="area-field">
            <span>名称</span>
            <input v-model="areaForm.name" type="text" placeholder="景区名称" />
          </label>
          <label class="area-field">
            <span>描述</span>
            <textarea v-model="areaForm.description" rows="3" placeholder="景区描述"></textarea>
          </label>
          <div class="area-popup__menu">
            <button class="area-btn area-btn--blue" @click="saveAreaEdit">保存</button>
            <button class="area-btn area-btn--ghost" @click="areaPopup.mode = 'menu'">取消</button>
          </div>
        </div>
      </template>
    </div>

    <!-- ==================== 拉框统计结果面板（右下角）：总数 + 分组统计 + 列表 ==================== -->
    <div v-if="boxResult" class="box-panel ol-card">
      <button class="box-panel__close" @click="clearBox">✕</button>
      <h4 class="box-panel__title">拉框查询结果</h4>
      <p class="box-panel__total">共选中 <b>{{ boxResult.total }}</b> 个景点</p>
      <div class="box-panel__stats">
        <span v-for="s in boxResult.stats" :key="s.category" class="box-chip" :class="'cat-' + s.category">
          {{ s.category }}：{{ s.cnt }} 个
        </span>
        <span v-if="!boxResult.stats.length" class="box-panel__empty">框内没有景点</span>
      </div>
      <ul class="box-panel__list">
        <li v-for="(it, i) in boxResult.items" :key="i" @click="locateSpot(it)">
          <span class="spot-popup__tag small" :class="'cat-' + it.category">{{ it.category }}</span>
          {{ it.name }}
        </li>
      </ul>
      <p class="box-panel__source">{{ boxResult.source === 'api' ? '统计来自 PostGIS 空间查询' : '统计来自前端 extent 过滤（API 不可用）' }}</p>
    </div>

    <!-- ==================== 绘制完成后的录入表单（居中模态） ==================== -->
    <div v-if="drawForm.visible" class="modal-mask">
      <div class="modal ol-card">
        <h4 class="modal__title">录入面状景区</h4>
        <p class="modal__hint">已绘制景区边界，请填写名称与描述后保存到 scenic_areas 表</p>
        <label class="area-field">
          <span>景区名称 <i>*</i></span>
          <input v-model="drawForm.name" type="text" placeholder="例如：锦江夜游片区" />
        </label>
        <label class="area-field">
          <span>景区描述</span>
          <textarea v-model="drawForm.description" rows="3" placeholder="景区简介（可选）"></textarea>
        </label>
        <div class="modal__actions">
          <button class="area-btn area-btn--blue" :disabled="!drawForm.name.trim()" @click="submitDrawForm">保存入库</button>
          <button class="area-btn area-btn--ghost" @click="cancelDrawForm">取消</button>
        </div>
      </div>
    </div>

    <!-- 底图切换 -->
    <BaseMapSwitcher :bases="['vec', 'img', 'ter']" @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { Map, View, Overlay } from 'ol'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import Heatmap from 'ol/layer/Heatmap'
import VectorSource from 'ol/source/Vector'
import Cluster from 'ol/source/Cluster'
import XYZ from 'ol/source/XYZ'
import GeoJSON from 'ol/format/GeoJSON'
import Draw from 'ol/interaction/Draw'
import DragBox from 'ol/interaction/DragBox'
import Feature from 'ol/Feature'
import { fromLonLat, toLonLat } from 'ol/proj'
import { getArea } from 'ol/sphere'
import { Style, Fill, Stroke, Circle as CircleStyle, Text } from 'ol/style'
import { ZoomSlider, ScaleLine, FullScreen, defaults as defaultControls } from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

// ------------------------------ 常量 ------------------------------
// 等级 → 图标颜色（5A 橙红 / 4A 金黄 / 3A 蓝 / 2A及以下 绿灰）
const CATEGORY_COLOR = { '5A': '#E4572E', '4A': '#F2A541', '3A': '#3D8DAE', '2A': '#7A9E7E', '1A': '#9E9E9E' }
// 缺图兜底：内联 SVG 占位图（图片下载失败时替换，避免裂图）
const IMG_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-size="14" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">暂无图片</text></svg>`
  )
// 解聚阈值：zoom ≥ 14 时不聚合
const DECLUSTER_ZOOM = 14
// 聚合距离（像素）
const CLUSTER_DISTANCE = 42

// ------------------------------ DOM 引用 ------------------------------
const mapContainer = ref(null)
const spotPopupEl = ref(null)
const areaPopupEl = ref(null)

// ------------------------------ 响应式状态 ------------------------------
const dataSource = ref('checking') // 'api' 数据库 | 'local' 本地回退 | 'checking' 检测中
const showCluster = ref(true)
const showHeatmap = ref(false)
const showAreas = ref(true)
const boxActive = ref(false)
const drawActive = ref(false)
const heatBlur = ref(15)
const heatRadius = ref(10)

// 景点弹窗：type = 'detail' 单点详情 | 'cluster' 聚合列表
const spotPopup = reactive({ visible: false, type: '', data: null, items: [] })
// 面景区菜单：mode = 'menu' | 'detail' | 'edit'
// 注意：OL 要素对象不放入 reactive（避免 Proxy 包装干扰 OpenLayers 内部状态），
// 当前操作的面要素用模块变量 currentAreaFeature 持有
const areaPopup = reactive({ visible: false, mode: 'menu', data: null })
const areaForm = reactive({ name: '', description: '' })
// 拉框统计结果
const boxResult = ref(null)
// 绘制录入表单（要素本体存模块变量 pendingAreaFeature）
const drawForm = reactive({ visible: false, name: '', description: '' })

// ------------------------------ 非响应式地图对象 ------------------------------
let map
let spotsSource // 景点原始矢量源（60 个点，热力图 / 拉框过滤都用它）
let clusterSource // 聚合源（包装 spotsSource）
let clusterLayer
let heatmapLayer
let areasSource // 面状景区源
let areasLayer
let boxSource // 拉框矩形展示源
let boxLayer
let drawInteraction
let dragBoxInteraction
let spotOverlay
let areaOverlay
let nextAreaLocalId = 1000 // 本地模式下新增景区的临时 id（避开种子数据 1~3）
let currentAreaFeature = null // 当前正在查看/编辑/删除的面要素（OL 对象）
let pendingAreaFeature = null // 刚绘制完成、等待表单录入的面要素（OL 对象）

// 底图（天地图三组）
const baseLayers = { vec: null, cva: null, img: null, cia: null, ter: null, cta: null }
const BASE_PAIRS = { vec: ['vec', 'cva'], img: ['img', 'cia'], ter: ['ter', 'cta'] }

// ------------------------------ 样式：等级图标 / 聚合气泡 / 面 / 拉框 ------------------------------
// 单个景点的等级图标（Canvas 圆点 + 等级文字），按 category 颜色区分
function spotIconStyle(category) {
  const color = CATEGORY_COLOR[category] || '#3D8DAE'
  return new Style({
    image: new CircleStyle({
      radius: 12,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 2.5 })
    }),
    text: new Text({
      text: category,
      font: 'bold 10px sans-serif',
      fill: new Fill({ color: '#fff' }),
      offsetY: 0,
      textAlign: 'center'
    })
  })
}
// 预创建常用等级样式，避免每次渲染重建对象
const spotStyles = {
  '5A': spotIconStyle('5A'),
  '4A': spotIconStyle('4A'),
  '3A': spotIconStyle('3A'),
  '2A': spotIconStyle('2A'),
  '1A': spotIconStyle('1A')
}

// 聚合样式：多个点 → 数量气泡；单个点 → 等级图标
function clusterStyle(feature) {
  const features = feature.get('features')
  if (!features || features.length !== 1) {
    // 聚合气泡：半径随数量增大（封顶），白字数量
    const n = features ? features.length : 0
    return new Style({
      image: new CircleStyle({
        radius: Math.min(13 + n, 26),
        fill: new Fill({ color: 'rgba(37, 99, 235, 0.88)' }),
        stroke: new Stroke({ color: '#fff', width: 2.5 })
      }),
      text: new Text({
        text: String(n),
        font: 'bold 13px sans-serif',
        fill: new Fill({ color: '#fff' })
      })
    })
  }
  // 解聚后的单点：按等级取对应图标
  const cat = features[0].get('category') || '4A'
  return spotStyles[cat] || spotStyles['4A']
}

// 面状景区样式（青色半透明填充）
const areaStyle = new Style({
  fill: new Fill({ color: 'rgba(14, 165, 233, 0.18)' }),
  stroke: new Stroke({ color: '#0ea5e9', width: 2.2 })
})
// 拉框矩形样式（红色虚线）
const boxStyle = new Style({
  fill: new Fill({ color: 'rgba(239, 68, 68, 0.08)' }),
  stroke: new Stroke({ color: '#ef4444', width: 2, lineDash: [8, 6] })
})

// ------------------------------ 初始化 ------------------------------
onMounted(async () => {
  // 天地图底图：默认矢量 + 注记
  Object.keys(baseLayers).forEach((k) => {
    baseLayers[k] = new TileLayer({ source: new XYZ({ url: buildTdtUrl(k), wrapX: false }) })
  })
  baseLayers.img.setVisible(false)
  baseLayers.cia.setVisible(false)
  baseLayers.ter.setVisible(false)
  baseLayers.cta.setVisible(false)

  // ---- 1. 景点源与聚合层 ----
  spotsSource = new VectorSource()
  // 聚合源包装原始源：distance 越大越容易合并
  clusterSource = new Cluster({ source: spotsSource, distance: CLUSTER_DISTANCE })
  clusterLayer = new VectorLayer({ source: clusterSource, style: clusterStyle })

  // ---- 2. 热力图层（初始隐藏；权重按等级：5A 最热） ----
  heatmapLayer = new Heatmap({
    source: spotsSource,
    blur: heatBlur.value,
    radius: heatRadius.value,
    weight: (f) => {
      const c = f.get('category')
      return c === '5A' ? 1 : c === '4A' ? 0.75 : 0.45
    },
    visible: false
  })

  // ---- 3. 面状景区层 ----
  areasSource = new VectorSource()
  areasLayer = new VectorLayer({ source: areasSource, style: areaStyle })

  // ---- 4. 拉框矩形展示层 ----
  boxSource = new VectorSource()
  boxLayer = new VectorLayer({ source: boxSource, style: boxStyle })

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
      areasLayer,
      heatmapLayer,
      clusterLayer,
      boxLayer
    ],
    view: new View({
      center: fromLonLat([104.06, 30.66]), // 成都城区
      zoom: 10,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  map.addControl(new ZoomSlider())
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))
  map.addControl(new FullScreen())

  // ---- 弹窗 Overlay（跟随坐标的 HTML 浮层） ----
  spotOverlay = new Overlay({ element: spotPopupEl.value, positioning: 'bottom-center', offset: [0, -18], autoPan: true })
  areaOverlay = new Overlay({ element: areaPopupEl.value, positioning: 'bottom-center', offset: [0, -10], autoPan: true })
  map.addOverlay(spotOverlay)
  map.addOverlay(areaOverlay)

  // ---- 地图事件 ----
  map.on('singleclick', onMapClick)
  // 缩放结束：根据 zoom 动态调整聚合距离（≥14 解聚）
  map.on('moveend', updateClusterDistance)

  // ---- 数据加载（先探测 API，失败回退本地 GeoJSON） ----
  await initData()
})

onBeforeUnmount(() => {
  // 交互与图层清理，防止重复挂载时残留
  if (dragBoxInteraction) map.removeInteraction(dragBoxInteraction)
  if (drawInteraction) map.removeInteraction(drawInteraction)
  map.setTarget(null)
})

// ------------------------------ 数据源探测与加载 ------------------------------
// 探测后端 /api/health：可用走 PostGIS；不可用回退本地 GeoJSON（项目既有降级模式）
async function initData() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000) // 3 秒超时，避免页面卡在检测
    const res = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(timer)
    const health = await res.json()
    if (health && health.db === true) {
      dataSource.value = 'api'
    } else {
      dataSource.value = 'local'
    }
  } catch {
    dataSource.value = 'local' // 服务未启动 / 超时 → 本地回退
  }

  const [spotsOk, areasOk] = await Promise.all([loadSpots(), loadAreas()])
  if (spotsOk) console.info(`[实验三] 景点数据加载完成（${dataSource.value === 'api' ? 'PostGIS' : '本地'}）`)
  if (!areasOk) console.warn('[实验三] 面状景区数据加载失败')
  updateClusterDistance()
}

// 读取 GeoJSON（手动 fetch + readFeatures，显式声明投影，避免 VectorSource url 静默失败）
function readGeo(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((geo) => new GeoJSON().readFeatures(geo, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }))
}

// 加载 60 个景点：API 模式取自 PostGIS；本地模式读 public/data/lab3_spots.json
async function loadSpots() {
  try {
    if (dataSource.value === 'api') {
      const features = await readGeo('/api/spots')
      spotsSource.addFeatures(features)
    } else {
      const features = await readGeo('/data/lab3_spots.json')
      spotsSource.addFeatures(features)
    }
    return true
  } catch (err) {
    console.error('[实验三] 景点加载失败：', err)
    return false
  }
}

// 加载面状景区
async function loadAreas() {
  try {
    // API 模式走 PostGIS；本地模式读回退 GeoJSON
    const url = dataSource.value === 'api' ? '/api/areas' : '/data/lab3_areas.json'
    const features = await readGeo(url)
    // 本地回退数据可能缺 area_m2，用球面面积补算（与数据库触发器口径一致）
    for (const f of features) {
      if (f.get('area_m2') == null) {
        f.set('area_m2', getArea(f.getGeometry(), { projection: 'EPSG:3857' }))
      }
    }
    areasSource.addFeatures(features)
    return true
  } catch (err) {
    console.error('[实验三] 景区面加载失败：', err)
    return false
  }
}

// ------------------------------ 聚合：缩放级别驱动解聚 ------------------------------
function updateClusterDistance() {
  if (!clusterSource) return
  const zoom = Math.round(map.getView().getZoom())
  // zoom ≥ 14：distance 设 0（不聚合），单点按等级显示不同图标
  clusterSource.setDistance(zoom >= DECLUSTER_ZOOM ? 0 : CLUSTER_DISTANCE)
}

// ------------------------------ 地图点击：景点弹窗 / 景区菜单 ------------------------------
function onMapClick(evt) {
  // 绘制模式下点击由 Draw 交互处理，不弹窗
  if (drawActive.value) {
    closeSpotPopup()
    closeAreaPopup()
    return
  }
  // 精确坐标点击检测（绕开聚合层的像素半径误差）
  const spotFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { layerFilter: (l) => l === clusterLayer })
  if (spotFeature) {
    openSpotPopup(spotFeature, evt.coordinate)
    closeAreaPopup()
    return
  }
  const areaFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { layerFilter: (l) => l === areasLayer })
  if (areaFeature) {
    openAreaPopup(areaFeature, evt.coordinate)
    closeSpotPopup()
    return
  }
  // 点空白处：关闭所有弹窗
  closeSpotPopup()
  closeAreaPopup()
}

// 从景点要素构造详情弹窗所需的纯数据（OL 对象不进响应式状态）
function buildSpotDetail(f) {
  return {
    name: f.get('name'),
    category: f.get('category'),
    description: f.get('description'),
    address: f.get('address'),
    image_url: f.get('image_url') || IMG_PLACEHOLDER,
    ticket: f.get('ticket'),
    open_hours: f.get('open_hours')
  }
}

// 景点弹窗：聚合点（>1）显示列表；单点显示详情
function openSpotPopup(feature, coordinate) {
  const inner = feature.get('features') // Cluster 包装的原始要素数组
  if (inner.length > 1) {
    spotPopup.type = 'cluster'
    spotPopup.items = inner.map((f) => ({
      name: f.get('name'),
      category: f.get('category'),
      coord: f.getGeometry().getCoordinates(),
      detail: buildSpotDetail(f)
    }))
  } else {
    spotPopup.type = 'detail'
    spotPopup.data = buildSpotDetail(inner[0])
  }
  spotPopup.visible = true
  spotOverlay.setPosition(coordinate)
}

function closeSpotPopup() {
  spotPopup.visible = false
  spotPopup.type = ''
  spotPopup.items = []
  spotPopup.data = null
  spotOverlay.setPosition(undefined)
}

// 聚合列表项 → 放大到该点并展示详情
function zoomToClusterItem(item) {
  map.getView().animate({ center: item.coord, zoom: Math.max(map.getView().getZoom(), 15), duration: 300 })
  // 直接复用详情弹窗展示该景点
  spotPopup.type = 'detail'
  spotPopup.data = item.detail
  spotOverlay.setPosition(item.coord)
}

// 面状景区管理菜单
function openAreaPopup(feature, coordinate) {
  currentAreaFeature = feature
  areaPopup.mode = 'menu'
  areaPopup.data = {
    id: feature.get('id'),
    name: feature.get('name'),
    description: feature.get('description'),
    image_url: feature.get('image_url'),
    area_m2: feature.get('area_m2')
  }
  areaPopup.visible = true
  areaOverlay.setPosition(coordinate)
}

function closeAreaPopup() {
  areaPopup.visible = false
  areaPopup.mode = 'menu'
  currentAreaFeature = null
  areaPopup.data = null
  areaOverlay.setPosition(undefined)
}

function showAreaDetail() {
  areaPopup.mode = 'detail'
}

// 编辑属性：先回填表单
function startAreaEdit() {
  areaForm.name = areaPopup.data.name || ''
  areaForm.description = areaPopup.data.description || ''
  areaPopup.mode = 'edit'
}

// 保存编辑：API 模式 PUT 到数据库；本地模式直接改要素属性
async function saveAreaEdit() {
  const f = currentAreaFeature
  if (!f) return
  const id = f.get('id')
  f.set('name', areaForm.name.trim())
  f.set('description', areaForm.description)
  areaPopup.data.name = areaForm.name.trim()
  areaPopup.data.description = areaForm.description
  if (dataSource.value === 'api') {
    try {
      const res = await fetch(`/api/areas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: areaForm.name.trim(), description: areaForm.description })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      console.info(`[实验三] 景区 id=${id} 属性已同步到数据库`)
    } catch (err) {
      console.error('[实验三] 景区属性同步数据库失败：', err)
    }
  }
  areaPopup.mode = 'menu'
}

// 删除面：API 模式 DELETE；本地模式移除要素
async function removeArea() {
  const f = currentAreaFeature
  if (!f) return
  const id = f.get('id')
  if (!window.confirm(`确定删除景区「${areaPopup.data.name}」吗？`)) return
  if (dataSource.value === 'api') {
    try {
      const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      console.info(`[实验三] 景区 id=${id} 已从数据库删除`)
    } catch (err) {
      console.error('[实验三] 景区删除同步数据库失败：', err)
      return // 数据库删除失败则不移除前端要素，保持两侧一致
    }
  }
  areasSource.removeFeature(f)
  closeAreaPopup()
}

// ------------------------------ 图层开关 ------------------------------
function toggleCluster() {
  showCluster.value = !showCluster.value
  clusterLayer.setVisible(showCluster.value)
}
function toggleHeatmap() {
  showHeatmap.value = !showHeatmap.value
  heatmapLayer.setVisible(showHeatmap.value)
}
function toggleAreas() {
  showAreas.value = !showAreas.value
  areasLayer.setVisible(showAreas.value)
}

// 热力图滑块：实时绑定 setBlur / setRadius
function onHeatBlurChange() {
  heatmapLayer.setBlur(heatBlur.value)
}
function onHeatRadiusChange() {
  heatmapLayer.setRadius(heatRadius.value)
}

// ------------------------------ 拉框查询与统计 ------------------------------
function toggleBox() {
  boxActive.value = !boxActive.value
  if (boxActive.value) {
    stopDraw()
    // 拉框交互：boxend 中取范围执行空间查询
    dragBoxInteraction = new DragBox()
    dragBoxInteraction.on('boxend', onBoxEnd)
    map.addInteraction(dragBoxInteraction)
  } else {
    if (dragBoxInteraction) map.removeInteraction(dragBoxInteraction)
    dragBoxInteraction = null
  }
}

function onBoxEnd() {
  // 3857 像素范围 → 4326 经纬度包围盒（PostGIS 查询条件）
  const extent = dragBoxInteraction.getGeometry().getExtent()
  const minLonLat = toLonLat([extent[0], extent[1]])
  const maxLonLat = toLonLat([extent[2], extent[3]])
  const bbox = { minx: minLonLat[0], miny: minLonLat[1], maxx: maxLonLat[0], maxy: maxLonLat[1] }

  // 展示拉框矩形（保留在地图上直到点击"清除拉框结果"）
  boxSource.clear()
  boxSource.addFeature(new Feature({ geometry: dragBoxInteraction.getGeometry().clone() }))

  // 执行查询：API 模式 → PostGIS 空间查询；本地模式 → 前端 extent 过滤
  if (dataSource.value === 'api') {
    queryByApi(bbox)
  } else {
    queryByFrontend(extent)
  }
}

async function queryByApi(bbox) {
  try {
    const qs = `minx=${bbox.minx}&miny=${bbox.miny}&maxx=${bbox.maxx}&maxy=${bbox.maxy}`
    const res = await fetch(`/api/spots/bbox?${qs}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    // 列表项带坐标（从 FeatureCollection 中取），供点击定位
    const items = data.features.map((f) => {
      const coord = fromLonLat(f.geometry.coordinates)
      return { name: f.properties.name, category: f.properties.category, coord }
    })
    boxResult.value = { total: data.total, stats: data.stats, items, source: 'api' }
  } catch (err) {
    console.error('[实验三] bbox 查询失败，改用前端过滤：', err)
    // API 意外失败（服务中途关闭等）：降级为前端过滤
    const extent = dragBoxInteraction ? dragBoxInteraction.getGeometry().getExtent() : null
    if (extent) queryByFrontend(extent)
  }
}

// 前端回退：用 ol.extent 过滤已加载的 Feature
function queryByFrontend(extent) {
  const hits = []
  spotsSource.forEachFeatureIntersectingExtent(extent, (f) => {
    hits.push({
      name: f.get('name'),
      category: f.get('category'),
      coord: f.getGeometry().getCoordinates()
    })
  })
  // 按 category 分组统计
  const statMap = {}
  hits.forEach((h) => {
    statMap[h.category] = (statMap[h.category] || 0) + 1
  })
  const stats = Object.keys(statMap)
    .sort((a, b) => b.localeCompare(a))
    .map((k) => ({ category: k, cnt: statMap[k] }))
  boxResult.value = { total: hits.length, stats, items: hits, source: 'local' }
}

// 统计面板列表项 → 定位到景点并打开详情
function locateSpot(item) {
  map.getView().animate({ center: item.coord, zoom: Math.max(map.getView().getZoom(), 15), duration: 300 })
  // 从源中找到对应要素展示详情弹窗
  const f = spotsSource.getClosestFeatureToCoordinate(item.coord)
  if (f) {
    spotPopup.type = 'detail'
    spotPopup.data = buildSpotDetail(f)
    spotOverlay.setPosition(item.coord)
  }
}

function clearBox() {
  boxResult.value = null
  boxSource.clear()
}

// ------------------------------ 绘制面状景区并录入 ------------------------------
function toggleDraw() {
  drawActive.value = !drawActive.value
  if (drawActive.value) {
    // 互斥：绘制时关闭拉框
    if (boxActive.value) toggleBox()
    drawInteraction = new Draw({ source: areasSource, type: 'Polygon', style: areaStyle })
    drawInteraction.on('drawend', (evt) => {
      // 绘制完成：暂存要素，弹出表单录入名称与描述
      pendingAreaFeature = evt.feature
      drawForm.name = ''
      drawForm.description = ''
      drawForm.visible = true
    })
    map.addInteraction(drawInteraction)
  } else {
    stopDraw()
  }
}

function stopDraw() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction)
    drawInteraction = null
  }
  drawActive.value = false
}

// 表单确认：保存到数据库（或本地状态），并写入要素属性
async function submitDrawForm() {
  const f = pendingAreaFeature
  if (!f) return
  const name = drawForm.name.trim()
  f.set('name', name)
  f.set('description', drawForm.description)

  if (dataSource.value === 'api') {
    try {
      // 几何 3857 → 4326 GeoJSON 提交 PostGIS
      const writer = new GeoJSON()
      const geo4326 = JSON.parse(
        writer.writeGeometry(f.getGeometry().clone().transform('EPSG:3857', 'EPSG:4326'))
      )
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: drawForm.description, geometry: geo4326 })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const saved = await res.json()
      f.set('id', saved.properties.id)
      f.set('area_m2', saved.properties.area_m2)
      f.set('image_url', '')
      console.info(`[实验三] 景区「${name}」已入库 id=${saved.properties.id}`)
    } catch (err) {
      console.error('[实验三] 景区入库失败：', err)
      alert('保存到数据库失败：' + err.message)
      areasSource.removeFeature(f) // 入库失败移除，保持两侧一致
      pendingAreaFeature = null
      closeDrawForm()
      stopDraw() // 保存失败同样退出绘制模式
      return
    }
  } else {
    // 本地模式：分配临时 id 与球面面积（平方米）
    f.set('id', nextAreaLocalId++)
    f.set('image_url', '')
    f.set('area_m2', Math.round(getArea(f.getGeometry())))
  }
  pendingAreaFeature = null
  closeDrawForm()
  stopDraw() // 保存后自动退出绘制模式，便于立即点击面进行管理
}

function cancelDrawForm() {
  // 取消录入：移除刚画的要素并退出绘制模式
  if (pendingAreaFeature) areasSource.removeFeature(pendingAreaFeature)
  pendingAreaFeature = null
  closeDrawForm()
  stopDraw()
}

function closeDrawForm() {
  drawForm.visible = false
  drawForm.name = ''
  drawForm.description = ''
}

// ------------------------------ 其他 ------------------------------
// 图片加载失败 → 占位图兜底
function onImgError(e) {
  e.target.src = IMG_PLACEHOLDER
}

// 面积格式化（平方米 → 平方公里）
function formatAreaM2(m2) {
  if (m2 == null || isNaN(Number(m2))) return '未知'
  const v = Number(m2)
  return v > 1_000_000 ? (v / 1_000_000).toFixed(2) + ' km²' : Math.round(v).toLocaleString() + ' m²'
}

// 底图切换
function switchBaseMap(type) {
  const pair = BASE_PAIRS[type] || BASE_PAIRS.vec
  Object.keys(baseLayers).forEach((k) => baseLayers[k].setVisible(pair.includes(k)))
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

/* ==================== 左侧工具面板（沿用项目约定） ==================== */
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
.tool-panel__source {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: #16a34a;
}
.tool-panel__source.is-local {
  color: #d97706;
}
.tool-panel__group {
  margin: 10px 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: var(--muted);
}
.tool-panel__divider {
  height: 1px;
  margin: 6px 2px;
  background: var(--card-border);
}
.tool-panel__hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
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
.tool-btn--clear {
  min-height: 38px;
  font-size: 14px;
  color: var(--ink-2);
}

/* ==================== 右上热力图参数面板 ==================== */
.heat-panel {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 20;
  width: 232px;
  padding: 14px 16px;
}
.heat-panel__title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.heat-field {
  display: block;
  margin-bottom: 12px;
}
.heat-field span {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}
.heat-field b {
  color: #d97706;
}
.heat-field input[type='range'] {
  width: 100%;
  accent-color: #f59e0b;
}

/* ==================== ol.Overlay 弹窗通用 ==================== */
.ol-popup {
  min-width: 240px;
  max-width: 300px;
  padding: 12px 14px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.22);
  font-size: 13px;
  color: var(--ink);
}
.ol-popup__close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}
.ol-popup__close:hover {
  background: #e2e8f0;
  color: #334155;
}

/* ==================== 景点详情弹窗 ==================== */
.spot-popup__head {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
.spot-popup__img {
  flex: none;
  width: 96px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  background: #e2e8f0;
}
.spot-popup__meta {
  min-width: 0;
  padding-right: 18px;
}
.spot-popup__name {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--ink);
}
.spot-popup__addr {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.spot-popup__desc {
  margin: 0 0 8px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.spot-popup__row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.spot-popup__list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
}
.spot-popup__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  line-height: 1.4;
}
.spot-popup__list li:hover {
  background: rgba(37, 99, 235, 0.08);
}

/* 等级徽章配色 */
.spot-popup__tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.spot-popup__tag.small {
  font-size: 10px;
  padding: 0 6px;
}
.cat-5A { background: #E4572E; }
.cat-4A { background: #F2A541; }
.cat-3A { background: #3D8DAE; }
.cat-2A { background: #7A9E7E; }
.cat-1A { background: #9E9E9E; }

/* ==================== 面状景区菜单弹窗 ==================== */
.area-popup__name {
  margin: 0 0 6px;
  padding-right: 20px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.area-popup__sub {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.area-popup__img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #e2e8f0;
}
.area-popup__desc {
  margin: 0 0 8px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.area-popup__menu {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.area-btn {
  flex: 1;
  min-height: 34px;
  border: 0;
  border-radius: 9px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
}
.area-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.area-btn--blue { background: linear-gradient(180deg, #3b82f6, #2563eb); }
.area-btn--amber { background: linear-gradient(180deg, #f59e0b, #d97706); }
.area-btn--red { background: linear-gradient(180deg, #ef4444, #dc2626); }
.area-btn--ghost { background: #f1f5f9; color: var(--ink); }
.area-field {
  display: block;
  margin-bottom: 10px;
}
.area-field span {
  display: block;
  margin-bottom: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}
.area-field span i {
  color: #dc2626;
  font-style: normal;
}
.area-field input,
.area-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 9px;
  border: 1px solid var(--card-border);
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  color: var(--ink);
  resize: vertical;
}
.area-field input:focus,
.area-field textarea:focus {
  outline: 2px solid rgba(37, 99, 235, 0.4);
  border-color: var(--brand);
}

/* ==================== 拉框统计面板（右下角） ==================== */
.box-panel {
  position: absolute;
  right: 16px;
  bottom: 26px;
  z-index: 20;
  width: 252px;
  max-height: 55%;
  overflow-y: auto;
  padding: 13px 15px;
}
.box-panel__close {
  position: absolute;
  top: 9px;
  right: 11px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}
.box-panel__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.box-panel__total {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--ink-2);
}
.box-panel__total b {
  color: #dc2626;
  font-size: 16px;
}
.box-panel__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.box-chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
}
.box-panel__empty {
  font-size: 12.5px;
  color: var(--muted);
}
.box-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 180px;
  overflow-y: auto;
}
.box-panel__list li {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 6px;
  border-radius: 7px;
  font-size: 12.5px;
  cursor: pointer;
}
.box-panel__list li:hover {
  background: rgba(239, 68, 68, 0.08);
}
.box-panel__source {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--muted);
}

/* ==================== 绘制录入模态 ==================== */
.modal-mask {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
}
.modal {
  width: 320px;
  padding: 18px 20px;
}
.modal__title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.modal__hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--muted);
}
.modal__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
