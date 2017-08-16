title: JAVA vs Python 多线程对比之 volatile
date: 2016-10-16 15:34:12
tags:
---


Java中所有变量都储存在主存中，对于所有线程都是共享的（因为在同一进程中），每个线程都有自己的工作内存或本地内存(Working Memory)，工作内存中保存的是主存中某些变量的拷贝，线程对所有变量的操作都是在工作内存中进行，而线程之间无法相互直接访问，变量传递均需要通过主存完成。

当然这只是模型，真实的物理世界并非如此，其实工作内存对应的就是CPU的缓存。这里不详细讲CPU的工作原理了。

![blog-109](http://7xkghb.com1.z0.glb.clouddn.com/blog-109.png)


多线程开发中有个非常重要的问题是可见性。何为可见性呢，上面我们说了，每个线程并非实时读写主存，而是操作各自的工作线程。设想一下一种情况有一个变量a=1，两个线程（记为A和B，并且CPU核数>=2)都对a进行+1 操作，预期结果两个线程各加一次。理想的顺序是

![blog-107](http://7xkghb.com1.z0.glb.clouddn.com/blog-107.png)

```
A 从主存读取 a 到A工作内存 a=1
A a = a +1 此时a为2
A 将 a写回主存(a=2)

B 从主存读取 a 到B工作内存 a=2
B a = a+1 此时a=3
B 将 a 写回主存(a=3)
```

此时a结果为3。

但是真实情况，在CPU核1上执行A两条命令后，CPU核2上立即开始执行B，时间顺序如下
但如果如果CPU核1上a增加1后还尚未写会主存，CPU核2上已经开始执行B了

![blog-108](http://7xkghb.com1.z0.glb.clouddn.com/blog-108.png)


```
A 从主存读取a 到A工组内存 a=1
A a = a+1 此时a为2
B 从主存读取a 到B工作内存 a=1
B a = a+1 此时a仍为2
A 将a 写回主存(a=2)
B 将a 写会主存(a=2)
```

此时a的结果变为2


可见性就是一个线程修改了某个共享变量后，那么其他线程应该能看到这个被修改后的值。
JAVA中 volatile关键字 可以实现此功能，被 volatile 修饰的变量，多线程访问此变量时，不会操作自己的工作内存，而是会直接操作主存。这样就可以避免我们刚才所说的问题。A，B二者同时操作的都是主存，当A a=a+1直接改变了主存， B再去取主存时取到的就是2而非1。


OK，这是JAVA的一个处理方法，那么Python有没有类似这种的机制呢？
没有，因为不需要。
Python多线程编程的知道，Python的多线程其实是伪多线程，因为有一把无情的GIL(全局解释锁)存在。多线程时，同一时刻只有一个进程可以拥有这把全局解释锁，也就是说不管你CPU有几个核，同一时间只能运行一个线程。

那么当切换线程时变会上下文切换，就会造成缓存失效。所以也就不会出现上面的情况。


但是volatile并不能取代锁，并不能保证完全同步。虽然保证了可见性，一旦A更改了a 的值，B读取时会立即读取最新的a值，但是如果B读取时，A也只是刚取到a值尚未进行+1操作，B就立刻取值，取到的仍是脏数据。

volatile应用场景举例


```java
public class NoVisibility {
    private static volatile boolean ready;
    private static int number;

    private static class ReaderThread extends Thread {
        public void run() {
            while (!ready);
            System.out.println(number);
        }
    }

    public static void main(String[] args) throws InterruptedException {
        new ReaderThread().start();
        Thread.sleep(1000);
        number = 42;
        ready = true;
        Thread.sleep(50000);
    }
}

```

上面这段代码如果不用volatile修饰ready，则ReaderThread线程永远不会读取到main线程修改后的ready值永远不会退出。