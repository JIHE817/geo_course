<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapCon"></div>

    <div class="map-info ol-card">
      <span class="map-info__dot"></span>
      天地图 · {{ BASE_INFO[baseType] }}
    </div>

    <!-- 底图切换：矢量街道 / 卫星影像 / 地形地貌（每类均带对应注记图层） -->
    <BaseMapSwitcher :bases="['vec', 'img', 'ter']" @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import { ZoomSlider, ScaleLine, FullScreen, OverviewMap, defaults as defaultControls } from 'ol/control'
import { SCALE_LINE_OPTIONS, buildTdtUrl, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapCon = ref(null)
let map
// 底图图层：矢量/影像/地形 各带自己的注记图层
const baseLayers = { vec: null, cva: null, img: null, cia: null, ter: null, cta: null }

const baseType = ref('vec')
const BASE_INFO = {
  vec: '矢量底图 + 矢量注记',
  img: '影像底图 + 影像注记',
  ter: '地形底图 + 地形注记'
}
// 每种底图对应的「底图 + 注记」图层组合
const BASE_PAIRS = {
  vec: ['vec', 'cva'],
  img: ['img', 'cia'],
  ter: ['ter', 'cta']
}

onMounted(() => {
  // 统一使用 src/config.js 里的 WMTS 地址（_w 系列 + TILEMATRIXSET=w），
  // 与 EPSG:3857 视图匹配，避免行列号错位
  Object.entries(baseLayers).forEach(([type]) => {
    baseLayers[type] = new TileLayer({
      title: `天地图 ${type} 图层`,
      source: new XYZ({ url: buildTdtUrl(type), wrapX: false })
    })
  })
  // 初始只显示矢量底图 + 矢量注记
  baseLayers.img.setVisible(false)
  baseLayers.cia.setVisible(false)
  baseLayers.ter.setVisible(false)
  baseLayers.cta.setVisible(false)

  // 方法一：在 Map 构造时一次性传入多个图层
  // controls 里去掉默认的 +/- 缩放按钮，缩放改用 ZoomSlider 滑块
  map = new Map({
    controls: defaultControls({ zoom: false }),
    layers: [
      baseLayers.vec,
      baseLayers.cva,
      baseLayers.img,
      baseLayers.cia,
      baseLayers.ter,
      baseLayers.cta
    ],
    target: mapCon.value,
    view: new View({
      center: fromLonLat([104, 31]), // 成都附近
      zoom: 6,
      projection: 'EPSG:3857',
      extent: WORLD_EXTENT,
      minZoom: 1,
      maxZoom: 18
    })
  })

  // 方法二：也可以使用 map.addLayer() 动态添加图层
  // map.addLayer(vecLayer)
  // map.addLayer(cvaLayer)

  // 缩放滑块 + 比例尺 + 全屏 + 鹰眼
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

// 底图切换：vec=矢量街道，img=卫星影像，ter=地形地貌
// 切换时同步显示对应的注记图层，其余底图全部隐藏
function switchBaseMap(type) {
  const pair = BASE_PAIRS[type] || BASE_PAIRS.vec
  baseType.value = type
  Object.entries(baseLayers).forEach(([key, layer]) => {
    layer.setVisible(pair.includes(key))
  })
}
</script>

<style scoped>
/* 高度用 100% 继承 App.vue 中 .app-main 的高度（顶部有导航条，用 100vh 会超出屏幕） */
.wrapper {
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

/* 左下角信息标签（比例尺在它下面，见 theme.css 的 .ol-scale-line） */
.map-info {
  position: absolute;
  left: 16px;
  bottom: 140px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 16px;
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.map-info__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.22);
}
</style>