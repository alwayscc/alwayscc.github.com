title: django ORM 的一些贴心措施（隐藏的坑）
date: 2017-07-02 19:50:08
tags:
---


## autocommit
mysql 为了让用户用起来爽，觉得让用户每条mysql语句执行完后，再写一个coomit太冗余了，索性我就帮你做了吧。默认开启了autocommit，你的每条mysql语句执行完后，都会立即commit。默认情况下mysql 是开启的。

```
mysql> show variables like 'autocommit';
+---------------+-------+
| Variable_name | Value |
+---------------+-------+
| autocommit    | ON    |
+---------------+-------+
1 row in set (0.01 sec)
```

[PEP 249](https://www.python.org/dev/peps/pep-0249/) 在python连接数据库底层api中关闭了这个特性，但是django 重写给打开了。

## ForeignKey on_delete=CASCADE
django ForeignKey 设置时有个参数参数叫 ``on_delete`` 默认是 CASCADE, 也就是会级联删除。如果父表中的记录被删除，则子表中对应的记录自动被删除。  
这样就会有问题了假设你有一个商品表，一个订单表，订单表中外键关联了商品表。有天商品被删除了，那么所有买过这个商品的订单都将消失。对于电商来讲，用户的订单消失意味着什么，这个就不用多说了吧。
可以根据业务需要自己设置为 DO_NOTHING 或者自己 SET 一个默认值。  
这里再多补充一句，对于电商数据库来讲要慎用delete，尽量通过``update table set status=offline`` 的方式来实现用户层的删除操作。


## 多表继承

```
class Father(models.Model):
	father_field = xxx
	father_filed = xxx
	
class Son(Father):
	son_field = xxx
	son_field = xxx
```

当你设计出了这种表时，基于这种考虑，我Son继承了Father，可以访问到Father里的任意数据。
比如 ``Son.objects.filter(father_field='xxxx')`` 而且Son里又不用存这些冗余数据。
不过这种写起来爽的前提建立在性能基础上。你每次查询Son表时都会同时也查询Father表。这种继承关系建立在OneToOne基础上，反映到mysql上就是join操作。

因此最好避免使用多表继承，建议换成ForeignKey或者OneToOneField。


## 贴心的分页功能
现在有个功能是让你遍历某个大表，首先你一定想到了 SomeModel.objects.all(), 然后for循环对吧。如果你这么做了，你会发现程序基本没法反映了，啥也不执行，卡在那里了。你用top命令去看下这个进程 ``top -pid your_pid`` 你会发现内存在蹭蹭涨，原因是django 的queryset 会把mysql执行结果一次性load 进内存。  
然后你想到了用Paginator。  
假设你的model 是 Merchandise，每次load 1000个

```
from django.core.paginator import Paginator
chunksize = 1000
all_merchandises = Merchandise.objects.all()
p = Paginator(all_merchandises, chunksize)
# 然后遍历page... ...
```

这样是解决了一次all 全部load进内存的尴尬。不过其实你会发现越翻的最后的页，越卡。

分析下原因，看下``p.page(11).object_list``执行时的sql 语句

``SELECT xxxxx FROM `merchanides` LIMIT 1000 OFFSET 10000`` 影响性能的就是这个offset。
对于mysql 来讲其实会去数据库搜出符合条件的11000个，然后返给你第10001-11000个。随着页码越来越大，这个offset也会越来越大，查询起来也会越来越慢。

一个更好的方法

```
import gc

def queryset_iterator(queryset, chunksize=1000):
    pk = 0
    last_pk = queryset.order_by('-pk')[0].pk
    queryset = queryset.order_by('pk')
    while pk < last_pk:
        for row in queryset.filter(pk__gt=pk)[:chunksize]:
            pk = row.pk
            yield row
        gc.collect()
```

通过先对主键排序，然后记录上次chunksize 之后的主键，然后取某个chunksize 时 用 pk>last_pk 来分块，成功的避免了offset。手动垃圾回收，主动清理垃圾。
