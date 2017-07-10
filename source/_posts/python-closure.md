title: 深入理解装饰器闭包
date: 2016-11-05 20:14:41
tags:
---


这次聊一下Python闭包的实现。

首先说下什么是闭包。以下为维基百科的定义。

>>在计算机科学中，闭包（英语：Closure），又称词法闭包（Lexical Closure）或函数闭包（function closures），是引用了自由变量的函数。这个被引用的自由变量将和这个函数一同存在，即使已经离开了创造它的环境也不例外。所以，有另一种说法认为闭包是由函数和与其相关的引用环境组合而成的实体。闭包在运行时可以有多个实例，不同的引用环境和相同的函数组合可以产生不同的实例。

```python
def func(x):
    def inner_func(y):
        return x+y
    return inner_func
closure = func(1)
print (closure(2)) # output: 3
```

上面func(1)返回后，构成了一个闭包 closure。这时虽然func函数已经结束了，但是仍能在inner_func里使用本来属于func 的局部变量x。

本文及其以后所讲的Python均为cython。

我们知道python的底层是c语言写的，而标准的c语言是并不支持闭包的。

假设C支持嵌套定义 (标准的C不支持嵌套函数定义, gcc[支持](https://gcc.gnu.org/onlinedocs/gcc/Nested-Functions.html) ), 也依然不可能。因为在func 函数执行结束后， func 作用域的局部变量x 会随着func 结束而消亡。 因此无法在closure(2)时再去引用到x。

这里如果有同学对于堆heap 和 栈stack遗忘了的话，简单帮大家回忆一下。


1、栈区（stack）— 由编译器自动分配释放 ，存放函数的参数值，局部变量的值等。

2、堆区（heap） — 一般由程序员分配释放， 若程序员不释放，程序结束时可能由OS回收 

一个简单的c例子

```c
int a = 0; //全局初始化区
char *p1; //全局未初始化区
int main()
{
	int b; //栈
	char s[] = "abc"; //栈
	char *p2; //栈
	char *p3 = "123456"; // 123456\0在常量区，p3在栈上。
	static int c =0; //全局（静态）初始化区
	p1 = (char *) malloc(10);
	p2 = (char *) malloc(20);
	// 分配得来得10和20字节的区域就在堆区。
	strcpy(p1, "123456"); //123456\0放在常量区，编译器可能会将它与p3所指向的"123456"优化成一个地方。
} 
```
系统对于函数的调用也是通过栈实现的，例如下面例子


```c
int  func_B(int arg_B1, int arg_B2)
{
  int var_B1, var_B2;
  var_B1=arg_B1+arg_B2;
  var_B2=arg_B1-arg_B2;
  return var_B1*var_B2;
}

int  func_A(int arg_A1, int arg_A2)
{
  int var_A;
  var_A = func_B(arg_A1,arg_A2) + arg_A1 ;
  return var_A;
}

int main(int argc, char **argv, char **envp)
{
  int var_main;
  var_main=func_A(4,3);
  return var_main;
}
```

在栈上的演示为下图


![blog-106.png](http://7xkghb.com1.z0.glb.clouddn.com/blog-106.png)

在main函数调用func_A的时候，首先在自己的栈帧中压入函数返回地址，然后为func_A创建新栈帧并压入系统栈
  在func_A调用func_B的时候，同样先在自己的栈帧中压入函数返回地址，然后为func_B创建新栈帧并压入系统栈
  在func_B返回时，func_B的栈帧被弹出系统栈，func_A栈帧中的返回地址被“露”在栈顶，此时处理器按照这个返回地址重新跳到func_A代码区中执行
  在func_A返回时，func_A的栈帧被弹出系统栈，main函数栈帧中的返回地址被“露”在栈顶，此时处理器按照这个返回地址跳到main函数代码区中执行

  注意：在实际运行中，main函数并不是第一个被调用的函数，程序被装入内存前还有一些其他操作，上图只是栈在函数调用过程中所起作用的示意图


这样大家就明白了，为什么说如果我们func 执行完了，那么属于它的局部变量也就消亡了。

OK，既然标准的C是无法实现的，那么下面就看看Python的底层是如何把局部变量(自由变量)传递给嵌套函数的了。


先介绍两个对象，一个PyCodeObject，一个是PyFunctionObject。
PyCodeObject 是一段Python源代码的静态表示。源代码编译后，一个Code Block会产生一个且只有一个PyCodeObject。这个PyCodeObject对象中包含了这个CodeBlock的一些静态的信息，所谓静态的信息是指可以从源代码中看到的信息。比如CodeBlock中有a=1这样的表达式，那么符号a和1以及他们之间的联系就是一种静态信息，这些信息会分别存储在PyCodeObject的常量表co_consts和符号表co_names以及字节码序列co_code中，这些信息是编译时就可以得到的。

>Python虽然是解释型语言但是其实是有编译过程的，具体的可以看看这篇[文章](http://www.cnblogs.com/kym/archive/2012/05/14/2498728.html)


这里再简单介绍下CodeBlock。
Python编译器在对Python源码进行编译的时候，对代码中的一个Code Block，会创建一个PyCodeObject对象与这段代码对应。
如何确定多少代码算一个Code Block？
Python中确定Code Block的规则：当进入一个新的名字空间或作用域时，就算进入了一个新的Code Block了。
即：一个名字空间对应一个Code Block，它会对应一个PyCodeObject。
在Python中，类、函数和module都对应着一个独立的名字空间，因此都会对应一个PyCodeObject对象。

PyFunctionObject 会在每一次调用函数时生成每一个PyFunction的 func_code 域都会关联到PyCode对象。
也就是说，如果函数被调用多次，会产生多个PyFunction共同引用同一个func_code


看下这两个对象的具体构成
[源码](https://fossies.org/dox/Python-2.7.13/code_8h_source.html)

```c
typedef struct {
    PyObject_HEAD
    int co_argcount;		/* #arguments, except *args */
    int co_nlocals;		/* #local variables */
    int co_stacksize;		/* #entries needed for evaluation stack */
    int co_flags;		/* CO_..., see below */
    PyObject *co_code;		/* instruction opcodes */
    PyObject *co_consts;	/* list (constants used) */
    PyObject *co_names;		/* list of strings (names used) */
    PyObject *co_varnames;	/* tuple of strings (local variable names) */
    PyObject *co_freevars;	/* tuple of strings (free variable names) */
    PyObject *co_cellvars;      /* tuple of strings (cell variable names) */
    /* The rest doesn't count for hash/cmp */
    PyObject *co_filename;	/* string (where it was loaded from) */
    PyObject *co_name;		/* string (name, for reference) */
    int co_firstlineno;		/* first source line number */
    PyObject *co_lnotab;	/* string (encoding addr<->lineno mapping) See
				   Objects/lnotab_notes.txt for details. */
    void *co_zombieframe;     /* for optimization only (see frameobject.c) */
    PyObject *co_weakreflist;   /* to support weakrefs to code objects */
} PyCodeObject;
```

```c
typedef struct {
    PyObject_HEAD
    PyObject *func_code;	/* A code object */
    PyObject *func_globals;	/* A dictionary (other mappings won't do) */
    PyObject *func_defaults;	/* NULL or a tuple */
    PyObject *func_closure;	/* NULL or a tuple of cell objects */
    PyObject *func_doc;		/* The __doc__ attribute, can be anything */
    PyObject *func_name;	/* The __name__ attribute, a string object */
    PyObject *func_dict;	/* The __dict__ attribute, a dict or NULL */
    PyObject *func_weakreflist;	/* List of weak references */
    PyObject *func_module;	/* The __module__ attribute, can be anything */

    /* Invariant:
     *     func_closure contains the bindings for func_code->co_freevars, so
     *     PyTuple_Size(func_closure) == PyCode_GetNumFree(func_code)
     *     (func_closure may be NULL if PyCode_GetNumFree(func_code) == 0).
     */
} PyFunctionObject;
```

其中PyCodeObject 有两个属性
co_freevars 自由变量，这个CodeBlock 如果是被嵌套的那么这个自由变量就会存储着上一层嵌套他的CodeBlock的局部变量
co_cellvars ,这个会存储着会被嵌套的CodeBlock 用到的变量

具体看下

```python
def func(x):
    print (func.func_name, func.func_code.co_freevars)
    print (func.func_name, func.func_code.co_cellvars)

    def inner_func(y):
        print (inner_func.func_name, inner_func.func_code.co_freevars)
        print (inner_func.func_name, inner_func.func_code.co_cellvars)
        return x + y

    return inner_func

closure = func(1)
closure(2)
```

输出

```
('func', ())
('func', ('inner_func', 'x'))
('inner_func', ('inner_func', 'x'))
('inner_func', ())

```

inner_func 关联的 PyCodeObject 在编译时已经可以知道 func 的一个局部变量x，但是这里只是存储了一个变量名，接着具体看下是如何把值存进来的。

Python代码是先被编译为Python字节码后，再由Python虚拟机来执行Python字节码（pyc文件主要就是用于存储字节码指令 的）。一般来说一个Python语句会对应若干字节码指令，Python的字节码是一种类似汇编指令的中间语言，但是一个字节码指令并不是对应一个机器指 令（二进制指令），而是对应一段C代码。
可以用dis 这个module，来查看python代码对应的字节码指令

<code>python -m dis deep_into_closure.py </code>

```
  1           0 LOAD_CONST               0 (<code object func at 0x1020008b0, file "deep_into_closure.py", line 1>)
              3 MAKE_FUNCTION            0
              6 STORE_NAME               0 (func)

 12           9 LOAD_NAME                0 (func)
             12 LOAD_CONST               1 (1)
             15 CALL_FUNCTION            1
             18 STORE_NAME               1 (closure)

 13          21 LOAD_NAME                1 (closure)
             24 LOAD_CONST               2 (2)
             27 CALL_FUNCTION            1
             30 POP_TOP             
             31 LOAD_CONST               3 (None)
             34 RETURN_VALUE        
```

执行func时，执行CALL_FUNCTION命令，去ceval.c看一下 <code>CALL_FUNCTION</code> 对应的c代码

```

TARGET(CALL_FUNCTION)
{
	...

    x = call_function(&sp, oparg, &intr0, &intr1);
	...
}

```

<code>call_function</code> 调用 <code>fast_function</code> 

```
static PyObject *
fast_function(PyObject *func, PyObject ***pp_stack, int n, int na, int nk)
{
...
    return PyEval_EvalCodeEx(co, globals,
                             (PyObject *)NULL, (*pp_stack)-n, na,
                             (*pp_stack)-2*nk, nk, d, nd,
                             PyFunction_GET_CLOSURE(func));
...
}

```

```
PyObject *
PyEval_EvalCodeEx(PyCodeObject *co, PyObject *globals, PyObject *locals,
           PyObject **args, int argcount, PyObject **kws, int kwcount,
           PyObject **defs, int defcount, PyObject *closure)
{

    f = PyFrame_New(tstate, co, globals, locals);// 创建一个PyFrameObject
    
    ...
    ...
    ...
            for (i = 0; i < n; i++) {
            x = args[i];
            Py_INCREF(x);
            SETLOCAL(i, x);
        ...
        ...
        ...
        
          if (co->co_flags & CO_VARARGS) {
            u = PyTuple_New(argcount - n);
            if (u == NULL)
                goto fail;
            SETLOCAL(co->co_argcount, u);
            for (i = n; i < argcount; i++) {
                x = args[i];
                Py_INCREF(x);
                PyTuple_SET_ITEM(u, i-n, x);
            }
        }
        
        
    for (i = 0; i < PyTuple_GET_SIZE(co->co_cellvars); ++i) {
    cellname = PyString_AS_STRING(
        PyTuple_GET_ITEM(co->co_cellvars, i));
    found = 0;
    for (j = 0; j < nargs; j++) {
        argname = PyString_AS_STRING(
            PyTuple_GET_ITEM(co->co_varnames, j));
        if (strcmp(cellname, argname) == 0) {
            c = PyCell_New(GETLOCAL(j));
            if (c == NULL)
                goto fail;
            GETLOCAL(co->co_nlocals + i) = c;
            found = 1;
            break;
        }
    }
    if (found == 0) {
        c = PyCell_New(NULL);
        if (c == NULL)
            goto fail;
        SETLOCAL(co->co_nlocals + i, c);
    }
}
...
...
...

retval = PyEval_EvalFrameEx(f,0);
}
```

在 <code>PyEval_EvalCodeEx</code> 中主要完成以下功能
1. 创建一个PyFrameObject 对象

```
typedef struct _frame {
    PyObject_VAR_HEAD
    struct _frame *f_back;	/* previous frame, or NULL */
    PyCodeObject *f_code;	/* code segment */
    PyObject *f_builtins;	/* builtin symbol table (PyDictObject) */
    PyObject *f_globals;	/* global symbol table (PyDictObject) */
    PyObject *f_locals;		/* local symbol table (any mapping) */
    PyObject **f_valuestack;	/* points after the last local */
    /* Next free slot in f_valuestack.  Frame creation sets to f_valuestack.
       Frame evaluation usually NULLs it, but a frame that yields sets it
       to the current stack top. */
    PyObject **f_stacktop;
    PyObject *f_trace;		/* Trace function */

    /* If an exception is raised in this frame, the next three are used to
     * record the exception info (if any) originally in the thread state.  See
     * comments before set_exc_info() -- it's not obvious.
     * Invariant:  if _type is NULL, then so are _value and _traceback.
     * Desired invariant:  all three are NULL, or all three are non-NULL.  That
     * one isn't currently true, but "should be".
     */
    PyObject *f_exc_type, *f_exc_value, *f_exc_traceback;

    PyThreadState *f_tstate;
    int f_lasti;		/* Last instruction if called */
    /* Call PyFrame_GetLineNumber() instead of reading this field
       directly.  As of 2.3 f_lineno is only valid when tracing is
       active (i.e. when f_trace is set).  At other times we use
       PyCode_Addr2Line to calculate the line from the current
       bytecode index. */
    int f_lineno;		/* Current line number */
    int f_iblock;		/* index in f_blockstack */
    PyTryBlock f_blockstack[CO_MAXBLOCKS]; /* for try and loop blocks */
    PyObject *f_localsplus[1];	/* locals+stack, dynamically sized */
} PyFrameObject;

```

其中 PyFrame_New(tstate, co, globals, locals); 
其中会开辟一块存储空间用来存储 <code> co_stacksize , co_cellvars, co_freevars, co_nlocals </code> 并用 <code>f_localsplus</code> 指向这块区域

2. ....
3. ....



OK，我们构造出了这个这个Python栈帧
<code>retval = PyEval_EvalFrameEx(f,0);</code> 接着执行这个这个栈

```
PyObject *
PyEval_EvalFrameEx(PyFrameObject *f, int throwflag)
{

...
...
...
switch (opcode) {

        /* BEWARE!
           It is essential that any operation that fails sets either
           x to NULL, err to nonzero, or why to anything but WHY_NOT,
           and that no operation that succeeds does this! */

        /* case STOP_CODE: this is an error! */

        TARGET_NOARG(NOP)
        {
            FAST_DISPATCH();
        }

        TARGET(LOAD_FAST)
        {
            x = GETLOCAL(oparg);
            if (x != NULL) {
                Py_INCREF(x);
                PUSH(x);
                FAST_DISPATCH();
            }
            format_exc_check_arg(PyExc_UnboundLocalError,
                UNBOUNDLOCAL_ERROR_MSG,
                PyTuple_GetItem(co->co_varnames, oparg));
            break;
        }

        TARGET(LOAD_CONST)
        {
...
...
```

用dis 查看下栈有关的字节码命令

```
import dis


def func(x):
    def inner_func(y):
        return x + y

    return inner_func

dis.dis(func)

```

输出


```
  5           0 LOAD_CLOSURE             0 (x)
              3 BUILD_TUPLE              1
              6 LOAD_CONST               1 (<code object inner_func at 0x1004cbb30, file "deep_into_closure.py", line 5>)
              9 MAKE_CLOSURE             0
             12 STORE_FAST               1 (inner_func)

  8          15 LOAD_FAST                1 (inner_func)
             18 RETURN_VALUE        

```

看下LOAD_CLOSURE的c命令

```
        TARGET(LOAD_CLOSURE)
        {
            x = freevars[oparg];
            Py_INCREF(x);
            PUSH(x);
            if (x != NULL) DISPATCH();
            break;
        }
```


入栈, 此时得到一个PyCellObject, 指向2, name='x'

LOAD_CLOSURE 在编译时会根据嵌套函数中 co_freevars, 决定了取得参数位置和个数

然后, BUILD_TUPLE, 将cell对象打包成tuple, 得到('x', )

然后, 开始, 载入嵌套函数do_add, 入栈

调用MAKE_CLOSURE

```
  case MAKE_CLOSURE:
          {
              v = POP(); /* code object */  // do_add函数
              x = PyFunction_New(v, f->f_globals); //绑定global名字空间
              // 到这里, 得到一个PyFunctionObject

              Py_DECREF(v);
              if (x != NULL) {
                  v = POP();   // 得到tuple, ('x', )

                  // 注意这里
                  if (PyFunction_SetClosure(x, v) != 0) {
                      /* Can't happen unless bytecode is corrupt. */
                      why = WHY_EXCEPTION;
                  }
                  Py_DECREF(v);
              }
              ......
          }
```

来关注一下 PyFunction_SetClosure

```
int
PyFunction_SetClosure(PyObject *op, PyObject *closure)
{
    ...
    Py_XDECREF(((PyFunctionObject *) op) -> func_closure);
    ((PyFunctionObject *) op) -> func_closure = closure;  // 注意这里
    return 0;
}
```

即do_add的 PyFunctionObject的func_closure指向一个tuple

然后, 在嵌套函数被调用的时候

call_function->fast_function, 

```
return PyEval_EvalCodeEx(co, globals,
                               (PyObject *)NULL, (*pp_stack)-n, na,
                               (*pp_stack)-2*nk, nk, d, nd,
                               PyFunction_GET_CLOSURE(func));

```

看下PyFunction_GET_CLOSURE

```
#define PyFunction_GET_CLOSURE(func) \
      (((PyFunctionObject *)func) -> func_closure)
```

然后, 进入 PyEval_EvalCodeEx, 注意这里的closure参数即上一步取出来的func_closure, 即外层函数传进来的tuple


```
  PyObject *
  PyEval_EvalCodeEx(PyCodeObject *co, PyObject *globals, PyObject *locals,
             PyObject **args, int argcount, PyObject **kws, int kwcount,
             PyObject **defs, int defcount, PyObject *closure)
{
      ......
      //  嵌套函数do_add, 使用到了外层函数的变量, 所以co->co_freevars非空, 这里得到 ('x', )
      if (PyTuple_GET_SIZE(co->co_freevars)) {
          int i;
          for (i = 0; i < PyTuple_GET_SIZE(co->co_freevars); ++i) {
              // 顺序是一致的
              PyObject *o = PyTuple_GET_ITEM(closure, i);
              Py_INCREF(o);
              // 放到freevars里面, 编译时已经确定了顺序
              // 在上一步多LOAD_CLOSURE => tuple 已经保证了顺序
              freevars[PyTuple_GET_SIZE(co->co_cellvars) + i] = o;
          }
      }
      ......
```

ok,如果你看上面看懵了的话，那么我简单总结一下

最初编译时生成了PyCodeObject其中co_cellvars 存了闭包要用的变量名x，调函数func 时， 生成PyFunctionObject, 接着生成了PyFrameObject, PyFrameObject.f_localsplus 存储了co_cellvars变量名指向的数值 1，接着运行这个栈，把f_localsplus 里的 闭包内容cell，打包成tuple，读取 inner_func 的 PyCodeObject，进而修改inner_func 的 PyFunctionObject, 使得inner_func 的 PyFunctionObject 创建时会读取到 闭包的tuple。 这样每次call 闭包函数时都会获取到 上一层的 闭包变量!