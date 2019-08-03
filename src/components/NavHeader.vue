<template>
  <div class="nav-container">
    <div class="wrapper">
      <div class="left-logo">
        <a href="/index">
          <img :src="logoSrc" alt="">
        </a>
      </div>
      <ul>
       <router-link  class="router-link" tag="li" :to="{ path: 'index' }">首页</router-link>
       <router-link  class="router-link" tag="li" :to="{ path: 'service' }">服务内容</router-link>
       <router-link  class="router-link" tag="li" :to="{ path: 'about' }">关于我们</router-link>
       <router-link  class="router-link" tag="li" :to="{ path: 'contact' }">联系我们</router-link>
        <!--<li><router-link :to="{ path: 'index' }">首页</router-link></li>-->
        <!--<li><router-link :to="{ path: 'service' }">服务内容</router-link></li>-->
        <!--<li><router-link :to="{ path: 'about' }">关于我们</router-link></li>-->
        <!--<li><router-link :to="{ path: 'contact' }">联系我们</router-link></li>-->
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
    margin-left: 20px;
  }
  .router-link{
    cursor: pointer;
    padding: 10px;
    /*border: 1px solid red;*/
    width: 80px;
    text-align: center;

  }

  .router-link-active{
    background-color: #f13a3a;
    border-radius: 15px;
    color: white;
  }

</style>
