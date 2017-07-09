title: web 服务器的秘密(-)
date: 2015-03-17 22:11:47
tags:
---

# 同步阻塞迭代模型
web 服务器的底层是socket。socket编程想必大家也是能信手拈来。



```python
import socket

http_response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # 避免TIME_WAIT 后面有详细介绍
server.bind(('0.0.0.0', 9696))
server.listen(1)

while True:
    conn, addr = server.accept()
    print('Receive one connection')
    data = conn.recv(4096)
    conn.send(http_response)
    conn.close()
    sys.exit()
```


先用wrk测一下当前的性能

```
wrk http://127.0.0.1:9696
Running 10s test @ http://127.0.0.1:9696
  2 threads and 10 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency   370.22us    7.01ms 243.17ms   99.76%
    Req/Sec     2.56k     2.38k    6.24k    46.67%
  16059 requests in 10.08s, 0.89MB read
  Socket errors: connect 0, read 218, write 12, timeout 0
Requests/sec:   1593.65
Transfer/sec:     90.27KB
```
10s中处理了16k+的请求
主要影响性能的地方是三处阻塞

在server.accept() conn.recv() conn.send()会发生阻塞  
如果没有客户端进行连接 s.accept() 会阻塞  
没有收到客户端的数据流，s.recy() 会阻塞  
如果输出缓冲区满了， s.send() 会阻塞  

在 accept 阻塞的时候，无法调用 recv 接收客户端数据。在 recv 阻塞的时候也无法调用 accept 接受新的请求。所以它同时只能接受和处理一个请求，如果一个客户端发送数据的速度比较慢，会拖慢整个服务器响应的速度。

我们在conn.recy前加一个**time.sleep(1)** ,模拟一下recv长时间阻塞的情况。这样处理一个请求最少用时变为1s。如果跟我们所想一致的话，10s内最多应该只能接收10个请求。

```
wrk http://127.0.0.1:9696
Running 10s test @ http://127.0.0.1:9696
  2 threads and 10 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     1.90s     0.00us   1.90s   100.00%
    Req/Sec     0.00      0.00     0.00    100.00%
  9 requests in 10.09s, 522.00B read
  Socket errors: connect 0, read 9, write 0, timeout 8
Requests/sec:      0.89
Transfer/sec:      51.71B
```

果然不出所料，依然是10s的测试时间，只接收到了9个请求。

其实这种一次只能处理一个请求的服务器，称之为迭代服务器(iterative server)

# 多进程并发模型
在正常使用中，我们显然不希望整个服务器被单个请求长期占用，因为一个请求处理速度慢而拖累其余请求。而是希望能同时处理多个请求。最简单的方法就是每次fork一个子进程来服务每个请求。

```python
import os
import socket
import time
import sys

http_response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # TIME_WAIT
server.bind(('0.0.0.0', 9696))
server.listen(1)

while True:
    conn, addr = server.accept()
    pid = os.fork()
    if pid == 0:
        time.sleep(1)
        data = conn.recv(4096)
        conn.send(http_response)
        conn.close()
        sys.exit()
```
还是time.sleep(1)，用wrk测试一下

```
wrk http://127.0.0.1:9696
Running 10s test @ http://127.0.0.1:9696
  2 threads and 10 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     1.00s   744.20us   1.00s    69.23%
    Req/Sec     8.58      7.46    40.00     53.23%
  91 requests in 10.06s, 5.15KB read
  Socket errors: connect 0, read 21, write 5, timeout 0
Requests/sec:      9.05
Transfer/sec:     524.75B
```

发现性能得到了极大提升，各个请求之间互不影响。

当我们用wrk测试完毕后，保持server.py 不关闭，我们此时看一下9696端口的占用情况

```
lsof -i :9696

COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
Python  52789 cheng    3u  IPv4 0xfa93685560fec507      0t0  TCP *:9696 (LISTEN)
Python  52789 cheng    5u  IPv4 0xfa93685560defc0f      0t0  TCP localhost:9696->localhost:59616 (CLOSED)
```

我们奇怪的发现此时有两个socket

通过看此时TCP状态我们可以知道 第一个fd为3的socket，此时处于listen状态，应该是负责监听的socket，即我们上述代码里server变量，那么第二个fd为5的socket，就是某一个子进程没有正常关闭的socket了，也就是某个子进程的conn。  
但是我们明明在每个子进程里都显示的执行conn.close()关闭子进程accept产生的socket了，并且代码执行过程中没有任何报错，那么这个fd为5的socket为何没有被关闭？**问题1**
我们在 conn, addr = server.accept() 之后加上一段代码打印出 accept之后产生的socket的fd

```
import os
import socket
import time
import sys

http_response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # TIME_WAIT
server.bind(('0.0.0.0', 9696))
server.listen(1)

while True:
    conn, addr = server.accept()
    print('conn fileno', conn.fileno())
    pid = os.fork()
    if pid == 0:
        time.sleep(1)
        data = conn.recv(4096)
        conn.send(http_response)
        conn.close()
        sys.exit()
```
输出结果如下

```
('conn fileno', 4)
('conn fileno', 5)
('conn fileno', 4)
('conn fileno', 5)
('conn fileno', 4)
('conn fileno', 5)
...
...
...
```

fd 4，5交叉不断循环出现，不断重复使用fd4 和 fd5 的socket。对于不同的请求，每次在accept时都会新建socket来与之通信，难道会重复利用之前的socket？**问题2**


直接告诉答案
问题1，fd为5的socket在conn.close()是被关闭了的，但是关闭的是子进程里fd为5的socket，父进程里的并没被子进程关闭。
问题2， 是复用了，但是复用的不是socket，而是复用了文件描述符fd。

如果如问题1的解释，那肯定又要问如果父进程的fd为5的socket没有被关闭，为何又能被之后的新的请求复用？ **问题3**

问题3，fd为5的socket在父进程中是没有被子进程的conn.close()关闭的，但是最终是被关闭了。被gc(垃圾回收)关闭了。

详细解释：
问题1，在fork之后，父进程所有打开的fd(文件描述符)都会被复制到子进程中。
![blog-2.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-2.png)
因此，在子进程conn.close()，父进程的conn 并不会被关闭。
问题3
文件描述符创建时有几条规律： 1.从小到大创建。如果这个fd没有被释放，则+1 找下一个fd。2 如果当前释放的fd比上一次创建的fd要小，那么下一次创建时从这个释放的fd开始创建。
fd 0分配给了标准输入stdin，fd 1给了标准输出stdout，fd 2给了标准错误stderr。这三个是操作系统默认分配。因此我们的程序最小的fd 是 3。
fd 3 给了 server的 socket，
<code>server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)</code>
while 循环，第一次时创建fd为4的socket，变量conn指向这个socket，一直没有被关闭，第二次循环时创建fd为5的socket，变量conn指向这个fd为5的socket。此时fd为4的socket引用计数为0，除非gc，被回收。第三次循环，又从fd为4开始分配，fd为5释放。

如果循环了偶数次，那么最后fd为5的socket则是最后被conn引用，不会被gc，fd为3的socket一直没有被关闭。
所以 <code>lsof -i :9696</code>会看到fd为3 和 fd为5的两个socket。

问题2的解释会复杂一点。之后会详细介绍。


对于多进程，python提供了更加友善的multiprocessing库

```
import socket
import multiprocessing

response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('0.0.0.0', 9696))
server.listen(32)

def handler(conn, addr):
    request = conn.recv(4096)
    conn.send(response)
    conn.close()

while True:
    conn, addr = server.accept()
    process = multiprocessing.Process(target=handler, args=(conn, addr))
    process.daemon = True
    process.start()
```

