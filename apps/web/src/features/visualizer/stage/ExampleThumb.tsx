import { motion, useReducedMotion } from 'motion/react'

import type { ExampleVisual } from '../examples'

// Small looping pictures on the example cards, hinting at what each example
// will show. Decorative only.

const loop = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const }

export function ExampleThumb({ visual }: { visual: ExampleVisual }) {
  const reduce = useReducedMotion() === true
  const animate = <T,>(value: T): T | undefined => (reduce ? undefined : value)
  const go = 'var(--go)'
  const soft = 'var(--go-soft)'
  const primary = 'var(--primary)'
  const line = 'color-mix(in oklab, var(--foreground) 40%, transparent)'
  switch (visual) {
    case 'bars':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[14, 22, 18, 34, 28, 44, 38, 52].map((height, index) => (
            <motion.rect
              animate={animate({
                fill: [
                  index > 3 ? go : 'var(--muted-foreground)',
                  go,
                  index > 3 ? go : 'var(--muted-foreground)',
                ],
              })}
              fill={index > 3 ? go : 'var(--muted-foreground)'}
              fillOpacity={index > 3 ? 0.85 : 0.35}
              height={height}
              key={index}
              rx={2}
              transition={{ ...loop, delay: index * 0.12 }}
              width={11}
              x={6 + index * 14}
              y={60 - height}
            />
          ))}
        </svg>
      )
    case 'cells':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[2, 4, 8, 12, 16].map((value, index) => (
            <g key={index}>
              <rect
                fill={soft}
                height={20}
                rx={4}
                stroke={go}
                strokeWidth={1.4}
                width={20}
                x={6 + index * 22}
                y={12}
              />
              <text
                className="font-mono"
                fill="var(--go-foreground)"
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                x={16 + index * 22}
                y={25}
              >
                {value}
              </text>
            </g>
          ))}
          <motion.g animate={animate({ x: [0, 66, 0] })} transition={loop}>
            <text fill={primary} fontSize={9} textAnchor="middle" x={16} y={44}>
              ▲
            </text>
            <rect fill={primary} height={11} rx={3} width={12} x={10} y={47} />
            <text
              fill="var(--primary-foreground)"
              fontSize={8}
              fontWeight={700}
              textAnchor="middle"
              x={16}
              y={55}
            >
              l
            </text>
          </motion.g>
          <motion.g animate={animate({ x: [0, -44, 0] })} transition={loop}>
            <text
              fill={primary}
              fontSize={9}
              textAnchor="middle"
              x={104}
              y={44}
            >
              ▲
            </text>
            <rect fill={primary} height={11} rx={3} width={12} x={98} y={47} />
            <text
              fill="var(--primary-foreground)"
              fontSize={8}
              fontWeight={700}
              textAnchor="middle"
              x={104}
              y={55}
            >
              r
            </text>
          </motion.g>
        </svg>
      )
    case 'stack':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          <path
            d="M40 6 V58 H80 V6"
            fill="none"
            stroke={line}
            strokeWidth={2}
          />
          {[0, 1].map((index) => (
            <rect
              fill={soft}
              height={11}
              key={index}
              rx={3}
              stroke={go}
              width={32}
              x={44}
              y={43 - index * 13}
            />
          ))}
          <motion.rect
            animate={animate({ y: [-12, 17, 17, -12], opacity: [0, 1, 1, 0] })}
            fill={go}
            height={11}
            rx={3}
            transition={{ duration: 2.6, repeat: Infinity }}
            width={32}
            x={44}
            y={17}
          />
        </svg>
      )
    case 'queue':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          <rect
            fill="none"
            height={26}
            rx={13}
            stroke={primary}
            strokeOpacity={0.4}
            strokeWidth={2}
            width={96}
            x={12}
            y={19}
          />
          {[0, 1, 2].map((index) => (
            <motion.circle
              animate={animate({
                cx: [92 - index * 22, 70 - index * 22, 92 - index * 22],
              })}
              cx={92 - index * 22}
              cy={32}
              fill={index === 2 ? primary : soft}
              key={index}
              r={8}
              stroke={primary}
              transition={loop}
            />
          ))}
        </svg>
      )
    case 'heap':
    case 'tree':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[
            [60, 12, 36, 34],
            [60, 12, 84, 34],
            [36, 34, 22, 54],
            [36, 34, 50, 54],
          ].map(([x1, y1, x2, y2], index) => (
            <line
              key={index}
              stroke={line}
              strokeWidth={1.4}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
            />
          ))}
          {[
            [60, 12],
            [36, 34],
            [84, 34],
            [22, 54],
            [50, 54],
          ].map(([cx, cy], index) => (
            <motion.circle
              animate={animate({
                fill: [
                  soft,
                  index === 0 && visual === 'heap' ? primary : go,
                  soft,
                ],
              })}
              cx={cx}
              cy={cy}
              fill={soft}
              key={index}
              r={8}
              stroke={go}
              strokeWidth={1.4}
              transition={{ ...loop, delay: index * 0.3 }}
            />
          ))}
        </svg>
      )
    case 'graph':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[
            [20, 32, 48, 12],
            [48, 12, 78, 20],
            [20, 32, 50, 52],
            [50, 52, 78, 20],
            [78, 20, 102, 44],
          ].map(([x1, y1, x2, y2], index) => (
            <line
              key={index}
              stroke={line}
              strokeWidth={1.4}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
            />
          ))}
          {[
            [20, 32],
            [48, 12],
            [50, 52],
            [78, 20],
            [102, 44],
          ].map(([cx, cy], index) => (
            <motion.circle
              animate={animate({ fill: [soft, go, go, soft] })}
              cx={cx}
              cy={cy}
              fill={soft}
              key={index}
              r={8}
              stroke={go}
              strokeWidth={1.4}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: [0, 0.5, 0.5, 1, 1.5][index],
              }}
            />
          ))}
        </svg>
      )
    case 'list':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <rect
                fill={soft}
                height={18}
                rx={4}
                stroke={go}
                strokeWidth={1.4}
                width={24}
                x={8 + index * 38}
                y={24}
              />
              {index < 2 ? (
                <path
                  d={`M${34 + index * 38} 33 H${44 + index * 38}`}
                  stroke={line}
                  strokeWidth={1.6}
                />
              ) : null}
            </g>
          ))}
          <motion.g
            animate={animate({ x: [0, 38, 76, 0] })}
            transition={{ duration: 3.2, repeat: Infinity }}
          >
            <rect fill={primary} height={10} rx={3} width={20} x={10} y={9} />
            <text
              fill="var(--primary-foreground)"
              fontSize={7}
              fontWeight={700}
              textAnchor="middle"
              x={20}
              y={16.5}
            >
              cur
            </text>
          </motion.g>
        </svg>
      )
    case 'grid':
    case 'cube':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {Array.from({ length: 12 }, (_, index) => {
            const r = Math.floor(index / 4)
            const c = index % 4
            return (
              <motion.rect
                animate={animate({
                  fillOpacity: [0.15, 0.2 + (r + c) * 0.12, 0.15],
                })}
                fill={primary}
                fillOpacity={0.15 + (r + c) * 0.1}
                height={15}
                key={index}
                rx={2}
                stroke={primary}
                strokeOpacity={0.3}
                transition={{ ...loop, delay: (r + c) * 0.2 }}
                width={15}
                x={28 + c * 17}
                y={6 + r * 17}
              />
            )
          })}
        </svg>
      )
    case 'calls':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[
            [60, 12, 34, 34],
            [60, 12, 86, 34],
            [34, 34, 20, 54],
            [34, 34, 48, 54],
          ].map(([x1, y1, x2, y2], index) => (
            <line
              key={index}
              stroke={line}
              strokeWidth={1.2}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
            />
          ))}
          {[
            [60, 12],
            [34, 34],
            [86, 34],
            [20, 54],
            [48, 54],
          ].map(([x, y], index) => (
            <motion.rect
              animate={animate({ fill: ['var(--card)', primary, soft] })}
              fill="var(--card)"
              height={11}
              key={index}
              rx={3}
              stroke={primary}
              strokeWidth={1.2}
              transition={{
                duration: 3.4,
                repeat: Infinity,
                delay: [0, 0.4, 1.6, 0.8, 1.2][index],
              }}
              width={22}
              x={x - 11}
              y={y - 5.5}
            />
          ))}
        </svg>
      )
    case 'map':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[0, 1, 2].map((index) => (
            <motion.g
              animate={animate({ opacity: [0.4, 1, 0.4] })}
              key={index}
              transition={{ ...loop, delay: index * 0.4 }}
            >
              <rect
                fill={soft}
                height={13}
                rx={3}
                width={34}
                x={20}
                y={8 + index * 17}
              />
              <path
                d={`M57 ${14.5 + index * 17} H64`}
                stroke={line}
                strokeWidth={1.4}
              />
              <rect
                fill="none"
                height={13}
                rx={3}
                stroke={go}
                width={34}
                x={66}
                y={8 + index * 17}
              />
            </motion.g>
          ))}
        </svg>
      )
    case 'bug':
      return (
        <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 120 64">
          {[0, 1, 2, 3].map((index) => (
            <rect
              fill={index === 2 ? 'var(--danger-soft)' : 'var(--card)'}
              height={9}
              key={index}
              rx={2}
              stroke={index === 2 ? 'var(--destructive)' : 'var(--border)'}
              width={index === 2 ? 70 : 56 + index * 6}
              x={18}
              y={8 + index * 13}
            />
          ))}
          <motion.circle
            animate={animate({ r: [5, 9, 5], opacity: [1, 0.3, 1] })}
            cx={98}
            cy={38}
            fill="var(--destructive)"
            r={5}
            transition={loop}
          />
        </svg>
      )
  }
}
