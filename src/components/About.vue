<template>
  <div class="about-container">
    <h1>ABOUT</h1>
    <div class="content">
      <p>
        北京医本至源科技有限公司是一家专业从事“互联网+医疗解决方案”服务的高新技术企业。为医疗客户提供专业的互联网解决方案、移动互联应用开发、拓展互联网业务。
        公司致力于帮助医疗行业客户引入互联网技术，提供云医疗、在线支付、TP运营、内容营销、社会化全案运营等一系列综合资源，并为用户创造优质的推广平台。
        在接入互联网过程中，帮助医疗行业用户连接互联网技术，提供基于云的技术开发、系统集成、软件安装、营销推广、代理运营等相关技术服务。
      </p>
      <img :src="aboutPng" alt="">

    </div>
  </div>
</template>

<script>
  import AboutPng from "@/assets/about.png"
  export default {
    name: "About",
    data(){
      return {
        aboutPng:AboutPng
      }
    }
  }
</script>

<style lang="scss" scoped>
.about-container{
  width: 50%;
  min-width: 1080px;
  margin:auto;

}
.content{
  display: flex;
  align-items: center;
  justify-content: space-between;
}
  p{
    display: inline-block;
    width: 55%;
    color: #666666;
    line-height: 30px;
  }
</style>