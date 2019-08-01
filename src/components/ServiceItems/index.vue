<template>
  <div class="service-container">
    <div class="content">
      <h1>Service</h1>
      <div class="items">
        <item color-class="yellowBg" desc="精选案例"/>
        <item color-class="blueBg" desc="电商运营"/>
        <item color-class="redBg" desc="联系我们"/>
      </div>
      <h3>我们能为您做点什么——将传统医疗企业与移动互联网企业跨界融合，定制化服务，掀起营销革命

        为您品牌整体形象从定位 + 规划 + 实施 系统化服务与价值展实施</h3>
    </div>
  </div>
</template>

<script>
  import Item from './Item'
  export default {
    name: "index.vue",
    components:{
      Item
    }
  }
</script>

<style lang="scss" scoped>
  .service-container {

    background-color: rgb(241, 241, 241);
  }

  .content {
    width: 50%;
    min-width: 1080px;
    margin: auto;
  }
  .items{
    display: flex;
    flex-direction: row;
    justify-content: space-between;
  }
</style>