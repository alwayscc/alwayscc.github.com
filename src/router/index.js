import Vue from 'vue'

import Router from 'vue-router'
import IndexContent from '../views/IndexContent/index'
import ServiceContent from '../views/ServiceContent'

Vue.use(Router)

const routerMap = [
  {
    path: '',
    redirect: '/service',
  },
  {
    path: '/index',
    component: IndexContent
  },
  {
    path: '/service',
    component: ServiceContent
  },
]

export default new Router({
  routes: routerMap
})