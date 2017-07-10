title: web 服务器的秘密(二)
date: 2015-06-30 16:18:38
tags:
---

进程创建上下文太消耗资源，我们换成多线程
我们同样使用python封装的更高级的线程库threading

```
import socket
import threading

response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('0.0.0.0', 9696))
server.listen(1)

def handler(conn, addr):
    request = conn.recv(4096)
    conn.send(response)
    conn.close()

while True:
    conn, addr = server.accept()
    thread = threading.Thread(target=handler, args=(conn, addr))
    thread.daemon = True
    thread.start()
```


不论是多进程还是多线程基本思想都是为每一个到来的连接创建一个新的进程或线程，然后在次进程或线程内完成该连接的请求响应。 所以TPC与PPC的使用场景是一样的，但创建线程的开销远低于创建进程的开销。 两者的缺点也是一样的，一个程序创建的子进程或子线程总是有上限的，且当连接多了之后，大量的进程/线程间切换需要大量的开销；通常这两个方案能处理的最大连接数都不会高，显然跟现在的web服务器相去甚远。

好，既然我们发现每来一个请求创建一个进程/线程，会把大把时间
消耗在创建进程/线程和进程/线程上下文切换中。并且如果我们每个线程处理的速度慢于线程创建速度，会造成线程数不断增长。当达到一定数量时，由于os限制无法产生更多线程，例如多线程方式则会报错
<code>thread.error: can't start new thread</code> 已生成的线程数量太多了，无法创建更多的线程了。

由于以上的种种原因，我们不得不控制产生线程的数量，这就用到了线程池。“线程池”旨在减少创建和销毁线程的频率，其维持一定合理数量的线程，并让空闲的线程重新承担新的执行任务。“连接池”维持连接的缓存池，尽量重用已有的连接、减少创建和关闭连接的频率。这两种技术都可以很好的降低系统开销，都被广泛应用很多大型系统，如 websphere、tomcat。

```
import socket
import threading

response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('0.0.0.0', 9696))
server.listen(1)

def handler():
    while True:
        conn, addr = server.accept()
        request = conn.recv(4096)
        conn.send(response)
        conn.close()
    thread.exit()

threads = []

for i in range(0, 4):
    thread = threading.Thread(target=handler, args=())
    thread.start()
    threads.append(thread)

for thread in threads:
    thread.join()
```

“线程池”技术也只是在一定程度上缓解了频繁调用 IO 接口带来的资源占用。而且，所谓“池”始终有其上限，当请求大大超过上限时，“池”构成的系统对外界的响应并不比没有池的时候效果好多少。所以使用“池”必须考虑其面临的响应规模，并根据响应规模调整“池”的大小。

之前的种种原因都是因为会发生阻塞才想出的方案，如果使用非阻塞的方式呢？

非阻塞忙轮询

```
import socket
import copy
response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.setblocking(False)
server.bind(('0.0.0.0', 9696))
server.listen(1)

conns = []

while True:
    try:
        conn, addr = server.accept()
        conns.append(conn)
    except Exception as e:
        pass
    for conn in copy.copy(conns):
        try:
            request = conn.recv(4096)
            conn.send(response)
            conns.remove(conn)
            conn.close()
        except Exception as e:
            pass
```

我们只要不停的把所有socket从头到尾问一遍，又从头开始。这样就可以处理多个socket了，但这样的做法显然不好，因为如果所有的socket都没有数据，那么只会白白浪费CPU。


select

为了避免CPU空转，可以引进了一个代理（一开始有一位叫做select的代理，后来又有一位叫做poll的代理，不过两者的本质是一样的）。这个代理比较厉害，可以同时观察许多流的I/O事件，在空闲的时候，会把当前线程阻塞掉，当有一个或多个流有I/O事件时，就从阻塞态中醒来，于是我们的程序就会轮询一遍所有的流（于是我们可以把“忙”字去掉了）。代码长这样:

while true {
    select(streams[])
    for i in streams[] {
        if i has data
            read until unavailable
    }
}

于是，如果没有I/O事件产生，我们的程序就会阻塞在select处。但是依然有个问题，我们从select那里仅仅知道了，有I/O事件发生了，但却并不知道是那几个流（可能有一个，多个，甚至全部），我们只能无差别轮询所有流，找出能读出数据，或者写入数据的流，对他们进行操作。

但是使用select，我们有O(n)的无差别轮询复杂度，同时处理的流越多，没一次无差别轮询时间就越长。

当时这样仍然会每次把所有的socket流轮询一遍，有没有一种方法可以只让我们轮询可以被操作的流呢？Epoll呼之欲出

epoll 可以理解为event poll，不同于忙轮询和无差别轮询，epoll之会把哪个流发生了怎样的I/O事件通知我们。此时我们对这些流的操作都是有意义的。（复杂度降低到了O(k)，k为产生I/O事件的流的个数，也有认为O(1)的[原文为O(1)，但实际上O(k)更为准确]）

一个epoll模式的代码大概的样子是：


```
while true {
	active_stream[] = epoll_wait(epollfd)
	for i in active_stream[] {
		read or write till unavailable
	}
}
```

```

import socket, select
EOL1 = b'\n\n'
EOL2 = b'\n\r\n'
response  = b'HTTP/1.0 200 OK\r\nDate: Mon, 1 Jan 1996 01:01:01 GMT\r\n'
response += b'Content-Type: text/plain\r\nContent-Length: 13\r\n\r\n'
response += b'Hello, world!'

serversocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
serversocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
serversocket.bind(('0.0.0.0', 8080))
serversocket.listen(1)
serversocket.setblocking(0)
serversocket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

epoll = select.epoll()
epoll.register(serversocket.fileno(), select.EPOLLIN)

try:
   connections = {}; requests = {}; responses = {}
   while True:
      events = epoll.poll(1)
      for fileno, event in events:
         if fileno == serversocket.fileno():
            connection, address = serversocket.accept()
            connection.setblocking(0)
            epoll.register(connection.fileno(), select.EPOLLIN)
            connections[connection.fileno()] = connection
            requests[connection.fileno()] = b''
            responses[connection.fileno()] = response
         elif event & select.EPOLLIN:
            requests[fileno] += connections[fileno].recv(1024)
            if EOL1 in requests[fileno] or EOL2 in requests[fileno]:
               epoll.modify(fileno, select.EPOLLOUT)
               print('-'*40 + '\n' + requests[fileno].decode()[:-2])
         elif event & select.EPOLLOUT:
            byteswritten = connections[fileno].send(responses[fileno])
            responses[fileno] = responses[fileno][byteswritten:]
            if len(responses[fileno]) == 0:
               epoll.modify(fileno, 0)
               connections[fileno].shutdown(socket.SHUT_RDWR)
         elif event & select.EPOLLHUP:
            epoll.unregister(fileno)
            connections[fileno].close()
            del connections[fileno]
finally:
   epoll.unregister(serversocket.fileno())
   epoll.close()
   serversocket.close()
```

想必你肯定从别的地方或者之前有过了解，epoll的效率要远远好于select。
优点有很多，比如
* 支持一个进程打开打开的socket描述符（FD）不受限制（仅受限于操作系统的最大文件句柄数）
* IO效率不随FD数目增加而线性下降

其中第二条我们在上面已经知道了，因为epoll 只会去关心那些有事件的socket而不会像select 那样从头到尾扫一遍。
那么第一条是如何做到的，第二条的原理又是如何呢。
那就要深入了解下二者的源码实现了。
这个之后会单独写两篇文章来具体阐述二者原理。