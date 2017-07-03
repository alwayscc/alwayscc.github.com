title: 更改一个错误—accept在不同操作系统实现细节略有不同
date: 2017-07-01 19:36:57
tags:
---


之前的时候谈accept生成新socket时，这个新socket会继承大多数listening socket的属性，但是文件状态标志比如O_NONBLOCK不会被继承。
当时用的settimeout 和 gettimeout来进行验证的。

这是不对的。

因为说settimeout(0) 和 setblocking(0) 是一样的，主要是因为

[源码](https://github.com/python/cpython/blob/9f3bdcb643623e07497af2fc35f0496c2302f1be/Modules/socketmodule.c)

```
static PyObject *
sock_settimeout(PySocketSockObject *s, PyObject *arg)
{
    _PyTime_t timeout;

    if (socket_parse_timeout(&timeout, arg) < 0)
        return NULL;

    s->sock_timeout = timeout;
    if (internal_setblocking(s, timeout < 0) == -1) {
        return NULL;
    }
    Py_RETURN_NONE;
}

```

看到了吗 settimeout 会在设置 timeout属性时，调用internal_setblocking ,这个也就是setblocking底层实现。
但是通过gettimeout 这个是获取的sock_timeout 属性的值，并不能代表此时的是否设置了O_NONBLOCK。
看下PySocketSockObject 这个数据结构
[源码](https://fossies.org/dox/Python-2.7.13/socketmodule_8h_source.html)

```
typedef struct {
    PyObject_HEAD
    SOCKET_T sock_fd;           /* Socket file descriptor */
    int sock_family;            /* Address family, e.g., AF_INET */
    int sock_type;              /* Socket type, e.g., SOCK_STREAM */
    int sock_proto;             /* Protocol type, usually 0 */
    PyObject *(*errorhandler)(void); /* Error handler; checks
                                        errno, returns NULL and
                                        sets a Python exception */
    double sock_timeout;                 /* Operation timeout in seconds;
                                        0.0 means non-blocking */
    PyObject *weakreflist;
} PySocketSockObject;
```

这个sock_time 是Python的socket 属性，而非内核socket的属性。
所以在accept 生成新socket时，并不会给这个非内核的socket 继承 listening socket 的属性。
也就是 gettimeout获取的值跟文件状态标志位没有任何关系。

那到底能不能直接看到O_NONBLOCK状态的方法呢。有的<code>fcntl</code>库。fcntl 可以访问或者修改这些状态标志位(file status flags)。

```
flags = fcntl.fcntl(s.fileno(), fcntl.F_GETFL)
fcntl.fcntl(socket.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)
```

获取当前flags 标志位，设置O_NONBLOCK标志。这其实等价于setblocking(0) 可以看下 setblocking [源码](https://github.com/python/cpython/blob/9f3bdcb643623e07497af2fc35f0496c2302f1be/Modules/socketmodule.c)

```
internal_setblocking(PySocketSockObject *s, int block)
{
    int result = -1;
#ifdef MS_WINDOWS
    u_long arg;
#endif
#if !defined(MS_WINDOWS) \
    && !((defined(HAVE_SYS_IOCTL_H) && defined(FIONBIO)))
    int delay_flag, new_delay_flag;
#endif
#ifdef SOCK_NONBLOCK
    if (block)
        s->sock_type &= (~SOCK_NONBLOCK);
    else
        s->sock_type |= SOCK_NONBLOCK;
#endif

    Py_BEGIN_ALLOW_THREADS
#ifndef MS_WINDOWS
#if (defined(HAVE_SYS_IOCTL_H) && defined(FIONBIO))
    block = !block;
    if (ioctl(s->sock_fd, FIONBIO, (unsigned int *)&block) == -1)
        goto done;
#else
    delay_flag = fcntl(s->sock_fd, F_GETFL, 0);
    if (delay_flag == -1)
        goto done;
    if (block)
        new_delay_flag = delay_flag & (~O_NONBLOCK);
    else
        new_delay_flag = delay_flag | O_NONBLOCK;
    if (new_delay_flag != delay_flag)
        if (fcntl(s->sock_fd, F_SETFL, new_delay_flag) == -1)
            goto done;
#endif
#else /* MS_WINDOWS */
    arg = !block;
    if (ioctlsocket(s->sock_fd, FIONBIO, &arg) != 0)
        goto done;
#endif /* MS_WINDOWS */

    result = 0;

  done:
    ;  /* necessary for --without-threads flag */
    Py_END_ALLOW_THREADS

    if (result) {
#ifndef MS_WINDOWS
        PyErr_SetFromErrno(PyExc_OSError);
#else
        PyErr_SetExcFromWindowsErr(PyExc_OSError, WSAGetLastError());
#endif
    }

    return result;
}

```
socket的setblocking是通过fcntl实现的，这也是唯一跟告知内核的方式。

OK，那我们再用fcntl的方式来验证下之前accept继承是否正确。

```
import socket
import fcntl
HOST = '127.0.0.1'
PORT = 50003

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

print "server socket timeout", s.gettimeout()
print "server socket flags", fcntl.fcntl(s.fileno(), fcntl.F_GETFL)


s.setblocking(0)

print "server socket timeout", s.gettimeout()
print "server socket flags", fcntl.fcntl(s.fileno(), fcntl.F_GETFL)

s.bind((HOST, PORT))
s.listen(1)
while True:
    try:
        conn, addr = s.accept()

    except socket.error as e:
        continue
    print "new socket timeout", conn.gettimeout()
    print "new socket flags",  fcntl.fcntl(conn.fileno(), fcntl.F_GETFL)
    conn.close()
s.close()

```

输出

```
server socket timeout None
server socket flags 2
server socket timeout 0.0
server socket flags 6
new socket timeout None
new socket flags 6
```
奇怪的事情发生了， accept继承了 listening socket 的文件状态标志位(file status flags)。这是咋回事？
之前说的这个结论不会继承是Linux 内核下说的(我本人的开发机是Mac)，Mac OS的内核实现可能不同。
又找了一台Ubuntu机器上试了试

```
server socket timeout None
server socket flags 2
server socket timeout 0.0
server socket flags 2050
new socket timeout None
new socket flags 2
```

跟预期一致了，果然没有继承。

看来不同的操作系统内核的实现有略微的不同，因此不要依赖于accept时的继承，把accept生成的socket也进行显式的修改。不论你是用setsockopt还是fcntl, 最好在accept生成的socket再显式来设置一次。

推荐一个在线看Python源码的[网站](https://fossies.org/dox/Python-2.7.13/socketmodule_8c_source.html)


