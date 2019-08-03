<template>
    <div class="contact-container">
        <div class="banner">
        </div>
        <contact/>
    </div>
</template>

<script>
    import Contact from "@/components/Contact"
    export default {
        name: "index.vue",
        components:{
            Contact,
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
        position: relative;
        z-index: 1;
        background-size: cover;
        background-image:url("~@/assets/banner-contact.jpg");
    }
</style>
