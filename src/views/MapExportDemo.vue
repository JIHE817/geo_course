<template>
  <div class="wrapper">
    <div id="map" class="map-container" ref="mapContainer"></div>

    <!-- 导出工具栏：图片 / PDF 两种导出方式 -->
    <div class="export-toolbar ol-toolbar ol-card">
      <button class="ol-btn ol-btn--green" :disabled="exporting" @click="exportImage">
        <span class="ol-btn__icon">{{ exporting ? '⏳' : '🖼️' }}</span>
        {{ exporting ? '生成中…' : '导出为图片' }}
      </button>
      <button class="ol-btn ol-btn--amber" :disabled="exportingPdf" @click="exportPDF">
        <span class="ol-btn__icon">{{ exportingPdf ? '⏳' : '📄' }}</span>
        {{ exportingPdf ? '生成中…' : '导出为 PDF' }}
      </button>
    </div>

    <BaseMapSwitcher @change="switchBaseMap" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  ZoomSlider, ScaleLine, FullScreen, defaults as defaultControls
} from 'ol/control'
import { buildTdtUrl, SCALE_LINE_OPTIONS, WORLD_EXTENT } from '../config'
import BaseMapSwitcher from '../components/BaseMapSwitcher.vue'

const mapContainer = ref(null)
const exporting = ref(false)
const exportingPdf = ref(false)

let map
let vecLayer
let cvaLayer
let imgLayer
let ciaLayer

onMounted(() => {
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

  map = new Map({
    target: mapContainer.value,
    controls: defaultControls({ zoom: false }),
    layers: [vecLayer, cvaLayer, imgLayer, ciaLayer],
    view: new View({
      center: fromLonLat([104, 31]),
      zoom: 6,
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

// ------------------------------ 公共：截取当前视图为 Canvas ------------------------------
async function captureCanvas() {
  // 等待地图完成一轮渲染，确保瓦片已绘制再截图，避免导出空白
  await new Promise((resolve) => {
    map.once('rendercomplete', resolve)
    map.renderSync()
  })

  const viewport = map.getViewport()
  return html2canvas(viewport, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale: Math.max(window.devicePixelRatio || 1, 2)
  })
}

// ------------------------------ 导出为 PNG 图片 ------------------------------
async function exportImage() {
  if (exporting.value) return
  exporting.value = true
  try {
    const canvas = await captureCanvas()
    const link = document.createElement('a')
    link.download = `map-view-${timestamp()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    console.error('[MapExport] 图片导出失败：', err)
    window.alert('导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

// ------------------------------ 导出为 PDF（html2canvas + jsPDF） ------------------------------
async function exportPDF() {
  if (exportingPdf.value) return
  exportingPdf.value = true
  try {
    const canvas = await captureCanvas()
    const imgData = canvas.toDataURL('image/png')

    // A4 横向（297mm × 210mm），图像等比缩放居中嵌入
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    })
    const pageW = 297
    const pageH = 210
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height)
    const w = canvas.width * ratio
    const h = canvas.height * ratio
    pdf.addImage(imgData, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h)
    pdf.save(`map-view-${timestamp()}.pdf`)
  } catch (err) {
    console.error('[MapExport] PDF 导出失败：', err)
    window.alert('导出失败，请稍后重试')
  } finally {
    exportingPdf.value = false
  }
}

function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
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
.export-toolbar {
  position: absolute;
  top: 76px;
  left: 116px;
  z-index: 20;
  flex-direction: column;
  align-items: stretch;
  max-height: calc(100% - 236px);
  overflow-y: auto;
}
</style>
