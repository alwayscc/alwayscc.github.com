<template>
  <div class="nav-container">
    <div class="wrapper">
      <div class="left-logo">
        <a href="">
          <img :src="logoSrc" alt="">
        </a>
      </div>
      <ul>
        <li>首页</li>
        <li>服务内容</li>
        <li>关于我们</li>
        <li>联系我们</li>
      </ul>
    </div>
  </div>
</template>

<script>
  import logoJpg from "@/assets/logo.jpg"
  export default {
    name: "Header",
    data(){
      return {
        logoSrc:logoJpg
      }
    },
  }
</script>

<style lang="scss" scoped>
.nav-container{
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  img{
    height: 70px;
  }
}

.wrapper{
  width: 1140px;
  display: flex;
  margin-left: 150px;
  margin-right: 150px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;

}
  li{
    list-style: none;
    float: left;
    margin-left: 30px;
  }

</style>