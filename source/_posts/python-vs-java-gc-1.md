title: Python JAVA垃圾回收对比（一）
date: 2017-08-06 18:12:27
tags:
---


注：我们以下谈论的Python均指的是CPython
我们以下谈论的JVM均指的HotSpot VM

# 引用计数(Reference Counting)
## Python
Python主要的GC机制，在Python对象内部维护一个被其他对象引用数的引用数值，当这个引用数值为0时，表明这个对象不再被其他对象引用，就可以被回收了。

这种算法的优点就是简单高效。无需挂起应用程序，很平滑地进行垃圾回收。而它的另外一个优势在于空间上的引用局部性比较好，当某个对象的引用计数值变为0时，系统无需访问位于堆中其他页面的单元，而后面我们将要看到的几种垃圾回收算法在回收前都回遍历所有的存活单元，这可能会引起换页（Paging）操作；
可立即回收垃圾，在引用计数算法中，每个对象都知道自己的引用计数，当引用计数为0时可以立即把自己作为空闲空间链接到空闲链表中。后面我们将要看到的几种垃圾回收算法在对象废弃后，都会存活一段时间，才会被回收。

缺点一个时间上的开销，每次在对象创建或者释放时，都要计算引用计数值，这会引起一些额外的开销；第二是空间上的开销，由于每个对象要保持自己被引用的数量，必须付出额外的空间来存放引用计数值；引用计数算法最大的缺点就在于它无法处理环形引用。如果A引用了B，B引用了A。此时删除A，因为B引用了A，所以A的内存不会被回收。删除B时，因为A引用了B，同样B的内存不会被回收。这样就造成了内存泄露。我们分别看下Python和Java的这种情况

```python
import gc

gc.set_debug(gc.DEBUG_STATS | gc.DEBUG_LEAK)

a = []
b = []
c = []
print "a address: ", hex(id(a))
print "b address: ", hex(id(b))

a.append(b)
b.append(a)

del a
del b
```
 

输出

```
a address:  0x108e2e8c0
b address:  0x108f6aa70
gc: collecting generation 2...
gc: objects in each generation: 101 3201 0
gc: collectable <list 0x108e2e8c0>
gc: collectable <list 0x108f6aa70>
gc: done, 2 unreachable, 0 uncollectable, 0.0014s elapsed.
```
OK, 看到gc输出的日志，a和b是被回收了，说明Python的gc并非单纯的引用计数。

## JAVA
我们看下JAVA中是否也有引用计数呢？

```java
public class ReferenceCountingGC {
    public Object instance = null;
    //2MB 增大此object大小方便通过查看gc日志是否被回收
    private byte[] bigSize = new byte[2 * 1024 * 1024]; 

    /*
    * VM Options: -XX:+PrintGCDetails
    * */
    public static void main(String[] args){
        ReferenceCountingGC objA = new ReferenceCountingGC();
        ReferenceCountingGC objB = new ReferenceCountingGC();

        objA.instance = objB;
        objB.instance = objA;

        objA = null;
        objB = null;

        System.gc();
    }
}

```

JVM 参数设置  -XX:+PrintGCDetails
输出

```text
[GC (System.gc()) [PSYoungGen: 6062K->464K(18944K)] 6062K->472K(62976K), 0.0023589 secs] [Times: user=0.00 sys=0.00, real=0.00 secs] 
[Full GC (System.gc()) [PSYoungGen: 464K->0K(18944K)] [ParOldGen: 8K->370K(44032K)] 472K->370K(62976K), [Metaspace: 2876K->2876K(1056768K)], 0.0062995 secs] [Times: user=0.01 sys=0.00, real=0.01 secs] 
Heap
 PSYoungGen      total 18944K, used 437K [0x00000007aab00000, 0x00000007ac000000, 0x00000007c0000000)
  eden space 16384K, 2% used [0x00000007aab00000,0x00000007aab6d590,0x00000007abb00000)
  from space 2560K, 0% used [0x00000007abb00000,0x00000007abb00000,0x00000007abd80000)
  to   space 2560K, 0% used [0x00000007abd80000,0x00000007abd80000,0x00000007ac000000)
 ParOldGen       total 44032K, used 370K [0x0000000780000000, 0x0000000782b00000, 0x00000007aab00000)
  object space 44032K, 0% used [0x0000000780000000,0x000000078005cb88,0x0000000782b00000)
 Metaspace       used 2887K, capacity 4494K, committed 4864K, reserved 1056768K
  class space    used 318K, capacity 386K, committed 512K, reserved 1048576K
```

其中 <code>[GC (System.gc()) [PSYoungGen: 6062K->464K(18944K)]</code> 明显发生了回收。因此JVM并非用的引用计数。 

这里说一下，JAVA早期的GC也曾经使用过reference counting，不过现在主流的JVM已经放弃了。

为啥Python还在用引用计数？除了上面提到的一些引用计数优点外，还有些是历史原因，早期的Python GC其实没有对循环引用这种做处理。而同时C 实现的API接口和一些数据结构都是建立在引用计数这个基础上的，后来改进垃圾回收算法支持了循环引用情况下的垃圾回收。但是此时想去掉引用计数已经不可能了。

# 其他回收算法
在引用计数之外还存在如下垃圾回收算法

* 标记清除(Mark Sweep)
  * 标记清除算法主要分为标记阶段和清除阶段。标记阶段是把所有活动对象做上标记。清除阶段是把那些没有标记的对象，也就是非活动对象进行回收。

* 复制（Copying）算法
说到底也是为了解决标记-清除算法产生的那些碎片。

  * 首先将内存分为大小相等的两部分（假设A、B两部分），每次呢只使用其中的一部分（这里我们假设为A区），等这部分用完了，这时候就将这里面还能活下来的对象复制到另一部分内存（这里设为B区）中，然后把A区中的剩下部分全部清理掉。
  * 这样一来每次清理都要对一半的内存进行回收操作，这样内存碎片的问题就解决了，可以说简单，高效。

* 标记-压缩（Mark-Compact）算法
  * 复制收集算法在对象存活率较高时就要进行较多的复制操作，效率将会变低。更关键的是，如果不想浪费50%的空间，就需要有额外的空间进行分配担保，以应对被使用的内存中所有对象都100%存活的极端情况。 标记整理算法的标记过程类似标记清除算法，但后续步骤不是直接对可回收对象进行清理，而是让所有存活的对象都向一端移动，然后直接清理掉端边界以外的内存，类似于磁盘整理的过程，该垃圾回收算法适用于对象存活率高的场景。
  
* 分代收集（Generational Collection）算法
  * 对于一个大型的系统，当创建的对象和方法变量比较多时，堆内存中的对象也会比较多，如果逐一分析对象是否该回收，那么势必造成效率低下。分代收集算法是基于这样一个事实：不同的对象的生命周期(存活情况)是不一样的，而不同生命周期的对象位于堆中不同的区域，因此对堆内存不同区域采用不同的策略进行回收可以提高 JVM 的执行效率。
  * 分代收集可以说是以上几种算法的混合运用，不同代不同回收算法。  

除了分代收集，标记清楚，复制算法，标记整理这些都面临一个问题，就是如何判断一个对象是否存活，哪些应该被回收。

# 存活对象判定
## JAVA

找一组可以称为GC Root，并从 root进行遍历，如果遍历结束后如果发现某个对象是不可达，就会被标记为不可达对象，标记为是可回收对象。在JAVA中哪些可以作为GC Roots对象呢？
1. 虚拟机栈（栈帧中引用的本地变量）中引用的对象
2. 方法区中类静态属性引用的对象
3. 方法区中常量引用的对象
4. 本地方法栈中JNI引用的对象

很多人对GC Roots一定很困惑，即使上面说了什么是GC Roots也很模糊。举个例子就列举虚拟机栈。
大家学过C语言知道，main函数是入口函数，main中可以调用其他函数最终实现复杂功能。这种函数调用方式就是基于栈实现的。函数执行时入栈，结束后出栈。同样在JAVA虚拟机中，也有一中JVM特有的栈，每次入栈和出栈的数据对象就是栈帧(Stack Frame)。栈帧有一个数据结构其中存储着某个方法的本地变量，如果这个变量是一个对象那么真实的内存环境如下图

```
栈                      堆

|...       |           |            |
|...       |           |            |
|reference | ----->    |object 内存  |
|...       |           |            |
|...       |           |            |

```

我们借用上面引用计数的例子

```java

public class ReferenceCountingGC {
    public Object instance = null;
    //2MB 增大此object大小方便通过查看gc日志是否被回收
    private byte[] bigSize = new byte[2 * 1024 * 1024]; 

    /*
    * VM Options: -XX:+PrintGCDetails
    * */
    public static void main(String[] args){
        ReferenceCountingGC objA = new ReferenceCountingGC();
        ReferenceCountingGC objB = new ReferenceCountingGC();
    
        objA.instance = objB;
        objB.instance = objC;

        objA = null;
        objB = null;

        System.gc();
    }
}

```


```
objA （GC roots） objB
-------------------
  |              |
  |              |
  |              |
 objA内存       objB内存
  |              |
  |              |
  |              |
 objB 内存      objA内存
```

则在objA 和 objB 这两个 reference 就是 GC roots。此时objA 和 objB 的堆内存均有GC roots 指向，可以从GC Roots到达。因此不会被回收。当执行 objA = null 和 objB = null 之后 二者对内存虽然仍互相引用，但是无法从GC Roots 到达，因此执行GC时 二者的堆内存便会被回收。


## Python
首先对于Python来讲，要想发生循环引用那首先对象得支持引用别人才行。在Python里list，dict，instance， class 和 tuple这些才可以。我们将这些姑且成为容器对象(container objects)。我们只关心这些对象的循环引用文体其余的类型例如integer啊 string这些就让引用计数去管理好了。对于这些container objects 我们在他们的数据结构中加入一个双向链表。如果看下源码的话就是

```python
// objimpl.h
typedef union _gc_head {
    struct {
        union _gc_head *gc_next;
        union _gc_head *gc_prev;
        Py_ssize_t gc_refs;
    } gc;
    long double dummy;  /* force worst-case alignment */
} PyGC_Head;
```
这样每生成一个容器对象都通过链表进行关联。
当发生gc的时候

1. 当一个容器对象被创建时，设置 gc_refs 等于这个对象的引用数(reference count)
2. 遍历这个链表，若一个容器对象a，引用了容器对象b，则b的gc_refs 减1
3. 现在这个链表上所有gc_refs>1 的对象都是被外部对象(这个链表之外的对象)所引用的。这些是不能被回收释放的，把这些移到一个新的队列中。
4. 这些新队列里的容器对象引用到的旧队列里的容器对象也不能被回收，把这些也移到新队列里。
5. 把旧队列里的容器对象回收释放。