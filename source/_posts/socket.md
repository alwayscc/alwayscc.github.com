title: 深入socket(一)
date: 2015-06-18 16:18:38
tags:
---


<code>server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)</code>

创建socket时，会发起系统调用，调用内核的<code>sys_socketcall</code>函数


```

// net/socket.c 内核源码

asmlinkage long sys_socketcall(int call, unsigned long __user *args)
{
	unsigned long a[6];
	unsigned long a0,a1;
	int err;

	if(call<1||call>SYS_RECVMSG)
		return -EINVAL;

	/* copy_from_user should be SMP safe. */
	if (copy_from_user(a, args, nargs[call]))
		return -EFAULT;

	err = audit_socketcall(nargs[call]/sizeof(unsigned long), a);
	if (err)
		return err;

	a0=a[0];
	a1=a[1];
	
	switch(call) 
	{
		case SYS_SOCKET:
			err = sys_socket(a0,a1,a[2]);
			break;
		case SYS_BIND:
			err = sys_bind(a0,(struct sockaddr __user *)a1, a[2]);
			break;
		case SYS_CONNECT:
			err = sys_connect(a0, (struct sockaddr __user *)a1, a[2]);
			break;
		case SYS_LISTEN:
			err = sys_listen(a0,a1);
			break;
		case SYS_ACCEPT:
			err = sys_accept(a0,(struct sockaddr __user *)a1, (int __user *)a[2]);
		
		
		...
		...
		...


```

根据信号选择不同函数处理，创建sockcet会发出<code>SYS_SOCKET</code>信号，从而由`<code>sys_socket</code>处理

```
asmlinkage long sys_socket(int family, int type, int protocol)
{
	int retval;
	struct socket *sock;

	retval = sock_create(family, type, protocol, &sock);
	
	if (retval < 0)
		goto out;

	retval = sock_map_fd(sock);
	
	if (retval < 0)
		goto out_release;

out:
	/* It may be already another descriptor 8) Not kernel problem. */
	return retval;

out_release:
	sock_release(sock);
	return retval;
}
```

主要做两件事  
1. <code>sock_create</code>, 生成一个socket  
2. <code>sock_map_fd</code>, 生成一个fd跟这个socket绑定, 使socket能通过fd进行访问

sock_create 创建socket, 传入的 <code>struct socket *sock</code>, 这个socket 结构体就是我们socket 的数据结构。具体创建过程我们这里不做详细展开。


```
// include/linux/net.h
struct socket {
	socket_state		state;
	unsigned long		flags;
	struct proto_ops	*ops;
	struct fasync_struct	*fasync_list;
	struct file		*file;
	struct sock		*sk;
	wait_queue_head_t	wait;
	short			type;
};
```





主要看一下<code>sock_map_fd</code>


```
int sock_map_fd(struct socket *sock)
{
	int fd;
	struct qstr this;
	char name[32];

	/*
	 *	Find a file descriptor suitable for return to the user. 
	 */

	fd = get_unused_fd(); //获取一个未被使用的fd
	if (fd >= 0) {
		struct file *file = get_empty_filp();// 创建一个文件对象

		if (!file) {
			put_unused_fd(fd);
			fd = -ENFILE;
			goto out;
		}

		this.len = sprintf(name, "[%lu]", SOCK_INODE(sock)->i_ino);
		this.name = name;
		this.hash = SOCK_INODE(sock)->i_ino;

		file->f_dentry = d_alloc(sock_mnt->mnt_sb->s_root, &this);
		if (!file->f_dentry) {
			put_filp(file);
			put_unused_fd(fd);
			fd = -ENOMEM;
			goto out;
		}
		file->f_dentry->d_op = &sockfs_dentry_operations;
		d_add(file->f_dentry, SOCK_INODE(sock));
		file->f_vfsmnt = mntget(sock_mnt);
		file->f_mapping = file->f_dentry->d_inode->i_mapping;

		sock->file = file;// file和 sock->file绑定
		file->f_op = SOCK_INODE(sock)->i_fop = &socket_file_ops;
		file->f_mode = FMODE_READ | FMODE_WRITE;
		file->f_flags = O_RDWR;
		file->f_pos = 0;
		file->private_data = sock;
		fd_install(fd, file);// fd 和 file 绑定
	}

out:
	return fd;
}
```

重点看下 <code>get_unused_fd</code>


```
int get_unused_fd(void)
{
	struct files_struct * files = current->files;
	int fd, error;
	struct fdtable *fdt;

  	error = -EMFILE;
	spin_lock(&files->file_lock);

	// 找到第一个可用的文件描述符fd
repeat:
	fdt = files_fdtable(files);
 	fd = find_next_zero_bit(fdt->open_fds->fds_bits,
				fdt->max_fdset,
				fdt->next_fd);

	/*
	 * N.B. For clone tasks sharing a files structure, this test
	 * will limit the total number of files that can be opened.
	 */
	if (fd >= current->signal->rlim[RLIMIT_NOFILE].rlim_cur)
		goto out;

	/* Do we need to expand the fd array or fd set?  */
	error = expand_files(files, fd);
	if (error < 0)
		goto out;

	if (error) {
		/*
	 	 * If we needed to expand the fs array we
		 * might have blocked - try again.
		 */
		error = -EMFILE;
		goto repeat;
	}
	// 
	FD_SET(fd, fdt->open_fds);// 标记为已打开(设置open_fds->fds_bits 的fd标志位 为 1)
	FD_CLR(fd, fdt->close_on_exec);
	fdt->next_fd = fd + 1;// fd
#if 1
	/* Sanity check */
	if (fdt->fd[fd] != NULL) {
		printk(KERN_WARNING "get_unused_fd: slot %d not NULL!\n", fd);
		fdt->fd[fd] = NULL;
	}
#endif
	error = fd;

out:
	spin_unlock(&files->file_lock);
	return error;
}
```

<code>get_unused_fd</code> 主要从小开始找到第一个可用的fd，然后标记为忙(不可被用来标识其他文件)。
可以看到是从 <code>fdt->open_fds->fds_bits</code> 来找第一个可用fd，并且找到后要把 <code>FD_SET(fd, fdt->open_fds);</code> 标记为已分配。

从fdt的结构体里看到

```
struct fdtable {
	unsigned int max_fds;
	int max_fdset;
	int next_fd;
	struct file ** fd;      /* current fd array */
	fd_set *close_on_exec;
	fd_set *open_fds;
	struct rcu_head rcu;
	struct files_struct *free_files;
	struct fdtable *next;
};
```

<code>open_fds</code> 数据类型是 <code>fd_set</code>

```
// include/linux/types.h
typedef __kernel_fd_set		fd_set;

// include/linux/posix_types.h
typedef struct {
	unsigned long fds_bits [__FDSET_LONGS];
} __kernel_fd_set;

// include/linux/posix_types.h
#define __FD_SETSIZE	1024
#define __NFDBITS	(8 * sizeof(unsigned long))
#define __FDSET_LONGS	(__FD_SETSIZE/__NFDBITS)

```

我们可以看出<code>open_fds->fds_bits</code> 是一个数组，长度为<code>__FDSET_LONGS</code>数组中每个元素有 sizeof(unsigned long)*8 个比特位，fds_bits一共有 1024个比特位。这种用bit来存储数据的方式成为bitmap(具体介绍可以参看[这里](https://en.wikipedia.org/wiki/Bit_array))，好处是可以大大节省存储空间。

```
__FDSET_LONGS * (sizeof(unsigned long) * 8)

= __FD_SETSIZE/__NFDBITS * sizeof(unsigned long) * 8 
= 1024 / 8 * sizeof(unsigned long) * sizeof(unsigned long) * 8 
= 1024
```

用图表说明一下分配一个fd过程 <code>get_unused_fd</code>

![blog-1.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-1.png)

1. 获得 <code>fdt = files_fdtable(files);</code>
2. 从fdt->open_fds里找第一个为0的标志位，这里0号，1号，2号，默认分配给了标准输入、标准输出和标准错误。
3. 找到第三个比特位是0，分配一个fd为3出来
4. 把第三个比特位设置为1，表明已经被分配了<code>FD_SET(fd, fdt->open_fds);<code>
5. <code>fdt->next=fd+1<code>fdt->next变为4，则下一次分配的时候从fdt->next 第四个比特位开始找起。


知道了在创建时如何分配fd，再看一下socket close时如何回收fd

同样地socket在关闭时也会发起系统调用

```
//  fs/open.c

asmlinkage long sys_close(unsigned int fd)
{
	struct file * filp;
	struct files_struct *files = current->files;
	struct fdtable *fdt;

	spin_lock(&files->file_lock);
	fdt = files_fdtable(files);//通过进程的打开文件列表获得fdtable
	if (fd >= fdt->max_fds)
		goto out_unlock;
	filp = fdt->fd[fd];
	if (!filp)
		goto out_unlock;
	rcu_assign_pointer(fdt->fd[fd], NULL);
	FD_CLR(fd, fdt->close_on_exec);
	__put_unused_fd(files, fd);//释放文件描述符 
	spin_unlock(&files->file_lock);
	return filp_close(filp, files);//释放文件资源

out_unlock:
	spin_unlock(&files->file_lock);
	return -EBADF;
}
```

跟上面分配fd 对应的是释放fd的操作
**\_\_put\_unused\_fd**

```
static inline void __put_unused_fd(struct files_struct *files, unsigned int fd)
{
	struct fdtable *fdt = files_fdtable(files);
	__FD_CLR(fd, fdt->open_fds);
	if (fd < fdt->next_fd)
		fdt->next_fd = fd;
}
```
1. 会把释放的fd对应的fdt->open_fds标志位重新置为0。
2. fdt->next指向当前fd对应的标志位。
这样也就解释了[上文](/2015/03/17/webserver1/)中为fd=4的文件描述符会被不断利用的原因。
