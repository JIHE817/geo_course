<template>
  <div class="base-switcher ol-card">
    <button
      v-for="type in bases"
      :key="type"
      type="button"
      class="base-switcher__btn"
      :class="{ 'is-active': current === type }"
      @click="select(type)"
    >
      {{ BASE_LABELS[type] }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const BASE_LABELS = {
  vec: '矢量街道',
  img: '卫星影像',
  ter: '地形地貌'
}

// bases：本页可用的底图类型合集，默认矢量 + 影像（保持旧页面行为不变）
const props = defineProps({
  bases: { type: Array, default: () => ['vec', 'img'] }
})

const emit = defineEmits(['change'])
const current = ref(props.bases[0])

function select(type) {
  if (current.value === type) return
  current.value = type
  emit('change', type)
}
</script>

<style scoped>
.base-switcher {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 5px;
}

.base-switcher__btn {
  border: 0;
  border-radius: 9px;
  padding: 9px 18px;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.3px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}

.base-switcher__btn:hover {
  background: rgba(91, 125, 153, 0.14);
}

.base-switcher__btn.is-active {
  background: linear-gradient(180deg, #5b7d99 0%, #456280 100%);
  color: #fff;
  box-shadow: 0 3px 10px rgba(69, 98, 128, 0.4);
}
</style>
