import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'ol/ol.css'
import './theme.css'

createApp(App).use(router).mount('#app')