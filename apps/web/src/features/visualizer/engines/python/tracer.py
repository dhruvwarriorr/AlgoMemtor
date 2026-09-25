"""Records a step-by-step trace of a learner's Python program.

Runs inside Pyodide (CPython compiled to WebAssembly) in the learner's own
browser. The program runs for real under sys.settrace; nothing is simulated.
A step is recorded after each line runs, so the state shown for a step is the
state that line produced. The result matches ExecutionTrace in trace.ts.
"""

import ast
import builtins
import collections
import io
import itertools
import json
import sys
import time
import types

LEARNER_FILE = "<learner>"
CO_OPTIMIZED = 0x0001
MAX_ITEMS = 256
SMALL_SEQUENCE = 64
MAX_ENTRIES = 128
MAX_FIELDS = 32
MAX_TEXT = 400
MAX_DEPTH = 4
# Objects (class instances) nest much deeper than containers: a linked list
# of 100 nodes is 100 levels deep. A node budget per variable keeps a step
# small; objects already being drawn become references (cycles, shared nodes).
MAX_RECORD_DEPTH = 160
RECORD_BUDGET = 240
INNERMOST_FRAMES = 16
OUTERMOST_FRAMES = 3
MAX_ACCESSES = 24
MAX_WARNINGS = 60
RECURSION_CAP = 2500
SKIPPED_CODE = {"<genexpr>", "<lambda>", "<listcomp>", "<dictcomp>", "<setcomp>"}
BLOCKED_MODULES = {
    "js",
    "pyodide",
    "pyodide_js",
    "_pyodide",
    "micropip",
    "pyodide_http",
}
HIDDEN_TYPES = (
    types.ModuleType,
    types.FunctionType,
    types.BuiltinFunctionType,
    types.BuiltinMethodType,
    types.MethodType,
    type,
)
PURE_NODES = (
    ast.Name,
    ast.Constant,
    ast.BinOp,
    ast.UnaryOp,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.FloorDiv,
    ast.Mod,
    ast.USub,
    ast.UAdd,
    ast.Load,
)


class StopRun(BaseException):
    """Stops the program from inside the tracer. BaseException so that a
    learner's `except Exception` cannot swallow it."""

    def __init__(self, kind, title, message, details=None):
        super().__init__(message)
        self.kind = kind
        self.title = title
        self.message = message
        self.details = details


class _Input:
    """Standard input shared by the text and bytes views so the consumed
    position is exact."""

    def __init__(self, text):
        self.text = text
        self.pos = 0

    def read(self, size=-1):
        if size is None or size < 0:
            chunk = self.text[self.pos :]
        else:
            chunk = self.text[self.pos : self.pos + size]
        self.pos += len(chunk)
        return chunk

    def readline(self, size=-1):
        end = self.text.find("\n", self.pos)
        end = len(self.text) if end < 0 else end + 1
        if size is not None and size >= 0:
            end = min(end, self.pos + size)
        chunk = self.text[self.pos : end]
        self.pos = end
        return chunk


class Stdin(io.TextIOBase):
    def __init__(self, source):
        super().__init__()
        self._source = source
        self.buffer = StdinBytes(source)

    def readable(self):
        return True

    def read(self, size=-1):
        return self._source.read(size)

    def readline(self, size=-1):
        return self._source.readline(size)

    def readlines(self, hint=-1):
        return list(iter(self.readline, ""))

    def isatty(self):
        return False


class StdinBytes(io.RawIOBase):
    def __init__(self, source):
        super().__init__()
        self._source = source

    def readable(self):
        return True

    def read(self, size=-1):
        return self._source.read(size).encode()

    def readline(self, size=-1):
        return self._source.readline(size).encode()

    def readlines(self, hint=-1):
        return [line.encode() for line in iter(self._source.readline, "")]

    def __iter__(self):
        return iter(self.readline, b"")


class Stdout(io.TextIOBase):
    def __init__(self, tracer, name):
        super().__init__()
        self._tracer = tracer
        self._name = name
        self.parts = []
        self.length = 0
        self.buffer = StdoutBytes(self)

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        self.parts.append(text)
        self.length += len(text)
        self._tracer.check_output()
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False

    def value(self):
        return "".join(self.parts)


class StdoutBytes(io.RawIOBase):
    def __init__(self, text):
        super().__init__()
        self._text = text

    def writable(self):
        return True

    def write(self, data):
        return self._text.write(bytes(data).decode(errors="replace"))

    def flush(self):
        pass


def _is_pure(node):
    return all(isinstance(child, PURE_NODES) for child in ast.walk(node))


def _subscript_chain(node):
    """a[i][j] -> ("a", [i, j]) when the root is a plain name."""
    indexes = []
    current = node
    while isinstance(current, ast.Subscript):
        indexes.append(current.slice)
        current = current.value
    if not isinstance(current, ast.Name):
        return None
    return current.id, list(reversed(indexes))


class Analysis:
    """What the source says about branches, loops and element accesses."""

    def __init__(self, source, tree):
        self.branches = []
        self.bodies = {}
        self.index_hints = collections.defaultdict(set)
        self.accesses = collections.defaultdict(list)
        self.heap_names = set()
        lines = source.splitlines()

        def text_of(node, fallback):
            segment = ast.get_source_segment(source, node) or fallback
            segment = " ".join(segment.split())
            return segment if len(segment) <= 120 else segment[:117] + "…"

        for node in ast.walk(tree):
            if isinstance(node, (ast.If, ast.While, ast.For, ast.AsyncFor)):
                body_start = node.body[0].lineno
                body_end = max(
                    getattr(item, "end_lineno", item.lineno) for item in node.body
                )
                if isinstance(node, ast.If):
                    header = (
                        lines[node.lineno - 1].lstrip()
                        if node.lineno - 1 < len(lines)
                        else ""
                    )
                    kind = "elif" if header.startswith("elif") else "if"
                    text = text_of(node.test, "condition")
                elif isinstance(node, ast.While):
                    kind = "while"
                    text = text_of(node.test, "condition")
                else:
                    kind = "for"
                    text = f"{text_of(node.target, 'item')} in {text_of(node.iter, 'iterable')}"
                self.branches.append(
                    {
                        "line": node.lineno,
                        "endLine": body_end,
                        "kind": kind,
                        "text": text,
                    }
                )
                self.bodies[node.lineno] = (kind, body_start, body_end)
            if isinstance(node, ast.Subscript):
                chain = _subscript_chain(node)
                if chain is not None:
                    # Pointers are drawn under one-dimensional lists, so only
                    # the first index of a[i][j] counts.
                    name, indexes = chain
                    for child in ast.walk(indexes[0]):
                        if isinstance(child, ast.Name):
                            self.index_hints[name].add(child.id)
            if isinstance(node, ast.Call):
                func = node.func
                called = (
                    func.attr
                    if isinstance(func, ast.Attribute)
                    else getattr(func, "id", "")
                )
                heap_calls = {
                    "heappush",
                    "heappop",
                    "heapify",
                    "heappushpop",
                    "heapreplace",
                }
                if (
                    called in heap_calls
                    and node.args
                    and isinstance(node.args[0], ast.Name)
                ):
                    self.heap_names.add(node.args[0].id)

        # Element accesses per line, outermost subscript only.
        stored = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.AugAssign) and isinstance(
                node.target, ast.Subscript
            ):
                stored.add(id(node.target))
        inner = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Subscript):
                current = node.value
                while isinstance(current, ast.Subscript):
                    inner.add(id(current))
                    current = current.value
        for node in ast.walk(tree):
            if not isinstance(node, ast.Subscript) or id(node) in inner:
                continue
            chain = _subscript_chain(node)
            if chain is None:
                continue
            name, indexes = chain
            if not all(_is_pure(index) for index in indexes):
                continue
            try:
                codes = [
                    compile(ast.Expression(index), "<index>", "eval")
                    for index in indexes
                ]
            except SyntaxError, ValueError:
                continue
            write = isinstance(node.ctx, ast.Store) or id(node) in stored
            read = not isinstance(node.ctx, ast.Store) or id(node) in stored
            self.accesses[node.lineno].append((name, codes, read, write))


class Activation:
    __slots__ = (
        "id",
        "loops",
        "module",
        "name",
        "pending",
        "prev_line",
        "raising",
        "reads",
        "writes",
    )

    def __init__(self, ident, name, module):
        self.id = ident
        self.name = name
        self.pending = None
        self.reads = None
        self.writes = None
        self.prev_line = None
        self.loops = {}
        self.module = module
        # An exception is propagating through this frame.
        self.raising = False


class Tracer:
    def __init__(self, source, stdin_text, max_steps, time_ms, max_output):
        self.source = source
        self.max_steps = max_steps
        self.max_output = max_output
        self.deadline = time.monotonic() + time_ms / 1000
        self.time_ms = time_ms
        self.steps = []
        self.values = []
        self.value_ids = {}
        self.warnings = []
        self.active = {}
        self.next_id = 1
        self.count = 0
        # Steps executed, recorded or not (the same unit as recorded steps).
        self.total = 0
        self.recording = True
        self.truncated = False
        self.stdin_source = _Input(stdin_text)
        self.stdin = Stdin(self.stdin_source)
        self.stdout = Stdout(self, "stdout")
        self.stderr = Stdout(self, "stderr")
        self.analysis = None
        self.error_exc = None
        self.error_step = None
        self.error_details = None
        self.hidden_globals = set()
        # Stable identity for mutable objects: id() -> (objectId, object). The
        # object is kept so its id() is never reused by another object.
        self.object_ids = {}
        self.drawing = set()
        self.budget = RECORD_BUDGET

    # ---- values ----------------------------------------------------------------

    def intern(self, key, value):
        found = self.value_ids.get(key)
        if found is not None:
            return found
        ident = len(self.values)
        self.values.append(value)
        self.value_ids[key] = ident
        return ident

    def object_id(self, value):
        found = self.object_ids.get(id(value))
        if found is not None and found[1] is value:
            return found[0]
        ident = len(self.object_ids) + 1
        self.object_ids[id(value)] = (ident, value)
        return ident

    def is_node(self, value):
        kind = type(value)
        if getattr(kind, "__module__", "") == "builtins":
            return False
        if isinstance(value, HIDDEN_TYPES) or isinstance(value, tuple):
            return False
        return isinstance(getattr(value, "__dict__", None), dict) or isinstance(
            getattr(kind, "__slots__", None), (tuple, list)
        )

    def node_value(self, value, depth, nest):
        kind = type(value)
        oid = self.object_id(value)
        if id(value) in self.drawing:
            return self.intern(
                ("ref", kind.__name__, oid),
                {"kind": "ref", "type": kind.__name__, "objectId": oid},
            )
        if depth > MAX_RECORD_DEPTH or self.budget <= 0:
            return self.opaque(kind.__name__, "…")
        self.budget -= 1
        self.drawing.add(id(value))
        try:
            fields_source = getattr(value, "__dict__", None)
            if isinstance(fields_source, dict):
                fields = tuple(
                    (name, self.value_id(item, depth + 1, None, nest))
                    for name, item in itertools.islice(
                        fields_source.items(), MAX_FIELDS
                    )
                    if not name.startswith("__")
                )
            else:
                fields = tuple(
                    (name, self.value_id(getattr(value, name, None), depth + 1, None, nest))
                    for name in kind.__slots__[:MAX_FIELDS]
                )
        finally:
            self.drawing.discard(id(value))
        return self.intern(
            ("r", kind.__name__, oid, fields),
            {
                "kind": "record",
                "type": kind.__name__,
                "fields": [list(field) for field in fields],
                "objectId": oid,
            },
        )

    def value_id(self, value, depth=0, shape=None, nest=0):
        kind = type(value)
        if value is None:
            return self.intern(("none",), {"kind": "none", "text": "None"})
        if kind is bool:
            return self.intern(("b", value), {"kind": "bool", "value": value})
        if kind is int:
            try:
                text = str(value)
            except ValueError:
                text = f"<{value.bit_length()}-bit integer>"
            if len(text) > 60:
                text = f"{text[:24]}…({len(text)} digits)"
            return self.intern(("n", text), {"kind": "number", "text": text})
        if kind is float:
            text = repr(value)
            return self.intern(("f", text), {"kind": "number", "text": text})
        if kind is str:
            text = value if len(value) <= MAX_TEXT else value[:MAX_TEXT] + "…"
            return self.intern(
                ("s", len(value), text),
                {"kind": "string", "text": text, "length": len(value)},
            )
        if self.is_node(value):
            return self.node_value(value, depth, nest)
        if nest > MAX_DEPTH:
            return self.opaque(kind.__name__, "…")
        nest += 1
        if isinstance(value, tuple) and hasattr(value, "_fields"):
            fields = tuple(
                (name, self.value_id(getattr(value, name), depth + 1, None, nest))
                for name in value._fields[:MAX_FIELDS]
            )
            return self.record_value(kind.__name__, fields)
        if isinstance(value, (list, tuple, collections.deque)):
            length = len(value)
            visible = length if length <= SMALL_SEQUENCE else min(length, MAX_ITEMS)
            items = tuple(
                self.value_id(item, depth + 1, None, nest)
                for item in itertools.islice(value, visible)
            )
            if isinstance(value, tuple):
                seq_shape = "tuple"
            elif isinstance(value, collections.deque):
                seq_shape = "deque"
            else:
                seq_shape = shape or "array"
            type_name = kind.__name__
            oid = None if isinstance(value, tuple) else self.object_id(value)
            entry = {
                "kind": "sequence",
                "type": type_name,
                "shape": seq_shape,
                "items": list(items),
                "length": length,
            }
            if oid is not None:
                entry["objectId"] = oid
            return self.intern(("q", seq_shape, type_name, length, items, oid), entry)
        if isinstance(value, (set, frozenset)):
            try:
                ordered = sorted(value)
            except TypeError:
                ordered = list(value)
            items = tuple(
                self.value_id(item, depth + 1, None, nest)
                for item in ordered[:MAX_ITEMS]
            )
            type_name = kind.__name__
            oid = self.object_id(value) if kind is set else None
            entry = {
                "kind": "sequence",
                "type": type_name,
                "shape": "set",
                "items": list(items),
                "length": len(value),
            }
            if oid is not None:
                entry["objectId"] = oid
            return self.intern(("q", "set", type_name, len(value), items, oid), entry)
        if isinstance(value, dict):
            entries = tuple(
                (
                    self.value_id(key, depth + 1, None, nest),
                    self.value_id(item, depth + 1, None, nest),
                )
                for key, item in itertools.islice(value.items(), MAX_ENTRIES)
            )
            type_name = kind.__name__
            oid = self.object_id(value)
            return self.intern(
                ("m", type_name, len(value), entries, oid),
                {
                    "kind": "mapping",
                    "type": type_name,
                    "entries": [list(entry) for entry in entries],
                    "length": len(value),
                    "objectId": oid,
                },
            )
        if isinstance(value, (bytes, bytearray)):
            text = repr(bytes(value[:MAX_TEXT]))
            return self.intern(
                ("s", len(value), text),
                {"kind": "string", "text": text, "length": len(value)},
            )
        if isinstance(value, range):
            return self.opaque("range", repr(value))
        if isinstance(value, (complex,)):
            return self.opaque(kind.__name__, repr(value))
        if isinstance(value, HIDDEN_TYPES):
            return self.opaque("function", getattr(value, "__name__", kind.__name__))
        module = getattr(kind, "__module__", "")
        if module in ("builtins", "decimal", "fractions"):
            try:
                text = str(value)
            except TypeError, ValueError, ArithmeticError:
                text = kind.__name__
            return self.opaque(kind.__name__, text[:80])
        return self.opaque(kind.__name__, f"{kind.__name__} object")

    def record_value(self, type_name, fields):
        return self.intern(
            ("r", type_name, fields),
            {
                "kind": "record",
                "type": type_name,
                "fields": [list(field) for field in fields],
            },
        )

    def opaque(self, type_name, text):
        return self.intern(
            ("o", type_name, text), {"kind": "opaque", "type": type_name, "text": text}
        )

    # ---- frames ------------------------------------------------------------------

    def frame_vars(self, frame, activation):
        source = frame.f_globals if activation.module else frame.f_locals
        variables = []
        heaps = self.analysis.heap_names if self.analysis else ()
        for name, value in list(source.items()):
            if name.startswith("__") or (
                activation.module and name in self.hidden_globals
            ):
                continue
            if isinstance(value, (*HIDDEN_TYPES, StopRun, Stdin, Stdout)):
                continue
            shape = "heap" if name in heaps and type(value) is list else None
            self.budget = RECORD_BUDGET
            variables.append([name, self.value_id(value, 0, shape)])
        return variables

    def snapshot(self, frame, line):
        chain = []
        current = frame
        while current is not None:
            if current in self.active:
                chain.append(current)
            current = current.f_back
        chain.reverse()
        frames = []
        top = len(chain) - 1
        hidden = top - INNERMOST_FRAMES - OUTERMOST_FRAMES
        index = 0
        while index <= top:
            if hidden > 0 and index == OUTERMOST_FRAMES + 1:
                frames.append(
                    {
                        "id": -1,
                        "name": f"{hidden:,} more calls",
                        "line": 0,
                        "vars": [],
                        "elided": True,
                    }
                )
                index += hidden
                continue
            item = chain[index]
            activation = self.active[item]
            item_line = line if index == top else item.f_lineno
            if top - index >= INNERMOST_FRAMES:
                frames.append(
                    {
                        "id": activation.id,
                        "name": activation.name,
                        "line": item_line,
                        "vars": [],
                        "elided": True,
                    }
                )
            else:
                frames.append(
                    {
                        "id": activation.id,
                        "name": activation.name,
                        "line": item_line,
                        "vars": self.frame_vars(item, activation),
                    }
                )
            index += 1
        return frames

    def accesses_before(self, frame, activation, line):
        entries = self.analysis.accesses.get(line) if self.analysis else None
        if not entries:
            return None, None
        reads = []
        writes = []
        for name, codes, read, write in entries:
            if name in frame.f_locals and not activation.module:
                owner = activation.id
                container = frame.f_locals[name]
            elif name in frame.f_globals:
                owner = 0
                container = frame.f_globals[name]
            else:
                continue
            path = []
            try:
                for code in codes:
                    index = eval(code, frame.f_globals, frame.f_locals)
                    if isinstance(container, dict):
                        path.append(self.key_text(index))
                        container = container.get(index)
                        continue
                    if type(index) is not int or not isinstance(
                        container, (list, tuple, str, collections.deque)
                    ):
                        break
                    if index < 0:
                        index += len(container)
                    path.append(index)
                    container = (
                        container[index] if 0 <= index < len(container) else None
                    )
            # An index that cannot be evaluated here is simply not highlighted.
            except Exception:  # noqa: BLE001, S112
                continue
            if not path:
                continue
            access = {"frame": owner, "name": name, "path": path}
            if read and len(reads) < MAX_ACCESSES:
                reads.append(access)
            if write and len(writes) < MAX_ACCESSES:
                writes.append(access)
        return reads or None, writes or None

    @staticmethod
    def key_text(key):
        if isinstance(key, str):
            return f'"{key}"'
        if isinstance(key, bool):
            return "True" if key else "False"
        return str(key)

    # ---- steps -------------------------------------------------------------------

    def push_step(self, step, frame, line):
        step["frames"] = self.snapshot(frame, line)
        step["out"] = self.stdout.length
        step["err"] = self.stderr.length
        step["in"] = self.stdin_source.pos
        self.steps.append(step)

    def record(self, step, frame, line):
        self.total += 1
        if not self.recording:
            return
        if len(self.steps) >= self.max_steps:
            self.recording = False
            self.truncated = True
            return
        self.push_step(step, frame, line)

    def complete_line(self, frame, activation, next_line):
        line = activation.pending
        activation.pending = None
        step = {"event": "line", "line": line}
        body = self.analysis.bodies.get(line) if self.analysis else None
        if body is not None and next_line is not None:
            kind, body_start, body_end = body
            if body_start != line:
                entered = body_start <= next_line <= body_end
                if kind in ("if", "elif"):
                    step["cond"] = entered
                else:
                    branch_end = body_end
                    previous = activation.prev_line
                    counter = activation.loops.get(line, 0)
                    if previous is None or not (line <= previous <= branch_end):
                        counter = 0
                    if entered:
                        counter += 1
                    activation.loops[line] = counter
                    step["cond"] = entered
                    step["loop"] = {"line": line, "iteration": counter}
        if activation.reads:
            step["reads"] = activation.reads
        if activation.writes:
            step["writes"] = activation.writes
        activation.prev_line = line
        self.record(step, frame, line)

    def check_time(self, frame):
        self.count += 1
        if self.count & 255 == 0 and time.monotonic() > self.deadline:
            self.fail_here(
                frame,
                StopRun(
                    "timeout",
                    "Time limit reached",
                    f"The program ran for more than {round(self.time_ms / 1000)} seconds.",
                    [
                        "An infinite loop, or an input too large to follow step by step.",
                        f"{self.count:,} events ran before it stopped.",
                    ],
                ),
            )

    def fail_here(self, frame, stop):
        line = frame.f_lineno
        activation = self.active.get(frame)
        if activation is not None:
            activation.pending = None
        self.error_step = {"event": "error", "line": line}
        self.error_step["frames"] = self.snapshot(frame, line)
        self.error_step["out"] = self.stdout.length
        self.error_step["err"] = self.stderr.length
        self.error_step["in"] = self.stdin_source.pos
        self.error_exc = stop
        raise stop

    def check_output(self):
        if self.stdout.length + self.stderr.length > self.max_output:
            frame = sys._getframe()
            while frame is not None and frame.f_code.co_filename != LEARNER_FILE:
                frame = frame.f_back
            stop = StopRun(
                "output_limit",
                "Too much output",
                f"The program printed more than {self.max_output:,} characters.",
                ["Often an infinite loop that prints, or debug output left in."],
            )
            if frame is not None:
                self.fail_here(frame, stop)
            raise stop

    # ---- sys.settrace hooks --------------------------------------------------------

    def trace(self, frame, event, arg):
        code = frame.f_code
        if code.co_filename != LEARNER_FILE or code.co_name in SKIPPED_CODE:
            return None
        self.check_time(frame)
        if event == "call":
            module = code.co_name == "<module>"
            # Class bodies run like functions; they are not calls to show.
            if not module and not code.co_flags & CO_OPTIMIZED:
                return None
            ident = 0 if module else self.next_id
            if not module:
                self.next_id += 1
            name = "global" if module else code.co_qualname
            activation = Activation(ident, name, module)
            self.active[frame] = activation
            if not module:
                self.record(
                    {"event": "call", "line": code.co_firstlineno},
                    frame,
                    code.co_firstlineno,
                )
            return self.trace
        activation = self.active.get(frame)
        if activation is None:
            return self.trace
        if event == "line":
            activation.raising = False
            line = frame.f_lineno
            if activation.pending is not None:
                self.complete_line(frame, activation, line)
            if self.recording:
                activation.pending = line
                activation.reads, activation.writes = self.accesses_before(
                    frame, activation, line
                )
            else:
                activation.pending = None
                self.total += 1
        elif event == "return":
            if activation.raising:
                # Unwinding because of an exception: the error step shows it.
                del self.active[frame]
                return self.trace
            last = activation.pending
            if last is not None:
                self.complete_line(frame, activation, None)
            if not activation.module:
                line = (
                    last
                    if last is not None
                    else (activation.prev_line or frame.f_lineno)
                )
                step = {"event": "return", "line": line}
                if self.recording:
                    self.budget = RECORD_BUDGET
                    step["value"] = self.value_id(arg)
                self.record(step, frame, line)
            del self.active[frame]
        elif event == "exception":
            activation.raising = True
            exc = arg[1]
            if exc is not self.error_exc and not isinstance(exc, StopRun):
                self.error_exc = exc
                line = frame.f_lineno
                step = {"event": "error", "line": line}
                if activation.pending is not None:
                    reads, writes = activation.reads, activation.writes
                    if reads:
                        step["reads"] = reads
                    if writes:
                        step["writes"] = writes
                step["frames"] = self.snapshot(frame, line)
                step["out"] = self.stdout.length
                step["err"] = self.stderr.length
                step["in"] = self.stdin_source.pos
                self.error_step = step
                self.error_details = self.describe_error(frame, exc)
        return self.trace

    def describe_error(self, frame, exc):
        if not isinstance(exc, IndexError):
            return None
        entries = self.analysis.accesses.get(frame.f_lineno) if self.analysis else None
        for name, codes, _read, _write in entries or ():
            container = frame.f_locals.get(name, frame.f_globals.get(name))
            path = name
            try:
                for code in codes:
                    index = eval(code, frame.f_globals, frame.f_locals)
                    if (
                        not isinstance(container, (list, tuple, str, collections.deque))
                        or type(index) is not int
                    ):
                        break
                    size = len(container)
                    if not -size <= index < size:
                        details = [
                            f"Access attempted: {path}[{index}]",
                            f"Size: {size}",
                            "The container is empty, so no index is valid."
                            if size == 0
                            else f"Valid indexes: 0–{size - 1} (or -{size}–-1 from the end)",
                        ]
                        return details
                    container = container[index]
                    path = f"{path}[{index}]"
            # Details are optional; the error itself is always reported.
            except Exception:  # noqa: BLE001, S112
                continue
        return None


def _learner_line(tb):
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == LEARNER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def run_trace(source, stdin_text, max_steps, time_ms, max_output):
    started = time.monotonic()
    tracer = Tracer(source, stdin_text, max_steps, time_ms, max_output)
    result = {
        "language": "python",
        "steps": tracer.steps,
        "values": tracer.values,
        "stdout": "",
        "stderr": "",
        "status": "finished",
        "truncated": False,
        "totalSteps": 0,
        "branches": [],
        "indexHints": {},
        "warnings": tracer.warnings,
        "durationMs": 0,
    }
    try:
        tree = ast.parse(source, LEARNER_FILE)
        code = compile(tree, LEARNER_FILE, "exec")
    except SyntaxError as error:
        result["status"] = "error"
        result["error"] = {
            "kind": "compile",
            "title": "Syntax error",
            "message": error.msg or "The code has a syntax error.",
            "line": error.lineno or 1,
        }
        if error.offset:
            result["error"]["column"] = error.offset
        result["durationMs"] = (time.monotonic() - started) * 1000
        return json.dumps(result)

    analysis = Analysis(source, tree)
    tracer.analysis = analysis
    result["branches"] = sorted(analysis.branches, key=lambda item: item["line"])
    result["indexHints"] = {
        name: sorted(values) for name, values in analysis.index_hints.items()
    }

    real_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name.split(".")[0] in BLOCKED_MODULES:
            raise ImportError(f"The module {name} is not available in the visualizer.")
        return real_import(name, globals, locals, fromlist, level)

    def guarded_open(file, mode="r", *args, **kwargs):
        if file == 0:
            return tracer.stdin
        if file in (1, 2):
            return tracer.stdout if file == 1 else tracer.stderr
        raise OSError(
            "Files are not available in the visualizer. Read from standard input instead."
        )

    def leave(code=0):
        raise SystemExit(code)

    learner_builtins = dict(builtins.__dict__)
    learner_builtins["__import__"] = guarded_import
    learner_builtins["open"] = guarded_open
    learner_builtins["exit"] = leave
    learner_builtins["quit"] = leave
    namespace = {"__name__": "__main__", "__builtins__": learner_builtins}
    tracer.hidden_globals = set(namespace)

    saved = (
        sys.stdin,
        sys.stdout,
        sys.stderr,
        sys.getrecursionlimit(),
        sys.setrecursionlimit,
    )
    real_setrecursionlimit = sys.setrecursionlimit

    def capped_setrecursionlimit(limit):
        real_setrecursionlimit(max(100, min(int(limit), RECURSION_CAP)))

    sys.stdin, sys.stdout, sys.stderr = tracer.stdin, tracer.stdout, tracer.stderr
    real_setrecursionlimit(min(1000, RECURSION_CAP))
    sys.setrecursionlimit = capped_setrecursionlimit
    error = None
    try:
        sys.settrace(tracer.trace)
        try:
            # Running the learner's own program is the purpose of this tool; it
            # runs in the learner's browser, never on a server.
            exec(code, namespace)  # noqa: S102
        finally:
            sys.settrace(None)
    except SystemExit as exit_signal:
        code_value = exit_signal.code
        if code_value not in (None, 0) and not isinstance(code_value, str):
            tracer.warnings.append(
                {
                    "step": max(0, len(tracer.steps) - 1),
                    "line": 0,
                    "message": f"exit({code_value}) was called; a judge treats a non-zero exit code as a runtime error.",
                }
            )
        elif isinstance(code_value, str):
            tracer.stderr.write(code_value + "\n")
    except StopRun as stop:
        error = {"kind": stop.kind, "title": stop.title, "message": stop.message}
        if stop.details:
            error["details"] = stop.details
    except RecursionError as exc:
        error = {
            "kind": "recursion",
            "title": "Recursion too deep",
            "message": str(exc) or "maximum recursion depth exceeded",
            "details": [
                f"The visualizer allows up to {RECURSION_CAP:,} nested calls.",
                "A missing or wrong base case often causes this.",
            ],
            "exc": exc,
        }
    except MemoryError as exc:
        error = {
            "kind": "memory",
            "title": "Out of memory",
            "message": "The program used too much memory.",
            "exc": exc,
        }
    except BaseException as exc:  # noqa: BLE001 - every learner error is reported
        message = str(exc)
        if isinstance(exc, KeyError):
            message = f"Key {message} is not in the dictionary."
        elif isinstance(exc, EOFError):
            message = (
                "input() found no more input. Add the missing lines to the test input."
            )
        error = {
            "kind": "runtime",
            "title": type(exc).__name__,
            "message": message or type(exc).__name__,
            "exc": exc,
        }
        line = _learner_line(exc.__traceback__)
        if line is not None:
            error["line"] = line
    finally:
        sys.stdin, sys.stdout, sys.stderr = saved[0], saved[1], saved[2]
        sys.setrecursionlimit = saved[4]
        real_setrecursionlimit(saved[3])

    if error is not None:
        exc = error.pop("exc", None)
        step = tracer.error_step
        matches = step is not None and (exc is None or tracer.error_exc is exc)
        if matches:
            if "line" not in error:
                error["line"] = step["line"]
            if exc is not None and tracer.error_details and isinstance(exc, IndexError):
                error["details"] = tracer.error_details
            tracer.steps.append(step)
        result["status"] = "error"
        result["error"] = error

    result["stdout"] = tracer.stdout.value()
    result["stderr"] = tracer.stderr.value()
    result["truncated"] = tracer.truncated
    result["totalSteps"] = max(tracer.total, len(tracer.steps))
    result["durationMs"] = (time.monotonic() - started) * 1000
    return json.dumps(result, separators=(",", ":"))
