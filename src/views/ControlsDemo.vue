<template>
  <div class="wrapper">
    <!-- 地图容器 -->
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 鼠标位置显示容器 -->
    <div id="mousePosition" class="mouse-position"></div>

    <!-- 比例尺容器（可选，若不指定则按主题样式定位） -->
    <div id="scalebar"></div>

    <!-- 鹰眼容器 -->
    <div ref="overviewMap" class="overview-map"></div>

    <!-- 自定义操作按钮：顶部居中，避开左侧缩放滑块与右上角图层面板 -->
    <div class="toolbar ol-toolbar ol-card">
      <button class="ol-btn ol-btn--green" @click="resetView">
        <span class="ol-btn__icon">🎯</span>复位
      </button>
      <button class="ol-btn ol-btn--amber" @click="rotateMap">
        <span class="ol-btn__icon">🧭</span>旋转
      </button>
    </div>

    <!-- 图层列表 -->
    <div class="layer-panel ol-card ol-layer-panel">
      <h4 class="ol-layer-panel__title">图层列表</h4>
      <label v-for="(item, index) in layers" :key="index">
        <input
          type="checkbox"
          v-model="item.visible"
          @change="toggleLayerVisibility(item)"
        />
        {{ item.name }}
      </label>
    </div>

    <!-- 底图切换：矢量街道 / 卫星影像 -->
    <BaseMapSwitcher @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'

// 控件
import { ZoomSlider, ZoomToExtent, ScaleLine, OverviewMap, FullScreen, defaults as defaultControls } from 'ol/control'
import MousePosition from 'ol/control/MousePosition'
import { createStringXY } from 'ol/coordinate'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)
const overviewMap = ref(null)

let map
let imgLayer
let ciaLayer

// 图层配置
// 用 shallowRef：layers 里存的是 OpenLayers 图层对象，
// 如果用 ref() 深响应式，OL 对象会被包成 Proxy，图层的渲染流程会被破坏（瓦片请求正常但画布不出图）。
const layers = shallowRef([
  { name: '天地图矢量图层', type: 'vec', visible: true, layer: null },
  { name: '天地图矢量注记图层', type: 'cva', visible: true, layer: null }
])

// 创建天地图图层
function createTdtLayer(type) {
  return new TileLayer({
    source: new XYZ({
      url: buildTdtUrl(type),
      wrapX: false
    })
  })
}

onMounted(() => {
  // 初始化矢量图层（由图层列表控制可见性）
  layers.value.forEach((item) => {
    item.layer = createTdtLayer(item.type)
    item.layer.set('title', item.name)
    item.layer.setVisible(item.visible)
  })

  // 影像底图（用于底图切换，默认隐藏）
  imgLayer = createTdtLayer('img')
  ciaLayer = createTdtLayer('cia')
  imgLayer.set('title', '天地图影像图层')
  ciaLayer.set('title', '天地图影像注记图层')
  imgLayer.setVisible(false)
  ciaLayer.setVisible(false)

  // 创建地图
  // controls 里去掉默认的 +/- 缩放按钮：它会和缩放滑块位置冲突，
  // 缩放统一交给下面的 ZoomSlider 处理。
  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [...layers.value.map((l) => l.layer), imgLayer, ciaLayer],
    view: new View({
      center: fromLonLat([104.06, 30.67]), // 成都
      zoom: 8,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  // 1. 导航控件：缩放滑块（拖动即可平滑缩放）
  map.addControl(new ZoomSlider())

  // 2. 导航控件：特定范围缩放（成都范围）
  const zoomToExtent = new ZoomToExtent({
    extent: [102.54, 30.05, 104.53, 31.26]
  })
  map.addControl(zoomToExtent)

  // 3. 鼠标位置控件
  const mousePositionControl = new MousePosition({
    coordinateFormat: createStringXY(4),
    projection: 'EPSG:4326',
    target: document.getElementById('mousePosition')
  })
  map.addControl(mousePositionControl)

  // 4. 比例尺控件（尺寸与位置由 SCALE_LINE_OPTIONS + theme.css 控制）
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))

  // 5. 鹰眼控件
  const overviewMapControl = new OverviewMap({
    target: overviewMap.value,
    layers: [createTdtLayer('vec'), createTdtLayer('cva')],
    collapsed: false
  })
  map.addControl(overviewMapControl)

  // 6. 全屏控件
  map.addControl(new FullScreen())
})

// 底图切换：vec=矢量街道，img=卫星影像
function switchBaseMap(type) {
  const isImg = type === 'img'
  layers.value.forEach((item) => {
    item.layer.setVisible(!isImg && item.visible)
  })
  imgLayer.setVisible(isImg)
  ciaLayer.setVisible(isImg)
}

// 地图基本操作
function resetView() {
  map.getView().animate({
    center: fromLonLat([104.06, 30.67]),
    zoom: 8,
    rotation: 0,
    duration: 500
  })
}

function rotateMap() {
  const view = map.getView()
  view.setRotation(view.getRotation() + Math.PI / 4)
}

// 图层可见性切换
function toggleLayerVisibility(item) {
  item.layer.setVisible(item.visible)
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

/* 坐标显示与比例尺的位置统一在 theme.css 里（.ol-mouse-position / .ol-scale-line） */

/* 鹰眼容器：外观在 theme.css 的 .ol-overviewmap 里 */
.overview-map {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 15;
}

/* 左侧竖向排列：紧接在缩放滑块与缩放范围按钮下方 */
.toolbar {
  position: absolute;
  top: 524px;
  left: 14px;
  z-index: 20;
  flex-direction: column;
  align-items: stretch;
}

.layer-panel {
  position: absolute;
  top: 76px;
  right: 16px;
  z-index: 20;
}
</style>