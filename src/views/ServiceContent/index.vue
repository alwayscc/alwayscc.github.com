<template>
  <div class="service-container">
      <div class="banner">
      </div>
      <service-items/>
      <case-items/>

  </div>
</template>

<script>
    import ServiceItems from "@/components/ServiceItems"
    import CaseItems from "@/components/CaseItems"
  export default {
    name: "index.vue",
      components:{
          ServiceItems,
          CaseItems,
      }
  }
</script>

<style lang="scss" scoped>
    .banner {
        /*width: 1440px;*/
        height: 500px;
        cursor: default;
        /*background-position: 50% 50%;*/
        background-repeat: no-repeat;
        /*overflow: hidden;*/
        margin: 0px auto;
        position: relative;
        z-index: 1;
        background-size: cover;
        background-image:url("~@/assets/banner-service.jpg");
    }
</style>
