import { useRef, type PointerEvent } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'

// Illustrative topic strengths for the hero preview. Labelled as an example.
const topics = [
  { label: 'Arrays', value: 82, color: '#1f9d5c' },
  { label: 'Two ptrs', value: 64, color: '#ff4d12' },
  { label: 'Greedy', value: 51, color: '#ff6a2e' },
  { label: 'Math', value: 45, color: '#f2a31b' },
  { label: 'Graphs', value: 38, color: '#ff8a5c' },
  { label: 'DP', value: 27, color: '#e0484f' },
]

const SIZE = 66
const GAP = 34
const MAX_HEIGHT = 240
const ease = [0.16, 1, 0.3, 1] as const

function shade(hex: string, amount: number) {
  return `color-mix(in oklab, ${hex} ${100 - amount}%, #000)`
}

// One solid column built from three faces in real CSS 3D space. The column
// grows by scaling on the Z axis, so every face stays attached.
function Column({
  index,
  label,
  value,
  color,
  reduceMotion,
}: {
  index: number
  label: string
  value: number
  color: string
  reduceMotion: boolean
}) {
  const height = (value / 100) * MAX_HEIGHT
  const x = index * (SIZE + GAP)
  const face = 'absolute [backface-visibility:hidden]'
  return (
    <>
      <motion.div
        className="absolute [transform-style:preserve-3d]"
        initial={reduceMotion ? false : { scaleZ: 0.02 }}
        style={{
          left: x,
          top: 0,
          width: SIZE,
          height: SIZE,
          originZ: 0,
        }}
        transition={{ delay: 0.3 + index * 0.12, duration: 1.3, ease }}
        viewport={{ once: true, margin: '-80px' }}
        whileInView={{ scaleZ: 1 }}
      >
        {/* top */}
        <div
          className={face}
          style={{
            inset: 0,
            background: `linear-gradient(135deg, ${color}, ${shade(color, 12)})`,
            transform: `translateZ(${height}px)`,
            boxShadow: `0 0 30px ${color}66`,
          }}
        />
        {/* front: hinged on the column's near edge and raised to face +y */}
        <div
          className={face}
          style={{
            left: 0,
            top: SIZE - height,
            width: SIZE,
            height,
            background: `linear-gradient(to top, ${shade(color, 20)}, ${shade(color, 55)})`,
            transformOrigin: 'bottom',
            transform: 'rotateX(-90deg)',
          }}
        />
        {/* side: the left edge, which faces the camera at this angle */}
        <div
          className={face}
          style={{
            left: 0,
            top: 0,
            width: height,
            height: SIZE,
            background: `linear-gradient(to right, ${shade(color, 38)}, ${shade(color, 68)})`,
            transformOrigin: 'left',
            transform: 'rotateY(-90deg)',
          }}
        />
      </motion.div>
      {/* label painted on the floor in front of the column */}
      <span
        className="absolute text-center text-[0.8rem] font-medium text-white/55"
        style={{ left: x - 10, top: SIZE + 14, width: SIZE + 20 }}
      >
        {label}
        <span className="block font-heading text-base font-bold text-white">
          {value}%
        </span>
      </span>
    </>
  )
}

// Isometric "skill skyline": each topic is a lit 3D column that rises into
// view, on a floor that tilts toward the pointer.
export function SkillSkyline() {
  const reduceMotion = useReducedMotion() ?? false
  const stageRef = useRef<HTMLDivElement>(null)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const springX = useSpring(pointerX, { stiffness: 80, damping: 18 })
  const springY = useSpring(pointerY, { stiffness: 80, damping: 18 })
  const rotateX = useTransform(springY, (value) => 58 - value * 10)
  const rotateZ = useTransform(springX, (value) => -38 + value * 14)
  const width = topics.length * (SIZE + GAP) - GAP

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || stageRef.current === null) return
    const rect = stageRef.current.getBoundingClientRect()
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5)
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5)
  }

  return (
    <div
      aria-label={`Example topic strengths: ${topics.map((topic) => `${topic.label} ${topic.value}%`).join(', ')}`}
      className="relative flex h-[24rem] items-center justify-center overflow-hidden [perspective:1200px] sm:h-[30rem]"
      onPointerLeave={() => {
        pointerX.set(0)
        pointerY.set(0)
      }}
      onPointerMove={onPointerMove}
      ref={stageRef}
      role="img"
    >
      <motion.div
        className="relative [transform-style:preserve-3d]"
        style={{
          width,
          height: SIZE + 40,
          rotateX: reduceMotion ? 58 : rotateX,
          rotateZ: reduceMotion ? -38 : rotateZ,
          translateY: 40,
        }}
      >
        {/* glowing floor grid */}
        <div
          aria-hidden="true"
          className="absolute rounded-lg border border-white/10"
          style={{
            inset: '-40px -50px -30px -40px',
            background:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(circle at 40% 40%, rgba(255,77,18,0.28), transparent 70%)',
          }}
        />
        {topics.map((topic, index) => (
          <Column
            color={topic.color}
            index={index}
            key={topic.label}
            label={topic.label}
            reduceMotion={reduceMotion}
            value={topic.value}
          />
        ))}
      </motion.div>
    </div>
  )
}
