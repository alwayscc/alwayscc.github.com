title: closewait
date: 2017-02-01 18:29:05
tags:
---


再来说下CLOSE_WAIT，这个状态正常情况下很难捕捉到。感兴趣可以自己写个脚本实时打印当前端口的tcp状态

```
#!/bin/bash
while true ; do
    netstat -ant | grep 9123 | while read content; do
        echo "$content"
    done
done
```
能捕捉到 ESTABLISHED，LISTEN，TIME_WAIT，但CLOSE_WAIT因为一方发起FIN后，另一方会立刻发送ACK，然后立刻FIN，CLOSE_WAIT状态停留非常短。为了能捕捉到。继续看这个四次挥手状态图

![blog-105.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-105.png)

可以看到只要被动关闭方不发起自己的close，那么这个CLOSE_WAIT就会hold住。

这次我们让客户端主动发起close，服务端被动close。并且接收到客户端close后，不让服务端close


```
# server.py
import socket
import time

HOST = '127.0.0.1'
PORT = 50000

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((HOST, PORT))
s.listen(1)
conn, addr = s.accept()
time.sleep(100)
data = conn.recv(1024)
conn.sendall(data)
conn.close()
s.close()

```


```
# client.py
import socket

HOST = '127.0.0.1'
PORT = 50000
client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect((HOST, PORT))
client.close()
```


<code>netstat -an|grep 50000</code>
```

tcp4       0      0  127.0.0.1.50000        127.0.0.1.54038        CLOSE_WAIT
tcp4       0      0  127.0.0.1.54038        127.0.0.1.50000        FIN_WAIT_2
tcp4       0      0  127.0.0.1.50000        *.*                    LISTEN

```

跟我们上图的状态一模一样，client 被卡在了FIN_WAIT2, server被卡在了CLOSE_WAIT。

tcpdump 抓包看一下四次挥手

```
16:49:36.004328 IP localhost.54038 > localhost.50000: Flags [F.], seq 1170352074, ack 1003545129, win 12759, options [nop,nop,TS val 750149176 ecr 750149176], length 0

16:49:36.004347 IP localhost.50000 > localhost.54038: Flags [.], ack 1170352075, win 12759, options [nop,nop,TS val 750149176 ecr 750149176], length 0

```
发现四次传输只剩两次了，一次是client close 发起的FIN，一次是server 对FIN的 确认ACK。


那么CLOSE_WAIT在实际生成环境中会不会大量存在呢。会的并且很有可能。就像刚才我们情况，一方已经主动close了，结果自己这边要么被卡着了，要么是忘记close了。导致close延迟就会出现大量的CLOSE_WAIT情况。
还有一种情况就是listen(backlog) 时backlog设置的过大。
这里具体解释下backlog。内核为每个监听的socket维护着两个队列

1. 未完成连接队列(incomplete cnnection queue), 每个这样的SYN分节对应其中一项。已由某个客户发出并到达服务器，而服务器正等待完成三次握手。这些socket处于SYN_RCVD状态
2. 已完成连接队列(completed connection queue),每个已完成三次握手过程的客户对应其中一项。这些套接字处于
ESTABLISHED 状态。

图

图图图


简言之backlog，就是这个等待队列的长度。(这里为方便理解，实际并非如此，不同操作系统对backlog有不同解释)

```
# server.py
import socket
import time

HOST = '127.0.0.1'
PORT = 50001

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((HOST, PORT))
s.listen(1)
while True:
    conn, addr = s.accept()
    time.sleep(100)
    conn.close()
s.close()

s.close()
```

```
# client.py
import socket

HOST = '127.0.0.1'
PORT = 50001

count = 1
avoid_gc_list = []
while True:

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((HOST, PORT))
    print (count)
    avoid_gc_list.append(s)
    count += 1
```

我们设置backlog为1，测试一下。在client端会print count，可以标识现在能正常connect的client个数。

输出结果

```
1
2
```
看

```
netstat -an|grep 50001
tcp4       0      0  127.0.0.1.50001        127.0.0.1.56149        ESTABLISHED
tcp4       0      0  127.0.0.1.56149        127.0.0.1.50001        ESTABLISHED
tcp4       0      0  127.0.0.1.50001        127.0.0.1.56146        ESTABLISHED
tcp4       0      0  127.0.0.1.56146        127.0.0.1.50001        ESTABLISHED
tcp4       0      0  127.0.0.1.50001        *.*                    LISTEN
```

此时处于ESTABLISHED

抓包

```
22:55:43.398439 IP localhost.56146 > localhost.50001: Flags [S], seq 1877013954, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766092041 ecr 0,sackOK,eol], length 0
22:55:43.403350 IP localhost.50001 > localhost.56146: Flags [S.], seq 2733650058, ack 1877013955, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766092041 ecr 766092041,sackOK,eol], length 0
22:55:43.403408 IP localhost.56146 > localhost.50001: Flags [.], ack 2733650059, win 12759, options [nop,nop,TS val 766092046 ecr 766092041], length 0
22:55:43.403429 IP localhost.50001 > localhost.56146: Flags [.], ack 1877013955, win 12759, options [nop,nop,TS val 766092046 ecr 766092046], length 0

22:55:48.407558 IP localhost.56149 > localhost.50001: Flags [S], seq 1753672177, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766097019 ecr 0,sackOK,eol], length 0
22:55:48.409671 IP localhost.50001 > localhost.56149: Flags [S.], seq 3196246778, ack 1753672178, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766097019 ecr 766097019,sackOK,eol], length 0
22:55:48.409685 IP localhost.56149 > localhost.50001: Flags [.], ack 3196246779, win 12759, options [nop,nop,TS val 766097021 ecr 766097019], length 0
22:55:48.409699 IP localhost.50001 > localhost.56149: Flags [.], ack 1753672178, win 12759, options [nop,nop,TS val 766097021 ecr 766097021], length 0



22:55:53.414777 IP localhost.56157 > localhost.50001: Flags [S], seq 1206776312, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766101997 ecr 0,sackOK,eol], length 0
22:55:53.517532 IP localhost.56157 > localhost.50001: Flags [S], seq 1206776312, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766102097 ecr 0,sackOK,eol], length 0
22:55:53.620602 IP localhost.56157 > localhost.50001: Flags [S], seq 1206776312, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766102197 ecr 0,sackOK,eol], length 0
22:55:53.720653 IP localhost.56157 > localhost.50001: Flags [S], seq 1206776312, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766102297 ecr 0,sackOK,eol], length 0
22:55:53.821886 IP localhost.56157 > localhost.50001: Flags [S], seq 1206776312, win 65535, options [mss 16344,nop,wscale 5,nop,nop,TS val 766102397 ecr 0,sackOK,eol], length 0
22:55:53.923137 IP localhost.56157 > localhost.50001: Flags [S], seq 120677

```


第一个connect三次握手，并被accept正确处理了这毫无疑问。第二个connect三次握手后，则存在于backlog的队列里，由于没有被accept取出，会长期在队列里。第三个connect试图建立三次握手，发送SYN，但是由于backlog满了，服务端不会接受此SYN，不发送ACK。客户端的SYN超时重发，所以就看到tcpdump抓包里客户端不断发送SYN。

这里看到第三次connect时，服务端没有发送RST，而是通过不发ACK方式让客户端不断重试。这么做是因为，正常情况下认为这种阻塞是暂时的，这样客户端不断重试，一旦队列有可用空间了，就可以建立连接。如果服务端直接返回了RST，客户端的connect会立刻报错，这样就把tcp的锅直接甩给了应用进程，而这个client也无法再connect。同时如果发了RST就会有二义性，究竟是“究竟是这个端口没人监听(listent)”还是这个端口有监听但是队列满了而已。

OK，下面是关键了，第三个connect因为一直没三次握手连接上因此对服务端没影响。但是第二个connect 因为在backlog队列里已经三次握手建立了tcp连接了，但是client不会一直等server accept，时间到了client 等的不耐烦直接timeout了。这时client会强制close。client端发起了主动关闭，server端呢暂时无法响应这个close。此时server就处于CLOSE_WAIT ，client 处于 FIN_WAIT_2。

```
tcp4       0      0  127.0.0.1.50001        127.0.0.1.56149        CLOSE_WAIT
tcp4       0      0  127.0.0.1.56149        127.0.0.1.50001        FIN_WAIT_2  
```

因此如果backlog设置的过大，server响应过慢则会出现大量的连接还没来得及处理，client就自己断了。 