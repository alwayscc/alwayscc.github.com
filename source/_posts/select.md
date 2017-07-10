title: 深入select
date: 2015-10-01 16:36:22
tags:
---


看下Python select 的c [源码](https://fossies.org/dox/Python-2.7.13/selectmodule_8c_source.html)


```
static PyObject *
select_select(PyObject *self, PyObject *args)
{
  ...
  ...
  ...
  
      do {
        Py_BEGIN_ALLOW_THREADS
        errno = 0;
        n = select(max, &ifdset, &ofdset, &efdset, tvp);
        Py_END_ALLOW_THREADS

        if (errno != EINTR)
            break;

        /* select() was interrupted by a signal */
        if (PyErr_CheckSignals())
            goto finally;

        if (tvp) {
            timeout = deadline - _PyTime_GetMonotonicClock();
            if (timeout < 0) {
                n = 0;
                break;
            }
            _PyTime_AsTimeval_noraise(timeout, &tv, _PyTime_ROUND_CEILING);
            /* retry select() with the recomputed timeout */
        }
    } while (1);
    
    
    ...
    ...
    ...

```

调用了 c 的select。接着一步步查select 的内核实现

```
asmlinkage long sys_select(int n, fd_set __user *inp, fd_set __user *outp,
			fd_set __user *exp, struct timeval __user *tvp)
{
	s64 timeout = -1;
	struct timeval tv;
	int ret;

	if (tvp) {
		if (copy_from_user(&tv, tvp, sizeof(tv)))
			return -EFAULT;

		if (tv.tv_sec < 0 || tv.tv_usec < 0)
			return -EINVAL;

		/* Cast to u64 to make GCC stop complaining */
		if ((u64)tv.tv_sec >= (u64)MAX_INT64_SECONDS)
			timeout = -1;	/* infinite */
		else {
			timeout = DIV_ROUND_UP(tv.tv_usec, USEC_PER_SEC/HZ);
			timeout += tv.tv_sec * HZ;
		}
	}

	ret = core_sys_select(n, inp, outp, exp, &timeout);

	if (tvp) {
		struct timeval rtv;

		if (current->personality & STICKY_TIMEOUTS)
			goto sticky;
		rtv.tv_usec = jiffies_to_usecs(do_div((*(u64*)&timeout), HZ));
		rtv.tv_sec = timeout;
		if (timeval_compare(&rtv, &tv) >= 0)
			rtv = tv;
		if (copy_to_user(tvp, &rtv, sizeof(rtv))) {
sticky:
			/*
			 * If an application puts its timeval in read-only
			 * memory, we don't want the Linux-specific update to
			 * the timeval to cause a fault after the select has
			 * completed successfully. However, because we're not
			 * updating the timeval, we can't restart the system
			 * call.
			 */
			if (ret == -ERESTARTNOHAND)
				ret = -EINTR;
		}
	}

	return ret;
}
```


```
static int core_sys_select(int n, fd_set __user *inp, fd_set __user *outp,
			   fd_set __user *exp, s64 *timeout)
{
	fd_set_bits fds;
	void *bits;
	int ret, max_fds;
	unsigned int size;
	struct fdtable *fdt;
	/* Allocate small arguments on the stack to save memory and be faster */
	long stack_fds[SELECT_STACK_ALLOC/sizeof(long)];

	ret = -EINVAL;
	if (n < 0)
		goto out_nofds;

	/* max_fds can increase, so grab it once to avoid race */
	rcu_read_lock();
	fdt = files_fdtable(current->files);
	max_fds = fdt->max_fds;
	rcu_read_unlock();
	if (n > max_fds)
		n = max_fds;

	/*
	 * We need 6 bitmaps (in/out/ex for both incoming and outgoing),
	 * since we used fdset we need to allocate memory in units of
	 * long-words. 
	 */
	size = FDS_BYTES(n);
	bits = stack_fds;
	if (size > sizeof(stack_fds) / 6) {
		/* Not enough space in on-stack array; must use kmalloc */
		ret = -ENOMEM;
		bits = kmalloc(6 * size, GFP_KERNEL);
		if (!bits)
			goto out_nofds;
	}
	fds.in      = bits;
	fds.out     = bits +   size;
	fds.ex      = bits + 2*size;
	fds.res_in  = bits + 3*size;
	fds.res_out = bits + 4*size;
	fds.res_ex  = bits + 5*size;

	if ((ret = get_fd_set(n, inp, fds.in)) ||
	    (ret = get_fd_set(n, outp, fds.out)) ||
	    (ret = get_fd_set(n, exp, fds.ex)))
		goto out;
	zero_fd_set(n, fds.res_in);
	zero_fd_set(n, fds.res_out);
	zero_fd_set(n, fds.res_ex);

	ret = do_select(n, &fds, timeout);

	if (ret < 0)
		goto out;
	if (!ret) {
		ret = -ERESTARTNOHAND;
		if (signal_pending(current))
			goto out;
		ret = 0;
	}

	if (set_fd_set(n, inp, fds.res_in) ||
	    set_fd_set(n, outp, fds.res_out) ||
	    set_fd_set(n, exp, fds.res_ex))
		ret = -EFAULT;

out:
	if (bits != stack_fds)
		kfree(bits);
out_nofds:
	return ret;
}


```

fd_set_bits 是6个bitmaps，前三个是用户传来的bitmaps，后三个是用来存储do_select执行结果。
get_fd_set， 复制用户的fd_set, zero_fd_set， 先把用来存结果的先清零。


```
typedef struct {
	unsigned long *in, *out, *ex;
	unsigned long *res_in, *res_out, *res_ex;
} fd_set_bits;
```

真行的执行是在do_select实现的。

```
int do_select(int n, fd_set_bits *fds, s64 *timeout)
{
	struct poll_wqueues table;
	poll_table *wait;
	int retval, i;

	rcu_read_lock();
	retval = max_select_fd(n, fds);
	rcu_read_unlock();

	if (retval < 0)
		return retval;
	n = retval;

	poll_initwait(&table);
	wait = &table.pt;
	if (!*timeout)
		wait = NULL;
	retval = 0;
	for (;;) {
		unsigned long *rinp, *routp, *rexp, *inp, *outp, *exp;
		long __timeout;

		set_current_state(TASK_INTERRUPTIBLE);

		inp = fds->in; outp = fds->out; exp = fds->ex;
		rinp = fds->res_in; routp = fds->res_out; rexp = fds->res_ex;

		for (i = 0; i < n; ++rinp, ++routp, ++rexp) {
			unsigned long in, out, ex, all_bits, bit = 1, mask, j;
			unsigned long res_in = 0, res_out = 0, res_ex = 0;
			const struct file_operations *f_op = NULL;
			struct file *file = NULL;

			in = *inp++; out = *outp++; ex = *exp++;
			all_bits = in | out | ex;
			if (all_bits == 0) {
				i += __NFDBITS;
				continue;
			}

			for (j = 0; j < __NFDBITS; ++j, ++i, bit <<= 1) {
				int fput_needed;
				if (i >= n)
					break;
				if (!(bit & all_bits))
					continue;
				file = fget_light(i, &fput_needed);
				if (file) {
					f_op = file->f_op;
					mask = DEFAULT_POLLMASK;
					if (f_op && f_op->poll)
						mask = (*f_op->poll)(file, retval ? NULL : wait);
					fput_light(file, fput_needed);
					if ((mask & POLLIN_SET) && (in & bit)) {
						res_in |= bit;
						retval++;
					}
					if ((mask & POLLOUT_SET) && (out & bit)) {
						res_out |= bit;
						retval++;
					}
					if ((mask & POLLEX_SET) && (ex & bit)) {
						res_ex |= bit;
						retval++;
					}
				}
				cond_resched();
			}
			if (res_in)
				*rinp = res_in;
			if (res_out)
				*routp = res_out;
			if (res_ex)
				*rexp = res_ex;
		}
		wait = NULL;
		if (retval || !*timeout || signal_pending(current))
			break;
		if(table.error) {
			retval = table.error;
			break;
		}

		if (*timeout < 0) {
			/* Wait indefinitely */
			__timeout = MAX_SCHEDULE_TIMEOUT;
		} else if (unlikely(*timeout >= (s64)MAX_SCHEDULE_TIMEOUT - 1)) {
			/* Wait for longer than MAX_SCHEDULE_TIMEOUT. Do it in a loop */
			__timeout = MAX_SCHEDULE_TIMEOUT - 1;
			*timeout -= __timeout;
		} else {
			__timeout = *timeout;
			*timeout = 0;
		}
		__timeout = schedule_timeout(__timeout);
		if (*timeout >= 0)
			*timeout += __timeout;
	}
	__set_current_state(TASK_RUNNING);

	poll_freewait(&table);

	return retval;
}
```

先看<code>for (;;)</code>这个死循环里的，先说这里从Python就开始传的参数n，这个是最大max_fd, 因为我们知道select 监听的 fds_bits 一共是1024位 <code>#define __FD_SETSIZE	1024</code> 指定了最大的fd n，可以避免每次循环1024个，这样只需要每次循环到fd = n 时就可以了，节约资源。



```
for (i = 0; i < n; ++rinp, ++routp, ++rexp)
    for (j = 0; j < __NFDBITS; ++j, ++i, bit <<= 1
```

这两层循环遍历了所有fd_set 的 bit， 对每个fd 

<code>mask = (*f_op->poll)(file, retval ? NULL : wait);</code>
调用 file 的poll。这里poll 不再继续展开介绍，大体的功能是检查当前的文件状态，返回一个mask描述当前的操作是否就绪。我们把这个标志mask的结果写回结果的fd_set。
如果当前的mask 表示 read 操作就绪，<code>(mask & POLLIN_SET)</code> 那么就写到关心 read 操作的 fd_set中 <code>res_in |= bit;</code>

遍历了一圈如果有一个事件发生 retval 就有了值或者timeout 超时了，退出循环，通知上一层。 如果一个关系的事件都没有到来，则进入休眠
<code>__timeout = schedule_timeout(__timeout);</code>。 

OK，我们总结一下
1. select只能监听有限个socket，主要因为<code>__FD_SETSIZE</code>限制
2. select 会轮训一遍socket(其实就轮询到max_fd不会轮询完 __FD_SETSIZE)但不会一直轮询所有的socket，如果一次轮询之后没有结果，会进入休眠，节约cpu资源