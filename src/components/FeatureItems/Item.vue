<template>
  <div class="item-container">

    <div class="svg-container">
      <svg-icon icon-class="camera"/>
    </div>
    <div class="split-line"></div>

    <span class="descZh">{{descZh}}</span>
    <span class="descEn">BRANDING INSIGHT</span>
  </div>
</template>

<script>
  export default {
    name: "Item.vue",
    props: {
      descZh: {
        type: String,
        required: true
      },
      descEn: {
        type: String,
        required: true,
      }
    },
    data() {
      return {}
    }
  }
</script>

<style lang="scss" scoped>
  $item-color: red;

  .item-container {
    width: 200px;
    border: 1px solid $item-color;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: $item-color;
    padding: 30px 0 30px 0;
  }

  .svg-container {
    color: $item-color;
    display: inline-block;
    font-size: 40px;

    border: 1px solid $item-color;
    border-radius: 50%;
    padding: 20px;
  }

  .split-line {
    border-bottom: 1px solid $item-color;
    margin-top: 20px;
    margin-bottom: 20px;
    width: 80%;
  }

  .descZh {
    /*margin-top: 20px;*/
    font-size: 20px;
  }

  .descEn {
    margin-top: 20px;
  }
</style>