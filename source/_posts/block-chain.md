title: 区块链
date: 2017-07-01 19:38:36
tags:
---


最近这段时间比特币火的是一塌糊涂, 看看coindesk 比特币这走势图
![blog-100.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-100.png)。感觉自己又错失一次财富自由的机会。也正是由于市场的火爆也开始慢慢关注这个行业。

今天就聊一下比特币的核心基础区块链(blockchain),是中本聪(Nakamoto Satoshi)2008年在比特币白皮书中提出地概念。具体的大家可以Google了解下。这里主要讲下用python代码来辅助理解。

先直接上代码了


```
import hashlib
from . import block_params


class Block():

    def __init__(self, params):
        self.index = params.index
        self.previous_hash = params.previous_hash
        self.timestamp = params.timestamp
        self.data = params.data
        self.hash = self.calc_hash()

    def params(self):
        return block_params.BlockParams(
            self.index,
            self.previous_hash,
            self.timestamp,
            self.data
        )

    @classmethod
    def genesis_block(cls):
        params = block_params.BlockParams.genesis_params()
        return cls(params)

    def calc_hash(self):
        return hashlib.sha256(str(self.params()).encode()).hexdigest()

    def has_valid_index(self, previous_block):
        return self.index == previous_block.index + 1

    def has_valid_previous_hash(self, previous_block):
        return self.previous_hash == previous_block.hash

    def has_valid_hash(self):
        return self.calc_hash() == self.hash
```


```
class BlockChain():

    def __init__(self):
        self.blockchain_store = self.fetch_blockchain()

    def latest_block(self):
        return self.blockchain_store[-1]

    def generate_next_block(self, data):
        index = len(self.blockchain_store)
        previous_hash = self.latest_block().hash
        timestamp = int(time.time())

        params = block_params.BlockParams(index, previous_hash, timestamp, data)
        new_block = block.Block(params)
        self.blockchain_store.append(new_block)

    # @TODO mock implement
    def fetch_blockchain(self):
        return [block.Block.genesis_block()]

    def receive_new_block(self, new_block):
        previous_block = self.latest_block()

        if not new_block.has_valid_index(previous_block):
            print('invalid index')
            return
        if not new_block.has_valid_previous_hash(previous_block):
            print('invalid previous hash')
            return
        if not new_block.has_valid_hash():
            print('invalid hash')
            return

        self.blockchain_store.append(new_block)
```

```
GENESIS_INDEX = 0
GENESIS_PREVIOUS_HASH = '0'
GENESIS_TIMESTAMP = 1495851743
GENESIS_DATA = 'first block'


class BlockParams():

    def __init__(self, index, previous_hash, timestamp, data):
        self.index = index
        self.previous_hash = previous_hash
        self.timestamp = timestamp
        self.data = data

    def __str__(self):
        return str(self.index) + self.previous_hash + str(self.timestamp) + self.data

    @classmethod
    def genesis_params(cls):
        return cls(GENESIS_INDEX, GENESIS_PREVIOUS_HASH, GENESIS_TIMESTAMP, GENESIS_DATA)
```

先看下每个区块(block)都有哪些基本的属性(attribute)，
<code>Block __init__ </code>
index, previousHash, timestamp, data, hash。
* index 标志了这个区块(block)在区块链(block chain)里的顺序。
* timestamp 时间戳表明这个区块是何时被创建的。
* data 区块里的记录的信息数据
* hash 这个区块的hash
* previousHash 上一个区块的hash

这里的HASH 主要有两个作用 1作为block的唯一标识 2 进行数据校验

每一个区块都会存储一些信息，对于比特币来讲存的就是交易信息，就是每次交易的记账信息。这里用data 属性标识。

<code>generate_next_block(self, data)</code>创建一个块，用块(block)里存储的data，index, 上一个块的唯一标识hash，当前时间戳timestamp，来生成一个新块。

说过区块链(block chain)是一条chain，每一个block 通过自身的previous_hash指向他关联的上一个block，这样一个一个的block就链接成为了一条block 链。
对于每一个新block来讲，previous block 就是当前链条的最后一个块(latest_block)

一条block chain里的block都是有序的，index 就是每个block在block chain的位置。

关于每一个block里究竟存了什么data，可以去[blockchain](https://blockchain.info/)查看。例如
[#473054](https://blockchain.info/block/0000000000000000008ec0f5ab9a905f4446279f218603532cf3bfcb029f709f) 块的信息。

![blog-101](http://7xkghb.com1.z0.glb.clouddn.com/blog-101.png)

从上图可以看到存储的主要是p2p之间的交易(transactions)

![blog-102](http://7xkghb.com1.z0.glb.clouddn.com/blog-102.png)

以上信息表明当前区块链长度(或者叫高度更恰当) Height为473054(如果不算创世块的话)
Block Reward 矿工奖励 12.5 个比特币 
Timestamp 时间戳 2017-06-27 04:23:43
Previous Block 上一个块hash
Hash 当前块的hash
Number Of Transactions	这个块里记录的交易数 1092


block chain 第一个块叫 创始块(Genesis block) 

比特币的[创始块](https://blockchain.info/block/000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f)信息如下
![blog-103](http://7xkghb.com1.z0.glb.clouddn.com/blog-103.png)


创始块是被hard code进去的<code>genesis_block</code>生成的，通过固定参数初始化。

当一个区块产生后，要加在block chain尾部，在加入前要做系列检查 <code>receive_new_block</code>
之前说个每个block 都会有各种各样的hash，作用一个是唯一标识另一个是用来校验。下面具体讲一下校验的原理。主要校验一下三个
index，previous hash， hash

首先确保当前的index合法，<code>has_valid_index</code>，保证区块链上的block是有序增加的
其次确保<code>has_valid_previous_hash</code>
再次<code>has_valid_hash</code>
保证这个块的合法性，没有丢失被篡改信息。

通过校验后才会加到区块链中<code>self.blockchain_store.append(new_block)</code>

由于区块链是分布式的，每一个节点(node)都存着一条block chain 的备份，如果两个节点发生了冲突。
![blog-104](http://7xkghb.com1.z0.glb.clouddn.com/blog-104.png)

因为最终只能有一条唯一有效的block chain，区块链的做法是选择那条最长chain， 对于上图的第一个hash为a350235b00的将被废弃，选择hash为 0934ae8caa的block 作为 #72

```
def replace_chain(self, block: self.blockchain_store)
  if self.is_valid_chain(blocks) and len(blocks) > self.length:
    self.blockchain_store = blocks
  else:
    self.log('Receive blockchain invalid')
```


每个节点在产生新块(new block)时必须要进行全网广播告知其余的节点，其余节点收到这个信息后，如果这个new block的index 比自己的block chain 上的index都大，这个节点因为担心自己的block chain 可能不是最全的，得先去问问其余节点完整的block chain 是啥，问完后，校验无误加到现有block chain上


