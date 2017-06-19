title: raspberry
date: 2014-05-19 22:15:10
tags:
---

主要由两种方式 1. USB方式对接 2. GPIO方式对接

# USB 方式对接
## Arduino 部分
将以下代码下载 arduino 中

```
void setup(){
  Serial.begin(9600);
}
void loop(){
  Serial.println("Hello Pi");
  delay(2000);
}
```

### 连接
方式如图

![Alt text](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/1.jpg)

连接后之后查看是否正确识别

```
ls /dev/tty*
```

若列举出 <code>/dev/ttyACM0</code> 文件说明连接成功
## Raspberry pi 部分
首先安装两个库 RPi.GPIO serial
安装GPIO 模块
```
wget http://raspberry-gpio-python.googlecode.com/files/RPi.GPIO-0.3.1a.tar.gz (下载GPIO库)
tar xvzf RPi.GPIO-0.3.1a.tar.gz 
cd RPi.GPIO-0.3.1a 
sudo python setup.py install
```

安装serial

```
sudo apt-get install python-serial
```

打开python 交互环境

```
>>> import serial
>>> ser = serial.Serial('/dev/ttyACM0', 9600)
>>> while 1 :
>>>     ser.readline()
```

得到如下结果
 ![Alt text](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/2.jpg)
## 树莓派向arduino 发送数据

以下代码下载到arduino
```
const int ledPin = 12;
void setup(){
    pinMode(ledPin, OUTPUT);
    Serial.begin(9600);
}
void loop(){
    if (Serial.available()) {
    light(Serial.read() – ‘0’);
}
delay(500);
}
void light(int n){
    for (int i = 0; i < n; i++) {
        digitalWrite(ledPin, HIGH);
        delay(100);
        digitalWrite(ledPin, LOW);
        delay(100);
    }
}
```
在树莓派的python 交互环境继续输入\
```
>>> ser.write('3')
```
此时你会看到 Arduino Led 灯闪三次
![Alt text](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/3.jpg)

## GPIO方式
原理就是 树莓派的pin8(GPIO14) pin10(GPIO15)与Arduion pin0(rx) pin1(tx)的进行对接
** 千万不要因为缺元件直接用线直连 **
###需要准备的元件
GPIO 连接线
![Alt text](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/5.jpg)
GPIO 转接板 
![Alt text](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/4.jpg)
###实物连接图
![实物连接图](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/6.jpg)
###原理说明
树莓派引脚图
![树莓派引脚图](http://7xkghb.com1.z0.glb.clouddn.com/blog/07/7.png)