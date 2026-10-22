<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 测量按钮：放在底部居中，避免压住左上角的缩放控件 -->
    <div class="measure-toolbar ol-toolbar ol-card">
      <button
        class="ol-btn"
        :class="{ 'is-active': measureType === 'distance' }"
        @click="startMeasure('distance')"
      >
        <span class="ol-btn__icon">📏</span>距离测量
      </button>
      <button
        class="ol-btn ol-btn--green"
        :class="{ 'is-active': measureType === 'area' }"
        @click="startMeasure('area')"
      >
        <span class="ol-btn__icon">⬛</span>面积测量
      </button>
      <button
        class="ol-btn ol-btn--amber"
        :class="{ 'is-active': measureType === 'angle' }"
        @click="startMeasure('angle')"
      >
        <span class="ol-btn__icon">📐</span>角度测量
      </button>
      <button class="ol-btn ol-btn--slate" @click="clearMeasure">
        <span class="ol-btn__icon">🧹</span>清除
      </button>
    </div>

    <!-- 测量提示框 -->
    <div ref="tipDiv" class="measure-tip ol-measure-tip"></div>

    <!-- 底图切换：矢量街道 / 卫星影像 -->
    <BaseMapSwitcher @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Map, View, Overlay } from 'ol'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import Draw from 'ol/interaction/Draw'
import { ZoomSlider, ScaleLine, FullScreen, OverviewMap, defaults as defaultControls } from 'ol/control'
import { getLength } from 'ol/sphere'
import { getArea } from 'ol/sphere'
import { unByKey } from 'ol/Observable'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)
const tipDiv = ref(null)

// 当前测量类型，仅用于把对应按钮高亮成选中态
const measureType = ref('')

let map
let source
let vectorLayer
let vecLayer
let cvaLayer
let imgLayer
let ciaLayer
let draw
let sketchFeature
let geometryListener
let overlay

onMounted(() => {
  // 矢量图层，用于存放测量结果
  source = new VectorSource()
  vectorLayer = new VectorLayer({ source })

  // 天地图底图（矢量街道 + 卫星影像，默认矢量）
  vecLayer = new TileLayer({
    source: new XYZ({
      url: buildTdtUrl('vec'),
      wrapX: false
    })
  })

  cvaLayer = new TileLayer({
    source: new XYZ({
      url: buildTdtUrl('cva'),
      wrapX: false
    })
  })

  imgLayer = new TileLayer({
    source: new XYZ({
      url: buildTdtUrl('img'),
      wrapX: false
    })
  })

  ciaLayer = new TileLayer({
    source: new XYZ({
      url: buildTdtUrl('cia'),
      wrapX: false
    })
  })
  imgLayer.setVisible(false)
  ciaLayer.setVisible(false)

  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [vecLayer, cvaLayer, imgLayer, ciaLayer, vectorLayer],
    view: new View({
      center: fromLonLat([104.06, 30.67]),
      zoom: 10,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT
    })
  })

  // 提示框 Overlay
  overlay = new Overlay({
    element: tipDiv.value,
    positioning: 'bottom-left',
    offset: [10, -10]
  })
  map.addOverlay(overlay)

  // 缩放滑块 + 比例尺（测量时便于对照）+ 全屏 + 鹰眼
  map.addControl(new ZoomSlider())
  map.addControl(new ScaleLine(SCALE_LINE_OPTIONS))
  map.addControl(new FullScreen())

  // 鹰眼控件（右下角，便于对照全局位置）
  map.addControl(
    new OverviewMap({
      layers: [
        new TileLayer({
          source: new XYZ({ url: buildTdtUrl('vec'), wrapX: false })
        }),
        new TileLayer({
          source: new XYZ({ url: buildTdtUrl('cva'), wrapX: false })
        })
      ],
      collapsed: false
    })
  )
})

// 底图切换：vec=矢量街道，img=卫星影像
function switchBaseMap(type) {
  const isImg = type === 'img'
  vecLayer.setVisible(!isImg)
  cvaLayer.setVisible(!isImg)
  imgLayer.setVisible(isImg)
  ciaLayer.setVisible(isImg)
}

// 开始测量
function startMeasure(type) {
  // 清除上一次的交互
  clearMeasure()

  measureType.value = type

  let drawType
  if (type === 'area') {
    drawType = 'Polygon'
  } else {
    drawType = 'LineString'
  }

  draw = new Draw({
    source,
    type: drawType,
    maxPoints: type === 'angle' ? 3 : undefined
  })
  map.addInteraction(draw)

  draw.on('drawstart', (evt) => {
    sketchFeature = evt.feature
    const geom = sketchFeature.getGeometry()

    geometryListener = geom.on('change', () => {
      const g = sketchFeature.getGeometry()
      let output = ''
      let coord

      if (type === 'distance') {
        output = '总长: ' + distanceFormat(getLength(g))
        coord = g.getLastCoordinate()
      } else if (type === 'area') {
        output = '面积: ' + formatArea(getArea(g))
        coord = g.getInteriorPoint().getCoordinates()
      } else if (type === 'angle') {
        output = '角度: ' + formatAngle(g)
        coord = g.getLastCoordinate()
      }

      tipDiv.value.innerHTML = output
      if (coord) {
        overlay.setPosition(coord)
      }
    })
  })

  draw.on('drawend', () => {
    unByKey(geometryListener)
    map.removeInteraction(draw)
    draw = null
  })
}

// 清除
function clearMeasure() {
  measureType.value = ''
  if (draw) {
    map.removeInteraction(draw)
    draw = null
  }
  if (source) {
    source.clear()
  }
  if (geometryListener) {
    unByKey(geometryListener)
    geometryListener = null
  }
  if (tipDiv.value) {
    tipDiv.value.innerHTML = ''
  }
  if (overlay) {
    overlay.setPosition(undefined)
  }
}

// 距离格式化
function distanceFormat(length) {
  return length > 1000
    ? (length / 1000).toFixed(2) + ' km'
    : length.toFixed(2) + ' m'
}

// 面积格式化
function formatArea(area) {
  return area > 10000
    ? (area / 1000000).toFixed(2) + ' km²'
    : area.toFixed(2) + ' m²'
}

// 角度格式化（三点，余弦定理）
function formatAngle(line) {
  const coordinates = line.getCoordinates()
  if (coordinates.length < 3) return '0°'

  const a = coordinates[0]
  const b = coordinates[1]
  const c = coordinates[2]

  const disa = Math.sqrt(
    Math.pow(c[0] - b[0], 2) + Math.pow(c[1] - b[1], 2)
  )
  const disb = Math.sqrt(
    Math.pow(a[0] - c[0], 2) + Math.pow(a[1] - c[1], 2)
  )
  const disc = Math.sqrt(
    Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)
  )

  const cos =
    (disa * disa + disb * disb - disc * disc) / (2 * disa * disb)
  const angle = (Math.acos(cos) * 180) / Math.PI
  return angle.toFixed(2) + '°'
}

onBeforeUnmount(() => {
  clearMeasure()
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

/* 左侧竖向工具条：让开缩放滑块列，限高到比例尺上方，超高则内部滚动 */
.measure-toolbar {
  position: absolute;
  top: 76px;
  left: 116px;
  z-index: 20;
  flex-direction: column;
  align-items: stretch;
  max-height: calc(100% - 236px);
  overflow-y: auto;
}

/* 手机竖屏：按钮缩小一些，避免压到地图 */
@media (max-width: 760px) {
  .measure-toolbar {
    padding: 8px;
    gap: 8px;
  }

  .measure-toolbar .ol-btn {
    min-height: 46px;
    padding: 0 16px;
    font-size: 16px;
  }

  .measure-toolbar .ol-btn__icon {
    font-size: 20px;
  }
}

.measure-tip {
  position: absolute;
  /* 具体外观在 theme.css 的 .ol-measure-tip 里 */
}
</style>