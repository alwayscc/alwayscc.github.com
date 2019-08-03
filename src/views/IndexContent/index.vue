<template>
  <div class="index-container">
    <div class="banner">
      <div class="title"><span>定制服务</span></div>
      <div class="desc"><span>为不同品牌机构量身定制最高效的营销方案</span></div>
    </div>
    <feature-items/>
    <service-items/>
    <about/>
    <contact/>
  </div>

</template>

<script>
import FeatureItems from "@/components/FeatureItems"
import ServiceItems from "@/components/ServiceItems"
import About from "@/components/About"
import Contact from "@/components/Contact"
  export default {
    name: "index",
    data() {
      return {
      }
    },
    components:{
      FeatureItems,
      ServiceItems,
      About,
      Contact,
    }
  }
</script>

<style lang="scss" scoped>
  /*img {*/
  /*width: 1440px;*/
  /*height: 500px;*/
  /*}*/
  .banner {
    /*width: 1440px;*/
    height: 500px;
    cursor: default;
    /*background-position: 50% 50%;*/
    background-repeat: no-repeat;
    overflow: hidden;
    margin: 0px auto;
    position: relative;
    z-index: 1;
    background-size: cover;
    background-image:url("~@/assets/banner-index.jpg");
    text-align: center;
    span{
      color: white;
    }
    .title{

      margin-top: 150px;
      font-size: 51px;
    }
    .desc{
      margin-top: 100px;
      font-size: 30px;

    }
  }
</style>
