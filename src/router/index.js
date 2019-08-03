import Vue from 'vue'

import Router from 'vue-router'
import IndexContent from '../views/IndexContent/index'
import ServiceContent from '../views/ServiceContent'
import AboutContent from '../views/AboutContent'
import ContactContent from '../views/ContactContent'

Vue.use(Router)

const routerMap = [
  {
    path: '',
    redirect: '/index',
  },
  {
    path: '/index',
    component: IndexContent
  },
  {
    path: '/service',
    component: ServiceContent
  },

    {
        path: '/about',
        component: AboutContent
    },
    {
        path: '/contact',
        component: ContactContent
    },
]

export default new Router({
  routes: routerMap
})
