<template>
    <div class="item-container">

        <img :src="imgSrc" alt="">
    </div>
</template>

<script>
    export default {
        name: "Item",
        props: {
            imgId: {
                type: String,
                required: true,
            }
        },
        computed: {
            imgSrc() {
                return require("@/assets/partners/partner" + this.imgId + ".jpg")
            }
        }

    }
</script>

<style lang="scss" scoped>
    .item-container {
        width:400px;
        /*border: 1px solid black;*/
        text-align: center;
        margin-bottom: 50px;
    }

    img {
        height: 255px;
        margin: auto;
        /*border: 1px solid red;*/
    }
</style>
