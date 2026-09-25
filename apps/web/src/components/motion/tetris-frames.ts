export type TetrisFrames = number[][]

type Cell = [number, number]

const SHAPES: { id: number; rotations: Cell[][] }[] = [
  {
    id: 1,
    rotations: [
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ],
      [
        [2, 0],
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    ],
  },
  {
    id: 2,
    rotations: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    ],
  },
  {
    id: 3,
    rotations: [
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    ],
  },
  {
    id: 4,
    rotations: [
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    ],
  },
  {
    id: 5,
    rotations: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [0, 2],
      ],
    ],
  },
  {
    id: 6,
    rotations: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 2],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2],
      ],
    ],
  },
  {
    id: 7,
    rotations: [
      [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
    ],
  },
]

const PIECES = SHAPES.map(({ id, rotations }) => ({
  id,
  rotations: rotations.map((cells) => {
    const left = Math.min(...cells.map(([x]) => x))
    const top = Math.min(...cells.map(([, y]) => y))
    return cells.map(([x, y]) => [x - left, y - top] as Cell)
  }),
}))

function hits(
  board: number[],
  cells: Cell[],
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
) {
  for (const [cellX, cellY] of cells) {
    const x = offsetX + cellX
    const y = offsetY + cellY
    if (x < 0 || x >= width || y >= height) return true
    if (y >= 0 && board[y * width + x]) return true
  }
  return false
}

function fall(
  board: number[],
  cells: Cell[],
  offsetX: number,
  from: number,
  width: number,
  height: number,
) {
  let y = from
  while (!hits(board, cells, offsetX, y + 1, width, height)) y += 1
  return y
}

function stamp(
  board: number[],
  cells: Cell[],
  offsetX: number,
  offsetY: number,
  id: number,
  width: number,
) {
  const next = [...board]
  for (const [cellX, cellY] of cells) {
    const y = offsetY + cellY
    if (y >= 0) next[y * width + offsetX + cellX] = id
  }
  return next
}

function fullRows(board: number[], width: number, height: number) {
  const rows: number[] = []
  for (let row = 0; row < height; row += 1) {
    let full = true
    for (let column = 0; column < width; column += 1) {
      if (!board[row * width + column]) {
        full = false
        break
      }
    }
    if (full) rows.push(row)
  }
  return rows
}

function collapse(
  board: number[],
  rows: number[],
  width: number,
  height: number,
) {
  const kept: number[][] = []
  for (let row = 0; row < height; row += 1) {
    if (!rows.includes(row)) {
      kept.push(board.slice(row * width, row * width + width))
    }
  }
  const next = new Array<number>((height - kept.length) * width).fill(0)
  for (const row of kept) next.push(...row)
  return next
}

function rate(board: number[], lines: number, width: number, height: number) {
  const heights: number[] = []
  let holes = 0

  for (let column = 0; column < width; column += 1) {
    let top = height
    for (let row = 0; row < height; row += 1) {
      if (board[row * width + column]) {
        top = row
        break
      }
    }
    heights.push(height - top)
    for (let row = top + 1; row < height; row += 1) {
      if (!board[row * width + column]) holes += 1
    }
  }

  let stack = 0
  let bumps = 0
  for (let column = 0; column < width; column += 1) {
    stack += heights[column]
    if (column > 0) {
      bumps += Math.abs(heights[column] - heights[column - 1])
    }
  }

  return -0.51 * stack + 0.76 * lines - 0.36 * holes - 0.18 * bumps
}

type Move = { rotation: number; x: number; y: number; value: number }

function moves(
  board: number[],
  piece: (typeof PIECES)[number],
  width: number,
  height: number,
) {
  const candidates: Move[] = []

  for (let rotation = 0; rotation < piece.rotations.length; rotation += 1) {
    const cells = piece.rotations[rotation]
    const span = Math.max(...cells.map(([x]) => x))
    for (let x = 0; x + span < width; x += 1) {
      const y = fall(board, cells, x, -4, width, height)
      const landed = stamp(board, cells, x, y, piece.id, width)
      const rows = fullRows(landed, width, height)
      candidates.push({
        rotation,
        x,
        y,
        value: rate(
          collapse(landed, rows, width, height),
          rows.length,
          width,
          height,
        ),
      })
    }
  }

  return candidates.sort((a, b) => b.value - a.value)
}

function bag() {
  const order = [0, 1, 2, 3, 4, 5, 6]
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swapIndex]] = [order[swapIndex], order[index]]
  }
  return order
}

export function generateTetrisFrames(width: number, height: number) {
  const cellCount = width * height
  const frames: TetrisFrames = []
  let board = new Array<number>(cellCount).fill(0)
  let queue: number[] = []
  let placed = 0
  let alive = true

  while (alive && placed < 60 && frames.length < 900) {
    if (queue.length === 0) queue = bag()
    const pieceIndex = queue.shift()
    if (pieceIndex === undefined) break
    const piece = PIECES[pieceIndex]
    const candidates = moves(board, piece, width, height)
    if (candidates.length === 0) break

    const slip = Math.max(0, placed - 10) * 0.06
    const candidateIndex =
      Math.random() < slip
        ? Math.min(candidates.length - 1, 1 + Math.floor(Math.random() * 2))
        : 0
    const candidate = candidates[candidateIndex]
    const shape = piece.rotations[candidate.rotation]
    const shapeHeight = Math.max(...shape.map(([, y]) => y)) + 1

    for (let y = -shapeHeight; y <= candidate.y; y += 1) {
      if (y + shapeHeight > 0) {
        frames.push(stamp(board, shape, candidate.x, y, piece.id, width))
      }
    }

    board = stamp(board, shape, candidate.x, candidate.y, piece.id, width)
    if (shape.some(([, y]) => candidate.y + y < 0)) alive = false

    const rows = fullRows(board, width, height)
    if (rows.length > 0) {
      const flash = [...board]
      for (const row of rows) {
        for (let column = 0; column < width; column += 1) {
          flash[row * width + column] = 8
        }
      }
      frames.push(flash, [...board], flash)
      board = collapse(board, rows, width, height)
      frames.push([...board], [...board])
    }

    placed += 1
  }

  const flood = [...board]
  for (let row = height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < width; column += 1) {
      flood[row * width + column] = 9
    }
    frames.push([...flood])
  }
  const empty = new Array<number>(cellCount).fill(0)
  frames.push([...flood], empty, [...flood], empty, empty)

  return frames
}
