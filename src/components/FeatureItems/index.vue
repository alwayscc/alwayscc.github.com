<template>
  <div class="feature-container">
    <item desc-zh="品牌洞察" desc-en="BRANDING INSIGHT"/>
    <item desc-zh="广告营销" desc-en="AD MARKETING"/>
    <item desc-zh="电商托管" desc-en="MANAGED SERVICE"/>
    <item desc-zh="内容策划" desc-en="CONTENT MARKETING"/>
  </div>
</template>

<script>
  import Item from './Item'

  export default {
    name: "Features",
    components: {
      Item
    }
  }
</script>

<style lang="scss" scoped>
.feature-container{
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 50%;
  min-width: 1080px;
  margin: 100px auto 100px auto;
}
</style>