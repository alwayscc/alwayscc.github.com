title: 深入理解epoll
date: 2015-10-03 16:36:26
tags:
---

上回聊完了select，这里接着聊epoll
先看下example 

```
import os
import fcntl
import socket
import select

response = 'HTTP/1.1 200 OK\r\nConnection: Close\r\nContent-Length: 1\r\n\r\nA'

server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('0.0.0.0', 8080))
server.listen(32)

flags = fcntl.fcntl(server.fileno(), fcntl.F_GETFL)
fcntl.fcntl(server.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)

clients = {}

epoll = select.epoll()
epoll.register(server, select.EPOLLIN)

while True:
        events = epoll.poll()

        for fileno, event in events:
                if fileno == server.fileno():
                        client, clientaddr = server.accept()
                        epoll.register(client, select.EPOLLIN)
                        clients[client.fileno()] = client
                elif event == select.EPOLLIN:
                        client = clients[fileno]
                        request = client.recv(4096)
                        client.send(response)
                        del clients[fileno]
                        epoll.unregister(client)
                        client.close()
```

第一步创建epoll
<code>epoll = select.epoll()</code> 看下[c源码]

```
static PyObject *
pyepoll_new(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    int sizehint = -1;
    static char *kwlist[] = {"sizehint", NULL};

    if (!PyArg_ParseTupleAndKeywords(args, kwds, "|i:epoll", kwlist,
                                     &sizehint))
        return NULL;

    return newPyEpoll_Object(type, sizehint, -1);
}
```

```
static PyObject *
newPyEpoll_Object(PyTypeObject *type, int sizehint, SOCKET fd)
{
    pyEpoll_Object *self;

    if (sizehint == -1) {
        sizehint = FD_SETSIZE-1;
    }
    else if (sizehint < 1) {
        PyErr_Format(PyExc_ValueError,
                     "sizehint must be greater zero, got %d",
                     sizehint);
        return NULL;
    }

    assert(type != NULL && type->tp_alloc != NULL);
    self = (pyEpoll_Object *) type->tp_alloc(type, 0);
    if (self == NULL)
        return NULL;

    if (fd == -1) {
        Py_BEGIN_ALLOW_THREADS
        self->epfd = epoll_create(sizehint);
        Py_END_ALLOW_THREADS
    }
    else {
        self->epfd = fd;
    }
    if (self->epfd < 0) {
        Py_DECREF(self);
        PyErr_SetFromErrno(PyExc_IOError);
        return NULL;
    }
    return (PyObject *)self;
}

```

<code>epoll_create</code> 继续会调用 <code>sys_epoll_create</code>开始进入内核


```
asmlinkage long sys_epoll_create(int size)
{
	int error, fd = -1;
	struct eventpoll *ep;
	struct inode *inode;
	struct file *file;

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_create(%d)\n",
		     current, size));

	/*
	 * Sanity check on the size parameter, and create the internal data
	 * structure ( "struct eventpoll" ).
	 */
	error = -EINVAL;
	if (size <= 0 || (error = ep_alloc(&ep)) != 0)
		goto error_return;

	/*
	 * Creates all the items needed to setup an eventpoll file. That is,
	 * a file structure, and inode and a free file descriptor.
	 */
	error = anon_inode_getfd(&fd, &inode, &file, "[eventpoll]",
				 &eventpoll_fops, ep);
	if (error)
		goto error_free;

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_create(%d) = %d\n",
		     current, size, fd));

	return fd;

error_free:
	ep_free(ep);
error_return:
	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_create(%d) = %d\n",
		     current, size, error));
	return error;
}
```

创建一个 eventpoll 结构， 这个本质上是一棵红黑树

```
struct eventpoll {
	/* Protect the this structure access */
	spinlock_t lock;

	/*
	 * This mutex is used to ensure that files are not removed
	 * while epoll is using them. This is held during the event
	 * collection loop, the file cleanup path, the epoll file exit
	 * code and the ctl operations.
	 */
	struct mutex mtx;

	/* Wait queue used by sys_epoll_wait() */
	wait_queue_head_t wq;

	/* Wait queue used by file->poll() */
	wait_queue_head_t poll_wait;

	/* List of ready file descriptors */
	struct list_head rdllist;

	/* RB tree root used to store monitored fd structs */
	struct rb_root rbr;

	/*
	 * This is a single linked list that chains all the "struct epitem" that
	 * happened while transfering ready events to userspace w/out
	 * holding ->lock.
	 */
	struct epitem *ovflist;
};


struct epitem {
	/* RB tree node used to link this structure to the eventpoll RB tree */
	struct rb_node rbn;

	/* List header used to link this structure to the eventpoll ready list */
	struct list_head rdllink;

	/*
	 * Works together "struct eventpoll"->ovflist in keeping the
	 * single linked chain of items.
	 */
	struct epitem *next;

	/* The file descriptor information this item refers to */
	struct epoll_filefd ffd;

	/* Number of active wait queue attached to poll operations */
	int nwait;

	/* List containing poll wait queues */
	struct list_head pwqlist;

	/* The "container" of this item */
	struct eventpoll *ep;

	/* List header used to link this item to the "struct file" items list */
	struct list_head fllink;

	/* The structure that describe the interested events and the source fd */
	struct epoll_event event;
};

```


接着看<code>epoll.register(server, select.EPOLLIN)(</code>

```
static PyObject *
pyepoll_register(pyEpoll_Object *self, PyObject *args, PyObject *kwds)
{
    PyObject *pfd;
    unsigned int events = EPOLLIN | EPOLLOUT | EPOLLPRI;
    static char *kwlist[] = {"fd", "eventmask", NULL};

    if (!PyArg_ParseTupleAndKeywords(args, kwds, "O|I:register", kwlist,
                                     &pfd, &events)) {
        return NULL;
    }

    return pyepoll_internal_ctl(self->epfd, EPOLL_CTL_ADD, pfd, events);
}

```

```
static PyObject *
pyepoll_internal_ctl(int epfd, int op, PyObject *pfd, unsigned int events)
{
    struct epoll_event ev;
    int result;
    int fd;

    if (epfd < 0)
        return pyepoll_err_closed();

    fd = PyObject_AsFileDescriptor(pfd);
    if (fd == -1) {
        return NULL;
    }

    switch(op) {
        case EPOLL_CTL_ADD:
        case EPOLL_CTL_MOD:
        ev.events = events;
        ev.data.fd = fd;
        Py_BEGIN_ALLOW_THREADS
        result = epoll_ctl(epfd, op, fd, &ev);
        Py_END_ALLOW_THREADS
        break;
        case EPOLL_CTL_DEL:
        /* In kernel versions before 2.6.9, the EPOLL_CTL_DEL
         * operation required a non-NULL pointer in event, even
         * though this argument is ignored. */
        Py_BEGIN_ALLOW_THREADS
        result = epoll_ctl(epfd, op, fd, &ev);
        if (errno == EBADF) {
            /* fd already closed */
            result = 0;
            errno = 0;
        }
        Py_END_ALLOW_THREADS
        break;
        default:
        result = -1;
        errno = EINVAL;
    }

    if (result < 0) {
        PyErr_SetFromErrno(PyExc_IOError);
        return NULL;
    }
    Py_RETURN_NONE;
}
```


<code>epoll_ctl</code>一步步调用内核 

```
asmlinkage long sys_epoll_ctl(int epfd, int op, int fd,
			      struct epoll_event __user *event)
{
	int error;
	struct file *file, *tfile;
	struct eventpoll *ep;
	struct epitem *epi;
	struct epoll_event epds;

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_ctl(%d, %d, %d, %p)\n",
		     current, epfd, op, fd, event));

	error = -EFAULT;
	if (ep_op_has_event(op) &&
	    copy_from_user(&epds, event, sizeof(struct epoll_event)))
		goto error_return;

	/* Get the "struct file *" for the eventpoll file */
	error = -EBADF;
	file = fget(epfd);
	if (!file)
		goto error_return;

	/* Get the "struct file *" for the target file */
	tfile = fget(fd);
	if (!tfile)
		goto error_fput;

	/* The target file descriptor must support poll */
	error = -EPERM;
	if (!tfile->f_op || !tfile->f_op->poll)
		goto error_tgt_fput;

	/*
	 * We have to check that the file structure underneath the file descriptor
	 * the user passed to us _is_ an eventpoll file. And also we do not permit
	 * adding an epoll file descriptor inside itself.
	 */
	error = -EINVAL;
	if (file == tfile || !is_file_epoll(file))
		goto error_tgt_fput;

	/*
	 * At this point it is safe to assume that the "private_data" contains
	 * our own data structure.
	 */
	ep = file->private_data;

	mutex_lock(&ep->mtx);

	/*
	 * Try to lookup the file inside our RB tree, Since we grabbed "mtx"
	 * above, we can be sure to be able to use the item looked up by
	 * ep_find() till we release the mutex.
	 */
	epi = ep_find(ep, tfile, fd);

	error = -EINVAL;
	switch (op) {
	case EPOLL_CTL_ADD:
		if (!epi) {
			epds.events |= POLLERR | POLLHUP;

			error = ep_insert(ep, &epds, tfile, fd);
		} else
			error = -EEXIST;
		break;
	case EPOLL_CTL_DEL:
		if (epi)
			error = ep_remove(ep, epi);
		else
			error = -ENOENT;
		break;
	case EPOLL_CTL_MOD:
		if (epi) {
			epds.events |= POLLERR | POLLHUP;
			error = ep_modify(ep, epi, &epds);
		} else
			error = -ENOENT;
		break;
	}
	mutex_unlock(&ep->mtx);

error_tgt_fput:
	fput(tfile);
error_fput:
	fput(file);
error_return:
	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_ctl(%d, %d, %d, %p) = %d\n",
		     current, epfd, op, fd, event, error));

	return error;
}
```

从上面看出， epoll.register， epoll.unregister， epoll.modify 分别对应了 
<code>EPOLL_CTL_ADD</code>, <code>EPOLL_CTL_DEL</code>, <code>EPOLL_CTL_MOD</code>, 最终对应的是 eventpoll 这个二叉树的添加，删除，修改节点操作。

看下一我们这次比价关心的register 所引起的<code>ep_insert</code>

```
static int ep_insert(struct eventpoll *ep, struct epoll_event *event,
		     struct file *tfile, int fd)
{
	int error, revents, pwake = 0;
	unsigned long flags;
	struct epitem *epi;
	struct ep_pqueue epq;

	error = -ENOMEM;
	if (!(epi = kmem_cache_alloc(epi_cache, GFP_KERNEL)))
		goto error_return;

	/* Item initialization follow here ... */
	ep_rb_initnode(&epi->rbn);
	INIT_LIST_HEAD(&epi->rdllink);
	INIT_LIST_HEAD(&epi->fllink);
	INIT_LIST_HEAD(&epi->pwqlist);
	epi->ep = ep;
	ep_set_ffd(&epi->ffd, tfile, fd);
	epi->event = *event;
	epi->nwait = 0;
	epi->next = EP_UNACTIVE_PTR;

	/* Initialize the poll table using the queue callback */
	epq.epi = epi;
	init_poll_funcptr(&epq.pt, ep_ptable_queue_proc);

	/*
	 * Attach the item to the poll hooks and get current event bits.
	 * We can safely use the file* here because its usage count has
	 * been increased by the caller of this function. Note that after
	 * this operation completes, the poll callback can start hitting
	 * the new item.
	 */
	revents = tfile->f_op->poll(tfile, &epq.pt);

	/*
	 * We have to check if something went wrong during the poll wait queue
	 * install process. Namely an allocation for a wait queue failed due
	 * high memory pressure.
	 */
	if (epi->nwait < 0)
		goto error_unregister;

	/* Add the current item to the list of active epoll hook for this file */
	spin_lock(&tfile->f_ep_lock);
	list_add_tail(&epi->fllink, &tfile->f_ep_links);
	spin_unlock(&tfile->f_ep_lock);

	/*
	 * Add the current item to the RB tree. All RB tree operations are
	 * protected by "mtx", and ep_insert() is called with "mtx" held.
	 */
	ep_rbtree_insert(ep, epi);

	/* We have to drop the new item inside our item list to keep track of it */
	spin_lock_irqsave(&ep->lock, flags);

	/* If the file is already "ready" we drop it inside the ready list */
	if ((revents & event->events) && !ep_is_linked(&epi->rdllink)) {
		list_add_tail(&epi->rdllink, &ep->rdllist);

		/* Notify waiting tasks that events are available */
		if (waitqueue_active(&ep->wq))
			wake_up_locked(&ep->wq);
		if (waitqueue_active(&ep->poll_wait))
			pwake++;
	}

	spin_unlock_irqrestore(&ep->lock, flags);

	/* We have to call this outside the lock */
	if (pwake)
		ep_poll_safewake(&psw, &ep->poll_wait);

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: ep_insert(%p, %p, %d)\n",
		     current, ep, tfile, fd));

	return 0;

error_unregister:
	ep_unregister_pollwait(ep, epi);

	/*
	 * We need to do this because an event could have been arrived on some
	 * allocated wait queue. Note that we don't care about the ep->ovflist
	 * list, since that is used/cleaned only inside a section bound by "mtx".
	 * And ep_insert() is called with "mtx" held.
	 */
	spin_lock_irqsave(&ep->lock, flags);
	if (ep_is_linked(&epi->rdllink))
		list_del_init(&epi->rdllink);
	spin_unlock_irqrestore(&ep->lock, flags);

	kmem_cache_free(epi_cache, epi);
error_return:
	return error;
}

```

<code>
init_poll_funcptr(&epq.pt, ep_ptable_queue_proc);
revents = ep_item_poll(epi, &epq.pt);
</code>
这两行代码会给poll 注册一个回调函数。当执行 f_op->poll时 会执行 <code>poll_wait</code>， <code>poll_wait</code>会执行我们注册的这个回调函数<code>ep_ptable_queue_proc</code>

```
static void ep_ptable_queue_proc(struct file *file, wait_queue_head_t *whead,
				 poll_table *pt)
{
	struct epitem *epi = ep_item_from_epqueue(pt);
	struct eppoll_entry *pwq;

	if (epi->nwait >= 0 && (pwq = kmem_cache_alloc(pwq_cache, GFP_KERNEL))) {
		init_waitqueue_func_entry(&pwq->wait, ep_poll_callback);
		pwq->whead = whead;
		pwq->base = epi;
		add_wait_queue(whead, &pwq->wait);
		list_add_tail(&pwq->llink, &epi->pwqlist);
		epi->nwait++;
	} else {
		/* We have to signal that an error occurred */
		epi->nwait = -1;
	}
}

```
<code>ep_ptable_queue_proc</code> 这个函数注册了等待队列的回调函数<code>ep_poll_callback</code>。在设备(对于网络来讲就是网卡了)有数据来时，硬件中断处理函数中会唤醒该等待队列上等待的进程时，会调用唤醒函数ep_poll_callback


```
static int ep_poll_callback(wait_queue_t *wait, unsigned mode, int sync, void *key)
{
	int pwake = 0;
	unsigned long flags;
	struct epitem *epi = ep_item_from_wait(wait);
	struct eventpoll *ep = epi->ep;

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: poll_callback(%p) epi=%p ep=%p\n",
		     current, epi->ffd.file, epi, ep));

	spin_lock_irqsave(&ep->lock, flags);

	/*
	 * If the event mask does not contain any poll(2) event, we consider the
	 * descriptor to be disabled. This condition is likely the effect of the
	 * EPOLLONESHOT bit that disables the descriptor when an event is received,
	 * until the next EPOLL_CTL_MOD will be issued.
	 */
	if (!(epi->event.events & ~EP_PRIVATE_BITS))
		goto out_unlock;

	/*
	 * If we are trasfering events to userspace, we can hold no locks
	 * (because we're accessing user memory, and because of linux f_op->poll()
	 * semantics). All the events that happens during that period of time are
	 * chained in ep->ovflist and requeued later on.
	 */
	if (unlikely(ep->ovflist != EP_UNACTIVE_PTR)) {
		if (epi->next == EP_UNACTIVE_PTR) {
			epi->next = ep->ovflist;
			ep->ovflist = epi;
		}
		goto out_unlock;
	}

	/* If this file is already in the ready list we exit soon */
	if (ep_is_linked(&epi->rdllink))
		goto is_linked;

	list_add_tail(&epi->rdllink, &ep->rdllist);

is_linked:
	/*
	 * Wake up ( if active ) both the eventpoll wait list and the ->poll()
	 * wait list.
	 */
	if (waitqueue_active(&ep->wq))
		wake_up_locked(&ep->wq);
	if (waitqueue_active(&ep->poll_wait))
		pwake++;

out_unlock:
	spin_unlock_irqrestore(&ep->lock, flags);

	/* We have to call this outside the lock */
	if (pwake)
		ep_poll_safewake(&psw, &ep->poll_wait);

	return 1;
}
```


将该fd加入到epoll监听的就绪链表中, 所以ep_poll_callback函数主要的功能是将被监视文件的等待事件就绪时，将文件对应的epitem实例添加到就绪队列中，当用户调用epoll_wait()时，内核会将就绪队列中的事件报告给用户。

那么何时会调用epoll_wait 呢？ 没错就是我们<code>epoll.poll()</code>

```
static PyObject *
pyepoll_poll(pyEpoll_Object *self, PyObject *args, PyObject *kwds)
{
...
...
...

    Py_BEGIN_ALLOW_THREADS
    nfds = epoll_wait(self->epfd, evs, maxevents, timeout);
    Py_END_ALLOW_THREADS
    if (nfds < 0) {
        PyErr_SetFromErrno(PyExc_IOError);
        goto error;
    }

    elist = PyList_New(nfds);
    if (elist == NULL) {
        goto error;
    }

...
...
...
}
```

```
asmlinkage long sys_epoll_wait(int epfd, struct epoll_event __user *events,
			       int maxevents, int timeout)
{
	int error;
	struct file *file;
	struct eventpoll *ep;

	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_wait(%d, %p, %d, %d)\n",
		     current, epfd, events, maxevents, timeout));

	/* The maximum number of event must be greater than zero */
	if (maxevents <= 0 || maxevents > EP_MAX_EVENTS)
		return -EINVAL;

	/* Verify that the area passed by the user is writeable */
	if (!access_ok(VERIFY_WRITE, events, maxevents * sizeof(struct epoll_event))) {
		error = -EFAULT;
		goto error_return;
	}

	/* Get the "struct file *" for the eventpoll file */
	error = -EBADF;
	file = fget(epfd);
	if (!file)
		goto error_return;

	/*
	 * We have to check that the file structure underneath the fd
	 * the user passed to us _is_ an eventpoll file.
	 */
	error = -EINVAL;
	if (!is_file_epoll(file))
		goto error_fput;

	/*
	 * At this point it is safe to assume that the "private_data" contains
	 * our own data structure.
	 */
	ep = file->private_data;

	/* Time to fish for events ... */
	error = ep_poll(ep, events, maxevents, timeout);

error_fput:
	fput(file);
error_return:
	DNPRINTK(3, (KERN_INFO "[%p] eventpoll: sys_epoll_wait(%d, %p, %d, %d) = %d\n",
		     current, epfd, events, maxevents, timeout, error));

	return error;
}
```

调用了 ep_poll

```
static int ep_poll(struct eventpoll *ep, struct epoll_event __user *events,
		   int maxevents, long timeout)
{
	int res, eavail;
	unsigned long flags;
	long jtimeout;
	wait_queue_t wait;

	/*
	 * Calculate the timeout by checking for the "infinite" value ( -1 )
	 * and the overflow condition. The passed timeout is in milliseconds,
	 * that why (t * HZ) / 1000.
	 */
	jtimeout = (timeout < 0 || timeout >= EP_MAX_MSTIMEO) ?
		MAX_SCHEDULE_TIMEOUT : (timeout * HZ + 999) / 1000;

retry:
	spin_lock_irqsave(&ep->lock, flags);

	res = 0;
	if (list_empty(&ep->rdllist)) {
		/*
		 * We don't have any available event to return to the caller.
		 * We need to sleep here, and we will be wake up by
		 * ep_poll_callback() when events will become available.
		 */
		init_waitqueue_entry(&wait, current);
		wait.flags |= WQ_FLAG_EXCLUSIVE;
		__add_wait_queue(&ep->wq, &wait);

		for (;;) {
			/*
			 * We don't want to sleep if the ep_poll_callback() sends us
			 * a wakeup in between. That's why we set the task state
			 * to TASK_INTERRUPTIBLE before doing the checks.
			 */
			set_current_state(TASK_INTERRUPTIBLE);
			if (!list_empty(&ep->rdllist) || !jtimeout)
				break;
			if (signal_pending(current)) {
				res = -EINTR;
				break;
			}

			spin_unlock_irqrestore(&ep->lock, flags);
			jtimeout = schedule_timeout(jtimeout);
			spin_lock_irqsave(&ep->lock, flags);
		}
		__remove_wait_queue(&ep->wq, &wait);

		set_current_state(TASK_RUNNING);
	}

	/* Is it worth to try to dig for events ? */
	eavail = !list_empty(&ep->rdllist);

	spin_unlock_irqrestore(&ep->lock, flags);

	/*
	 * Try to transfer events to user space. In case we get 0 events and
	 * there's still timeout left over, we go trying again in search of
	 * more luck.
	 */
	if (!res && eavail &&
	    !(res = ep_send_events(ep, events, maxevents)) && jtimeout)
		goto retry;

	return res;
}

```

会判断ep->rdllist 就绪队列里是否为空，如果不为空说明有事件到来




