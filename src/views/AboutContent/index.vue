<template>
    <div class="about-container">
        <div class="banner">
        </div>
        <about/>
    </div>
</template>

<script>
    import About from "@/components/About"
    export default {
        name: "index.vue",
        components:{
            About,
        }
    }
</script>

<style lang="scss" scoped>
    .banner {
        /*width: 1440px;*/
        height: 800px;
        cursor: default;
        /*background-position: 50% 50%;*/
        background-repeat: no-repeat;
        /*overflow: hidden;*/
        margin: 0px auto;
        position: relative;
        z-index: 1;
        background-size: cover;
        background-image:url("~@/assets/banner-about.jpg");
    }
</style>
