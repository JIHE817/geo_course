import { createRouter, createWebHistory } from 'vue-router'

import ShowTianditu from '../views/ShowTianditu.vue'
import ControlsDemo from '../views/ControlsDemo.vue'
import MeasureDemo from '../views/MeasureDemo.vue'
import DataLoadDemo from '../views/DataLoadDemo.vue'
import PublicMapDemo from '../views/PublicMapDemo.vue'
import MapExportDemo from '../views/MapExportDemo.vue'
import DrawEditDemo from '../views/DrawEditDemo.vue'
import StyleEditDemo from '../views/StyleEditDemo.vue'

const routes = [
  { path: '/', redirect: '/tianditu' },
  { path: '/tianditu', component: ShowTianditu },
  { path: '/controls', component: ControlsDemo },
  { path: '/measure', component: MeasureDemo },
  { path: '/dataload', component: DataLoadDemo },
  { path: '/publicmap', component: PublicMapDemo },
  { path: '/export', component: MapExportDemo },
  { path: '/drawedit', component: DrawEditDemo },
  { path: '/styleedit', component: StyleEditDemo }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router