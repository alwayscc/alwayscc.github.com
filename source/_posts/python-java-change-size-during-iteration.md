title: python java 遍历时不得更改容器大小对比
date: 2017-05-25 08:10:24
tags:
---


# Java AbstractList

这里以ArrayList为例

```java
Integer[] a = new Integer[]{1,2,3,4,5};
List<Integer> l = new ArrayList(Arrays.asList(a));
for (Integer i:l){
    l.remove(i);
}
```

ArrayList 的父类 AbstractList做了限制
AbstractList 有一个成员变量 modCount，记录list被修改的次数，初始化为0
对于ArrayList 来讲，remove,clear,add 等涉及到修改list size 大小的操作都会进行一次``modCount++`` 例如

```java
public E remove(int index) {
    rangeCheck(index);

    modCount++;
    E oldValue = elementData(index);

    int numMoved = size - index - 1;
    if (numMoved > 0)
        System.arraycopy(elementData, index+1, elementData, index,
                         numMoved);
    elementData[--size] = null; // clear to let GC do its work

    return oldValue;
}
```

for 循环遍历 List 时，会创建迭代器
AbstractList 迭代器是一个内部类

```java

private class Itr implements Iterator<E> {
        /**
         * Index of element to be returned by subsequent call to next.
         */
        int cursor = 0;

        /**
         * Index of element returned by most recent call to next or
         * previous.  Reset to -1 if this element is deleted by a call
         * to remove.
         */
        int lastRet = -1;

        /**
         * The modCount value that the iterator believes that the backing
         * List should have.  If this expectation is violated, the iterator
         * has detected concurrent modification.
         */
        int expectedModCount = modCount; // 初始化赋值

        public boolean hasNext() {
            return cursor != size();
        }

        public E next() {
            checkForComodification();
            try {
                int i = cursor;
                E next = get(i);
                lastRet = i;
                cursor = i + 1;
                return next;
            } catch (IndexOutOfBoundsException e) {
                checkForComodification();
                throw new NoSuchElementException();
            }
        }

        public void remove() {
            if (lastRet < 0)
                throw new IllegalStateException();
            checkForComodification();

            try {
                AbstractList.this.remove(lastRet);
                if (lastRet < cursor)
                    cursor--;
                lastRet = -1;
                expectedModCount = modCount;
            } catch (IndexOutOfBoundsException e) {
                throw new ConcurrentModificationException();
            }
        }

        final void checkForComodification() {
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
        }
    }

```

可以看到迭代器创建初期 ``int expectedModCount = modCount;`` 记录了当前被修改次数
然后每次遍历时 都会 ``checkForComodification`` 也就是校验当初遍历开始时我记录的expectedModCount 和 这次遍历 modCount 是否相等来判断在遍历期间List是否被修改了

显然我们 ``l.remove(i);``时造成了 modCount修改导致了最后的错误。

## 如何避免？
1 用迭代器进行删除

```java
        Integer[] a = new Integer[]{1,2,3,4,5};
        List<Integer> l = new ArrayList(Arrays.asList(a));
//        for (Integer i:l){
//            l.remove(i);

//        }
        Iterator iterator = l.iterator();
        while (iterator.hasNext()){
            iterator.next();
            iterator.remove();
        }
    }
```

为什么可行，看下ArrayList 的 Iterator remove代码就知道了

```java
public void remove() {
    if (lastRet < 0)
        throw new IllegalStateException();
    checkForComodification();

    try {
        ArrayList.this.remove(lastRet);
        cursor = lastRet;
        lastRet = -1;
        expectedModCount = modCount;
    } catch (IndexOutOfBoundsException ex) {
        throw new ConcurrentModificationException();
    }
}
```

嗯，看到了吗，虽然最后还是会调用ArrayList本身的remove 但是remove之后，会立即更新 ``expectedModCount = modCount;`` 这样下次迭代时checkForComodification就不会出错了

### 如果多线程呢？

单线程的情况我们用迭代器解决了，可是如果是多线程呢，如果在一个线程遍历时，另一个线程修改了呢？

```java
        Integer[] a = new Integer[]{1,2,3,4,5};
        final List<Integer> l = new ArrayList(Arrays.asList(a));
        new Thread(){
            public void run(){
                Iterator iterator = l.iterator();
                while (iterator.hasNext()){
                    iterator.next();
                    try {
                        Thread.sleep(2000);
                    }catch (InterruptedException e){
                        e.printStackTrace();
                    }
                }
            }
        }.start();

        new Thread(){
            public void run(){
                Iterator iterator = l.iterator();
                while (iterator.hasNext()){
                    iterator.next();
                    iterator.remove();
                }
            }
        }.start();
    }
```

执行一下会报错

```
Exception in thread "Thread-0" java.util.ConcurrentModificationException
	at java.util.ArrayList$Itr.checkForComodification(ArrayList.java:901)
	at java.util.ArrayList$Itr.next(ArrayList.java:851)
	at Main$2.run(Main.java:42)
```

2 多线程解决办法加锁

```
 Integer[] a = new Integer[]{1, 2, 3, 4, 5};
        final List<Integer> l = new ArrayList(Arrays.asList(a));
        new Thread() {
            public void run() {
                synchronized (l) {
                    Iterator iterator = l.iterator();
                    while (iterator.hasNext()) {
                        iterator.next();
                        try {
                            Thread.sleep(2000);
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                    }

                }

            }
        }.start();

        new Thread() {
            public void run() {
                synchronized (l) {
                    Iterator iterator = l.iterator();
                    while (iterator.hasNext()) {
                        iterator.next();
                        iterator.remove();
                    }
                }

            }
        }.start();
    }
```

另一种解决办法   
3 CopyOnWriteArrayList

CopyOnWriteArrayList, 这种解决办法原理是，当你进行任何remove 或者 add 操作时，并不修改原数组而是新生成一个新数组，再把引用指向新的数组

```
        Integer[] a = new Integer[]{1,2,3,4,5};
        final List<Integer> l = new CopyOnWriteArrayList<Integer>(Arrays.asList(a));
        new Thread(){
            public void run(){
                Iterator<Integer> iterator = l.iterator();
                while (iterator.hasNext()){
                    iterator.next();
                    try {
                        Thread.sleep(2000);
                    }catch (InterruptedException e){
                        e.printStackTrace();
                    }
                }
            }
        }.start();

        new Thread(){
            public void run(){
                Iterator<Integer> iterator = l.iterator();
                while (iterator.hasNext()){
                    Integer i = iterator.next();
                    l.remove(i);
                }
            }
        }.start();
    }
```






#Python Dictionary

看下Python 的 dict

```python
dictionary = {"k1":1,"k2":2,"k3":3}
for k,v in dictionary.iteritems():
    del dictionary[k]
```
会报错 ``RuntimeError: dictionary changed size during iteration``
这个看起来跟Java的很像，都是不允许在遍历过程中修改size。

同样看下[源码](https://fossies.org/dox/Python-2.7.13/dictobject_8c_source.html)找到原因

```python
static PyObject *dictiter_iternextkey(dictiterobject *di)
{
    PyObject *key;
    register Py_ssize_t i, mask;
    register PyDictEntry *ep;
    PyDictObject *d = di->di_dict;

    if (d == NULL)
        return NULL;
    assert (PyDict_Check(d));

    if (di->di_used != d->ma_used) {
        PyErr_SetString(PyExc_RuntimeError,
                        "dictionary changed size during iteration");
        di->di_used = -1; /* Make this state sticky */
        return NULL;
    }

...
....
}

```

每次遍历时校验``di_used`` 和``ma_used``是否相等，乍一看很像JAVA ArrayList的expectedModCount和modCount。
这里的di 是遍历时的迭代器对象 d是字典的对象
``ma_used`` 记录着字典里有多少个Entry(一个key 一个value的组成一个entry)，遍历的时候创建迭代器时会记录当前的``ma_used``

```python
 static PyObject *
dictiter_new(PyDictObject *dict, PyTypeObject *itertype)
{
    dictiterobject *di;
    di = PyObject_GC_New(dictiterobject, itertype);
    if (di == NULL)
        return NULL;
    Py_INCREF(dict);
    di->di_dict = dict;
    di->di_used = dict->ma_used; #记录当前的ma_used
 ...
 ...
 ...
}

```

看完后确实跟Java ArrayList modCount很像。

## 如何解决
1  有没有类似Java的用迭代器删除后，再重新给modCount赋值  
看了下源码，Python底层并没有这种支持

2  避免迭代器遍历

```python
dictionary = {"k1":1,"k2":2,"k3":3}
# for k,v in dictionary.iteritems():
#     del dictionary[k]
for k in list(dictionary.keys()): #python2 默认返回的keys的list python3返回迭代器
    del dictionary[k]
```

对于python2来讲可以用items替代iteritems，这里顺便讲下二者区别
iteritems 遍历时是用的迭代器 而 items遍历时，返回的是[(k1,v1),(k2,v2)]

```python
def items(self): # real signature unknown; restored from __doc__
    """ D.items() -> list of D's (key, value) pairs, as 2-tuples """
    return []
```

在Python3里iteritems没有了，items变成了迭代器方式。

3  CopyOnWriteArrayList

java CopyOnWriteArrayList的原理时，我遍历时用的原数组，如果修改操作，我copy出一份，修改new，然后old = new

python方式时，遍历时用copy出来的new，修改还是在原dict上进行修改

```python
dictionary = {"k1":1,"k2":2,"k3":3}
for k,v in dictionary.copy().iteritems():
    del dictionary[k]
```