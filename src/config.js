// 天地图密钥（浏览器端 key）。
// 注意：这是“浏览器端”类型的 key，只能在浏览器里用；用 curl / Postman 直接请求会返回
// 403 + "Key权限类型为:浏览器端，请使用浏览器访问！"，这是正常的，不代表 key 失效。
// 如果瓦片加载不出来，先去 https://console.tianditu.gov.cn/ 申请一个免费 key 再替换这里。
export const TDT_KEY = '2db5ad081595102f027b1d9f639f0d00'

// 各图层对应的天地图 WMTS 服务地址与图层名
// 注意：项目视图统一使用 EPSG:3857（Web 墨卡托），必须用 "_w" 系列图层 +
// TILEMATRIXSET=w。若用 "_c"（EPSG:4326 经纬度投影）瓦片配 3857 视图，
// x/y 行列号会被错位解析（北京会显示成大西洋洋面）。
export const TDT_SERVICES = {
  img: { url: 'http://t1.tianditu.gov.cn/img_w/wmts', layer: 'img' },
  cia: { url: 'http://t2.tianditu.gov.cn/cia_w/wmts', layer: 'cia' },
  vec: { url: 'http://t1.tianditu.gov.cn/vec_w/wmts', layer: 'vec' },
  cva: { url: 'http://t2.tianditu.gov.cn/cva_w/wmts', layer: 'cva' },
  ter: { url: 'http://t3.tianditu.gov.cn/ter_w/wmts', layer: 'ter' },
  cta: { url: 'http://t4.tianditu.gov.cn/cta_w/wmts', layer: 'cta' }
}

// 拼接某个图层的 WMTS GetTile 请求地址
export function buildTdtUrl(type, key = TDT_KEY) {
  const { url, layer } = TDT_SERVICES[type]
  return (
    `${url}?` +
    'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=default` +
    '&TILEMATRIXSET=w&FORMAT=tiles' +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}' +
    `&tk=${key}`
  )
}

// 比例尺统一配置：maxWidth 放大后比例尺更长（配合 theme.css 里放大的字号）
export const SCALE_LINE_OPTIONS = {
  units: 'metric',
  maxWidth: 190,
  bar: false,
  steps: 2
}

// Web Mercator (EPSG:3857) 世界有效范围 [minX, minY, maxX, maxY]
// 用于给各页面 View 设置 extent：既能限制左右平移边界（不会无限滑动），
// 又能防止缩小到出现左右留白。
export const WORLD_EXTENT = [
  -20037508.342789244,
  -20037508.342789244,
  20037508.342789244,
  20037508.342789244
]
