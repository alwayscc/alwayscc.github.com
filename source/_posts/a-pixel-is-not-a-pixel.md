---
layout: post
title:  "究竟是哪个像素"
date:   2015-02-21 17:23:04
categories: front-end
---

我们在平时经常会听到手机分辨率是多少乘多少像素，在css里也会用到譬如<code>{width: 60px;}</code>。那么这里的像素是不是同一种像素呢？如果不是，那又分别指的是什么像素呢。

#三种像素  
准确的讲像素其实分为三种 

1. Css Pixels
2. Device Pixels
3. Density-Independent-Pixels

###Css Pixels  
css 像素就是平时我们在css样式里写的比如<code>{width: 60px;}</code>。这里的60px便是60css像素。css像素是浏览器厂商为web开发者提供的一层抽象的像素层。css像素的尺寸是**可以缩放**的。
比如这个网页，黄色的侧边栏宽度是190像素。

![zoom css pixel](/img/2015/02/21-01.png )
<!-- {% img /blog/img/2015/02/21-01.png 100 100 %} -->

现在我们放大浏览器

![zoom css pixel](/img/2015/02/21-02.png)

我们很明显能感觉到黄色的侧边栏变宽了，但是它的css像素也变宽了吗？**不**，它的css样式依旧是<code>{width: 60px;}</code>。只不过每一个css像素变大了而已。

###Device Pixels
设备像素，也就是物理像素是硬件层面的像素。[Apple官网]所展示不同iPhone机型的分辨率，例如iPhone6 Plus的像素分辨率 1920*1080像素，这里指的便是Device Pixels(设备像素)。

在最初非Retina屏幕时代，例如iPhone1 设备像素(宽)为320px，后来随着Retina屏幕的产生，屏幕拥有了越来越多的像素，例如iPhone 4 设备像素(宽)变成了640像素。但是屏幕的尺寸并没有变化(iPhone1 和 iPhone4 都是3.5英寸)，如果不做任何改变原本在iPhone1上显示正常的网页到了iPhone4上，便会变得特别特别小。比如之前在iPhone1上一张满屏的图片宽为320px，正好等于iPhone1的屏幕宽度。放到了iPhone4上，320px宽的图片，就只能占据屏幕的一半了。

###Device Independent Pixel 
为了解决这种情况，Google率先引入了 Device independent pixel 设备独立像素。这是继 css 像素层之后有一个抽象的像素层，它介于css像素层和设备像素层。

#到底是那种像素？
说了这么多种像素，那么对于我们开发者而言，我们经常讲的是哪种像素呢？

99%情况下我们谈论都是 Css Pixels(css像素)，除非你求的时屏幕尺寸(screen size)。

#viewport
viewport 是用来限制<code><html></code> 标签的。

这样描述可能还有点抽象。好吧，我们举个“栗子”。比如你的网页上有个侧边栏，css样式为 <code>width: 10%</code>。这时候当你缩放浏览器的时候，这个侧边栏的大小也会随之发生改变。其中的原理是什么？

这个侧边栏总是获取它父元素宽度的10%，假定这个侧边栏除了<code><body></code>外没有别的任何上层嵌套元素。那这个侧边的宽度就是 <code><body></code> 宽度10%。那么<code><body></code>宽度是多少呢？

一般来讲，嵌套元素占据他们父元素的宽度100%(暂时不考虑一些特殊情况)，因此<code><body></code>宽度就是<code><html></code>。那么<code><html></code>宽度多少？跟浏览器窗口一样宽。所以刚开始说的那个侧边的宽度实际上是
width = 10% * <code><body></code> = 10%*<code><html></code> = 10%*browser-window。所以浏览器大小改变，侧边栏的大小也就会随之改变了。

其实从理论上讲，<code><html></code>大小是受限于viewport的。<code><html></code> =100%* <code><html></code>。
换个角度讲，viewport 等于浏览器窗口(browser window)的宽度。viewport 不是HTML里的东西，不受css改变。只不过和**桌面**浏览器窗口(browser window)拥有同样的高度与宽度。

###两个viewport
如果之前有个桌面网页可以正常显示，其中右侧的正文距离左边 <code>padding-left: 34%</code>

![padding-left](/img/2015/02/21-03.png)

如果在手机浏览器上不做任何改变，就会变成这样子。

![zoom css pixel](/img/2015/02/21-04.png)

全都挤在了一起，原因是手机浏览器远小于桌面浏览器的宽度，或者说手机上的viewport远小于桌面的viewport，34%的尺寸显然太窄了。

为了解决这一问题，自然是想办法让手机上的viewport 变宽。于是浏览器厂商将viewport 一分为二，layout viewport 和 visual viewport。

<!-- #####layout viewport -->
layout viewport 就是css布局中使用的，<code>width: 10%</code> 说的就是 layout viewport的 10%。
visual viewport 就是用户实际能看到的视图大小，也就是用户在手机屏幕上能看到的大小。
给出图示
![zoom css pixel](/img/2015/02/21-05.png)
![zoom css pixel](/img/2015/02/21-06.png)

你将一个桌面的网页放到手机上看，手机上屏幕只能显示部分网页，这个部分网页就是visual viewport，而这个网页实际的css布局大小就是 layout viewport。


大多数浏览器设置了layout viewport = visual viewport。  
这样大多数网页在手机上看的时候，是这样的。  
![zoom css pixel](/img/2015/02/21-07.png)

这时候你可能为了要看清，就需要放大浏览器。当你每次缩放手机浏览器时，**只会改变visual viewport，而layout viewport**。为什么？试想一下，如果你每次缩放都要改变layout viewport的话，那么整张网页的css 布局都需要重新计算，这实在太浪费cpu和电池了。

显然每次都需要缩放屏幕不利于用户在手机上浏览。为了解决这个问题，Apple提出了 viewport meta 标签，通过这个告知浏览器应该设置layout viewport多大。常用的是<code><meta name=“viewport” content=“width = device-width”> </code>，这里的device-width就是设备宽度，也就是我们之前的提到的device-independent-pixels。

还记得我们之前讨论为什么提出了device-independent-pixels这个概念吗？就是因为手机的物理分辨率越来越大，如果我们不采用device-independent-pixels 而是device-pixels就会出现各种问题，iPhone1(320px设备像素)的 layout viewport是320px，iPhone4(640px设备像素)的layout viewport变成了640px。为了解决这问题，才提了device independent pixels概念，进而在 viewport meta标签采用了。

#ReadMore
[A tale of two viewports](http://www.quirksmode.org/mobile/viewports2.html)


[Apple官网]: http://www.apple.com/cn/iphone/compare/