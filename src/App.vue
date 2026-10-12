<script setup>
// 顶部导航：所有示例页面互相切换
const links = [
  { to: '/tianditu', label: '地图加载与显示' },
  { to: '/controls', label: '常用控件' },
  { to: '/measure', label: '地图测量' },
  { to: '/dataload', label: '多源数据加载' },
  { to: '/publicmap', label: '公共地图加载' },
  { to: '/export', label: '地图打印输出' },
  { to: '/drawedit', label: '图形绘制' },
  { to: '/styleedit', label: '样式交互编辑' }
]
</script>

<template>
  <div class="app-shell">
    <nav class="app-nav">
      <span class="app-title">OpenLayers 10 示例</span>
      <router-link v-for="item in links" :key="item.to" :to="item.to">
        {{ item.label }}
      </router-link>
    </nav>

    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

body {
  overflow: hidden;
  font-family: system-ui, 'Segoe UI', 'Microsoft YaHei', Roboto, sans-serif;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-nav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 62px;
  padding: 0 20px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #1e3a8a 100%);
  box-shadow: 0 2px 14px rgba(15, 23, 42, 0.35);
  box-sizing: border-box;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 14px;
  color: #f8fafc;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.6px;
  white-space: nowrap;
}

.app-title::before {
  content: '';
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: linear-gradient(135deg, #60a5fa, #22d3ee);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.25);
}

.app-nav a {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  color: #cbd5e1;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  transition:
    background 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.app-nav a:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  transform: translateY(-1px);
}

.app-nav a.router-link-active {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.5);
  color: #fff;
}

.app-main {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

@media (max-width: 900px) {
  .app-nav {
    height: 56px;
    gap: 6px;
    padding: 0 12px;
  }

  .app-title {
    display: none;
  }

  .app-nav a {
    height: 36px;
    padding: 0 13px;
    font-size: 14px;
  }
}
</style>