const path = require('path')

module.exports = {
  chainWebpack: config => {
    const svgRule = config.module.rule('svg')
    // 清除已有的所有 loader。
    // 如果你不这样做，接下来的 loader 会附加在该规则现有的 loader 之后。
    svgRule.uses.clear()
    // 添加别名
    config.resolve.alias
      .set('@', path.resolve('src'))
    config.module
      .rule('svg')
      .test(/\.svg$/)
      .include
      .add(path.resolve('src/icons'))
      .end()
      .use('svg-sprite-loader')
      .loader('svg-sprite-loader')
      // 使用时id形式与symbolId保持一致
      // options可以不要，默认的id是svg文件名=name
      // use xlink:href="#icon-user", 这个#icon-user就是id
      .options({
        symbolId: 'icon-[name]'
      })
  }

}