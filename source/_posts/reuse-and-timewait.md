title: reuse-and-timewait
date: 2016-12-06 18:27:37
tags:
---


<code>server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)</code>

这段代码作用是什么？可以把这行代码注掉重新执行下我们的server。

```
# server.py
import socket

HOST = '127.0.0.1'
PORT = 9595

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((HOST, PORT))
s.listen(1)
conn, addr = s.accept()
data = conn.recv(1024)
conn.send(data)
conn.close()
s.close()
```

```
# client.py
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect((HOST, PORT))
s.close()
```



ctrl+c 关掉后立刻重新再运行。发现报错了 

<code>socket.error: [Errno 48] Address already in use</code>。告知我们这个端口被占用了。这时候第一反应单进程，进程都没了，这个socket肯定被回收了，9595端口自然是空闲没人用了啊。

netstat 查看下端口占用情况
```
netstat -n|grep 9595
tcp4       0      0  127.0.0.1.9595         127.0.0.1.52846        TIME_WAIT
```

发现确实被占用着，此时状态为TIME_WAIT。

这就要从四次挥手(4way handshake)开始说起了

看下四次挥手的过程

![blog-105.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-105.png)
四次挥手中，通信的两端发起关闭的成为主动方，另一端成为被动方。
首先为什么要四次挥手？三次握手这个很简单，因为要确保我知道你知道我知道
四次原因是，因为tcp 是双全工，意思是在发送数据的同时也能接收数据。因此要双向关闭

client向server发送关闭请求，表示client不再发送数据，server响应(server 不能read)。此时server端仍然可以向client发送数据(server可以write)，待server端发送数据结束后，就向client发送关闭请求，然后client确认。


可以看到主动发起关闭那一方在真正close前还需要等待 <code>TIME_WAIT</code> 时间。

为什么要等待<code>TIME_WAIT</code>？
主要有两个原因
1. 实现可靠的连接中止
 TCP 有四个报文，最后一个ACK是从执行主动关闭一方发往被动关闭一方。假设此ack丢失，被动关闭一方没收到ACK(一个MSL)，会重发一个FIN(一个MSL)，此时主动关闭方处于TIME_WAIT等待则可以收到FIN后重发ACK。因此一个TIME_WAIT时间等于2MSL，一个MSL留给ACK到达被动关闭方的时间，另一个留给超时重发MSL到达主动关闭方的时间。

2. 让老的重复的报文段在网络中过期失效
如果旧的连接没有等待TIME_WAIT时间直接关闭了，如果有某些旧报文超时而后触发重传，这时立刻重新server依旧bind 原端口，那么上一次遗留的旧报文则会被新的socket接收。

 socket可以使用SO_REUSEADDR来避免这种情况


计算一下TIME_WAIT的时间

```
# server.py
import socket
import time

HOST = '127.0.0.1'
PORT = 9333

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((HOST, PORT))
s.listen(1)
conn, addr = s.accept()
conn.close()
s.close()
t1 = time.time()

while True:
    try:
        newserver = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        newserver.bind((HOST, PORT))
    except socket.error as e:
        print e
        continue

    newserver.close()
    t2 = time.time()
    break

print(t2-t1)

```

```
# client.py
import socket
HOST = '127.0.0.1'
PORT = 9333

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect((HOST, PORT))
s.recv(1024)
s.close()
```

客户端client 连接后 recv 阻塞， 服务端server accept之后立马close，成为主动关闭方，计下此时时间t1
重新建立新链接，因为处于TIME_WAIT， 再次bind 会报错，catch住，while循环直到不报错为止。记下此时时间t2，t2-t1算下时间差
30.4251639843秒

<code>sysctl net.inet.tcp</code>看下msl数值

```
net.inet.tcp.always_keepalive: 0
net.inet.tcp.max_persist_timeout: 0
net.inet.tcp.msl: 15000   # MSL 数值
net.inet.tcp.keepcnt: 8
net.inet.tcp.cc_debug: 0
net.inet.tcp.newreno_sockets: 0
net.inet.tcp.background_sockets: 2
net.inet.tcp.cubic_sockets: 1206
net.inet.tcp.use_newreno: 0
net.inet.tcp.cubic_use_minrtt: 0
net.inet.tcp.cubic_fast_c
```
15000ms * 2 =30 s跟我们的结果一致

这个时间跟操作系统不同而不同，并不一定都是这个数值

