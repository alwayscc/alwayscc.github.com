<template>
  <div id="app">
    <nav-header/>
    <router-view/>
  </div>
</template>

<script>
  import NavHeader from "./components/NavHeader"

  export default {
    name: 'app',
    components: {
      NavHeader
    }
  }
</script>

<style>
  html, body{
    height: 100%;
  }
  #app {
    font-family: 'Avenir', Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /*text-align: center;*/
    color: #2c3e50;
  }
</style>
