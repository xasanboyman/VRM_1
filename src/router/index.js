import { createRouter, createWebHistory } from 'vue-router'
import Speaking from '../pages/Speaking.vue'

const routes = [{ path: '/', name: 'speaking', component: Speaking }]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
