<template>
    <div class="casee-container">
        <div class="content">
            <h1>Case</h1>
            <div class="items">
                <item img-id="1"/>
                <item img-id="5"/>
                <item img-id="4"/>
                <item img-id="2"/>
                <item img-id="3"/>
            </div>
        </div>
    </div>
</template>

<script>
    import Item from './Item'
    export default {
        name: "index.vue",
        components:{
            Item
        }
    }
</script>

<style lang="scss" scoped>
    /*.service-container {*/

        /*background-color: rgb(241, 241, 241);*/
    /*}*/

    .content {
        width: 50%;
        min-width: 1080px;
        margin: auto;
    }
    /*.items{*/
        /*display: flex;*/
        /*flex-direction: row;*/
        /*justify-content: space-between;*/
    /*}*/

    .items{
        margin-top: 60px;
        display: flex;
        flex-direction:row;
        flex-wrap: wrap;
    }
</style>
