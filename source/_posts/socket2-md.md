title: 深入socket(二)
date: 2015-06-25 22:42:29
tags:
---

接着<code>sock_create</code>继续展开下去

```
int sock_create(int family, int type, int protocol, struct socket **res)
{
	return __sock_create(family, type, protocol, res, 0);
}
```

```
static int __sock_create(int family, int type, int protocol, struct socket **res, int kern)
{
	int err;
	struct socket *sock;
	...
	...
	...
/*
 *	Allocate the socket and allow the family to set things up. if
 *	the protocol is 0, the family is instructed to select an appropriate
 *	default.
 */

	if (!(sock = sock_alloc())) {
		printk(KERN_WARNING "socket: no more sockets\n");
		err = -ENFILE;		/* Not exactly a match, but its the
					   closest posix thing */
		goto out;
	}

	sock->type  = type;
	
	...
	...
	...
}
```
一步一步调用到**sock_alloc**方法

```
static struct socket *sock_alloc(void)
{
	struct inode * inode;
	struct socket * sock;

	inode = new_inode(sock_mnt->mnt_sb);
	if (!inode)
		return NULL;

	sock = SOCKET_I(inode);// 通过inode查找对应的socket

	inode->i_mode = S_IFSOCK|S_IRWXUGO;
	inode->i_uid = current->fsuid;
	inode->i_gid = current->fsgid;

	get_cpu_var(sockets_in_use)++;
	put_cpu_var(sockets_in_use);
	return sock;
}
```

这里会分配一个inode的结构体和


```
struct inode *new_inode(struct super_block *sb)
{
	static unsigned long last_ino;
	struct inode * inode;

	spin_lock_prefetch(&inode_lock);
	
	inode = alloc_inode(sb);
	if (inode) {
		spin_lock(&inode_lock);
		inodes_stat.nr_inodes++;
		list_add(&inode->i_list, &inode_in_use);
		list_add(&inode->i_sb_list, &sb->s_inodes);
		inode->i_ino = ++last_ino;
		inode->i_state = 0;
		spin_unlock(&inode_lock);
	}
	return inode;
}

```




```
static struct inode *alloc_inode(struct super_block *sb)
{
	static struct address_space_operations empty_aops;
	static struct inode_operations empty_iops;
	static struct file_operations empty_fops;
	struct inode *inode;

	if (sb->s_op->alloc_inode)
		inode = sb->s_op->alloc_inode(sb);//如果指定了创建socket的方法，则用系统指定方法创建
	else 
		inode = (struct inode *) kmem_cache_alloc(inode_cachep, SLAB_KERNEL);
	
	...
	...
	...

		return inode;
}
```

这里补充一点，内核初始化时，会调用 <code>kernel_init()</code> 
当初始化socket部分时，会调用<code>core_initcall(sock_init);</code>
在初始化时，会有一系列操作, 从而系统会指定创建socket对应的inode方法

```
static struct super_operations sockfs_ops = {
	.alloc_inode =	sock_alloc_inode,
	.destroy_inode =sock_destroy_inode,
	.statfs =	simple_statfs,
};
```
指定创建inode的方法为 <code> sock_alloc_inode </code>

```
static struct inode *sock_alloc_inode(struct super_block *sb)
{
	struct socket_alloc *ei;
	ei = (struct socket_alloc *)kmem_cache_alloc(sock_inode_cachep, SLAB_KERNEL);
	if (!ei)
		return NULL;
	init_waitqueue_head(&ei->socket.wait);
	
	ei->socket.fasync_list = NULL;
	ei->socket.state = SS_UNCONNECTED;
	ei->socket.flags = 0;
	ei->socket.ops = NULL;
	ei->socket.sk = NULL;
	ei->socket.file = NULL;
	ei->socket.flags = 0;

	return &ei->vfs_inode;
}
```

这里实际创建了一个 <code> socket_alloc </code>结构体，把成员inode返回了。

```
struct socket_alloc {
	struct socket socket;
	struct inode vfs_inode;
};
```
之后就可以通过<code> SOCKET_I </code> 和 <code>SOCK_INODE</code>来找到inode 对应的socket和socket对应的inode了

```
static inline struct socket *SOCKET_I(struct inode *inode)
{
	return &container_of(inode, struct socket_alloc, vfs_inode)->socket;
}

static inline struct inode *SOCK_INODE(struct socket *socket)
{
	return &container_of(socket, struct socket_alloc, socket)->vfs_inode;
}

```


到目前为止我们的函数执行过程如下图所示

![blog-3.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-3.png)


到目前位置已知的数据结构和之间的对应关系为

![blog-4.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-4.png)

