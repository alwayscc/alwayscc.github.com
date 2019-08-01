<template>
  <div class="contact-container">
  <h1>CONTACT</h1>
    <p>HELLO!
      赶紧离开那乏味的营销套路，加入我们——内容营销包装、移动互联网传播、跨平台电商整合托管服务.....
      若您阅览以上信息之后，有合作意向，请您为我们留言或使用以下方式联系我们，我们 讲尽快给您回复，并为您提供最真诚的服务，谢谢您的支持。
    </p>
    <ul>
      <li>
        <svg-icon icon-class="phone"></svg-icon>
        <span>010-6544744</span>
      </li>
      <li>
        <svg-icon icon-class="mail"></svg-icon>
        <span>邮箱: sfsdfsd@sfsdf.com</span>
      </li>
      <li>
        <svg-icon icon-class="location"></svg-icon>
        <span>北京市朝阳区青年路国美第一城</span>
      </li>
    </ul>
  </div>
</template>

<script>
  export default {
    name: "Contact"
  }
</script>

<style lang="scss" scoped>
.contact-container{
  width: 50%;
  min-width: 1080px;
  margin: auto;
  margin-top: 100px;
}
  p{
    display: inline-block;
    width: 50%;
    line-height: 30px;
  }
  ul{
    list-style: none;
    padding: 0;
  }
  li{
    /*vertical-align: center;*/
    line-height: 50px;
    height: 50px;
    /*margin-bottom: 15px;*/
    .svg-icon{
      color: rgb(58,127,74);
      font-size: 26px;
    }
    span{
      margin-left: 30px;
      color: rgb(127, 127, 127);
    }
  }
</style>