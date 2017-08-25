title: python-java-list
date: 2017-08-25 19:08:50
tags:
---


ArrayList 动态数组

python 动态修改自己代码，monkey patch (gevent)
python GIL 锁
垃圾回收



# Java ArraysList

Java 除了原生的数组外，collections 中还有 ArrayList, LinkedList, Vector三种。

ArrayList 动态数组，好处可以动态增长，缺点为此牺牲了效率。
本质上，仍然是用array来存储对象

```java
public class ArrayList<E> extends AbstractList<E>
        implements List<E>, RandomAccess, Cloneable, java.io.Serializable
{
transient Object[] elementData; 
}
```

当需要添加元素时，会调用ensureCapacityInternal查看是否需要扩容

```python
public boolean add(E e) {
    ensureCapacityInternal(size + 1);  // Increments modCount!!
    elementData[size++] = e;
    return true;
}

private void ensureCapacityInternal(int minCapacity) {
    if (elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA) {
        minCapacity = Math.max(DEFAULT_CAPACITY, minCapacity);
    }

    ensureExplicitCapacity(minCapacity);
}

private void ensureExplicitCapacity(int minCapacity) {
    modCount++;

    // overflow-conscious code
    if (minCapacity - elementData.length > 0)
        grow(minCapacity);
}

private void grow(int minCapacity) {
    // overflow-conscious code
    int oldCapacity = elementData.length;
    int newCapacity = oldCapacity + (oldCapacity >> 1);
    if (newCapacity - minCapacity < 0)
        newCapacity = minCapacity;
    if (newCapacity - MAX_ARRAY_SIZE > 0)
        newCapacity = hugeCapacity(minCapacity);
    // minCapacity is usually close to size, so this is a win:
    elementData = Arrays.copyOf(elementData, newCapacity);
}

```

通过一步步调用，如果需要扩容，创建size更大的新数组，然后将原数组内容复制过去，并将引用指向新数组。

这里发现扩容的时候并非需要多少就给多少，会额外给一部分空间，避免频繁进行扩容操作。默认只要空间不够了扩容为原先size 的1.5倍 `` int newCapacity = oldCapacity + (oldCapacity >> 1);`` 
(新空间如果不满足本次需求minCapacity，那么就用这次需求的最小值 minCapacity)。

#Python List

看下list 的append源码按照下面``PyList_Append-> app1-> list_resize``调用顺序

```python
int
PyList_Append(PyObject *op, PyObject *newitem)
{
    if (PyList_Check(op) && (newitem != NULL))
        return app1((PyListObject *)op, newitem);
    PyErr_BadInternalCall();
    return -1;
}


static int
app1(PyListObject *self, PyObject *v)
{
    Py_ssize_t n = PyList_GET_SIZE(self);

    assert (v != NULL);
    if (n == PY_SSIZE_T_MAX) {
        PyErr_SetString(PyExc_OverflowError,
            "cannot add more objects to list");
        return -1;
    }

    if (list_resize(self, n+1) == -1)
        return -1;

    Py_INCREF(v);
    PyList_SET_ITEM(self, n, v);
    return 0;
}


static int
list_resize(PyListObject *self, Py_ssize_t newsize)
{
    PyObject **items;
    size_t new_allocated;
    Py_ssize_t allocated = self->allocated;

    /* Bypass realloc() when a previous overallocation is large enough
       to accommodate the newsize.  If the newsize falls lower than half
       the allocated size, then proceed with the realloc() to shrink the list.
    */
    if (allocated >= newsize && newsize >= (allocated >> 1)) {
        assert(self->ob_item != NULL || newsize == 0);
        Py_SIZE(self) = newsize;
        return 0;
    }


    new_allocated = (newsize >> 3) + (newsize < 9 ? 3 : 6);

    /* check for integer overflow */
    if (new_allocated > PY_SIZE_MAX - newsize) {
        PyErr_NoMemory();
        return -1;
    } else {
        new_allocated += newsize;
    }

    if (newsize == 0)
        new_allocated = 0;
    items = self->ob_item;
    if (new_allocated <= (PY_SIZE_MAX / sizeof(PyObject *)))
        PyMem_RESIZE(items, PyObject *, new_allocated);
    else
        items = NULL;
    if (items == NULL) {
        PyErr_NoMemory();
        return -1;
    }
    self->ob_item = items;
    Py_SIZE(self) = newsize;
    self->allocated = new_allocated;
    return 0;
}
```
大体的思路也跟Java 的 ArrayList很像，如果空间不够了就扩容，开辟一块新的空间，把原数据复制过去，然后引用指向新内存。
而且同样，扩容内存的时候也不是要多少给多少，依然会多给 ``new_allocated = (newsize >> 3) + (newsize < 9 ? 3 : 6);`` 不过多给的算法就不太一样了。至于为啥要多给这么些个，用网上的话说，这些公式都是Python设计者当初经过大量实验得出的最佳实践。


