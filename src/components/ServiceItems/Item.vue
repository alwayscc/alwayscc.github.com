<template>
  <div class="item-container" :class="colorClass">
    <svg-icon icon-class="example"></svg-icon>
    <span>{{desc}}</span>
  </div>
</template>

<script>
  export default {
    name: "Item",

    props:{
      colorClass:{
        type:String,
        required:true,
      },
      desc:{
        type:String,
        required:true
      }
    }
  }
</script>

<style lang="scss" scoped>
.item-container{
  color: white;
  width: 285px;
  height: 230px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  /*background-color: red;*/
}

  .svg-icon{
    font-size: 60px;
  }

  span{
    margin-top: 36px;
    font-size: 26px;
  }

  .redBg{
    background-color: rgb(247,111,111);
  }
  .blueBg{
    background-color: rgb(104,201,210);
  }
  .yellowBg{
    background-color: rgb(251,207,72);
  }
</style>