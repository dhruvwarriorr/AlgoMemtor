import { iconNode as node, motionIcon as appIcon } from './motion-icon'

/*
 * App icons in the mentor tool style: each drawn for what it stands for,
 * on the same grid and stroke, with the brand node as the point of focus.
 * Drawing kit and motion: see motion-icon.tsx.
 */

// ---- Account menu ----------------------------------------------------------

// Problems: a practice checklist; the first item checks itself off and the
// one you are on is lit.
export const ProblemsIcon = appIcon(
  'ProblemsIcon',
  <>
    <rect height={4.4} rx={1.2} width={4.4} x={3} y={3.8} />
    <path className="mi-draw" d="M4.3 6.1l.9.9 1.5-1.8" pathLength={1} />
    <path d="M10.4 6h10" />
    <rect height={4.4} rx={1.2} width={4.4} x={3} y={9.8} />
    <path className="mi-draw" d="M10.4 12h6.4" pathLength={1} />
    {node(19.6, 12, 1.8)}
    <rect height={4.4} opacity={0.5} rx={1.2} width={4.4} x={3} y={15.8} />
    <path d="M10.4 18h8" opacity={0.5} />
  </>,
)

// Bookmarks: a ribbon that drops into place, holding what you saved.
export const BookmarksIcon = appIcon(
  'BookmarksIcon',
  <>
    <g className="mi-drop">
      <path d="M6.6 3.2h10.8a1.2 1.2 0 0 1 1.2 1.2v16.4L12 16.6l-6.6 4.2V4.4a1.2 1.2 0 0 1 1.2-1.2z" />
      <path className="mi-draw" d="M9.4 7.4h5.2" pathLength={1} />
    </g>
    {node(12, 11.4, 1.8)}
  </>,
)

// Contests: a trophy cup; the rays flash when you hover.
export const ContestsIcon = appIcon(
  'ContestsIcon',
  <>
    <path d="M7.6 4.2h8.8v4.6a4.4 4.4 0 0 1-8.8 0z" />
    <path d="M7.6 6H5.4a2.2 2.2 0 0 0 2.5 3.4M16.4 6h2.2a2.2 2.2 0 0 1-2.5 3.4" />
    <path d="M12 13.2v3.4M8.8 20.4h6.4M9.8 20.4c0-2.2.9-3.8 2.2-3.8s2.2 1.6 2.2 3.8" />
    <path className="mi-draw" d="M3 2.8l1.4 1.4" pathLength={1} />
    <path className="mi-draw" d="M21 2.8l-1.4 1.4" pathLength={1} />
    <path className="mi-draw" d="M12 1v1.4" pathLength={1} />
    {node(12, 8.2, 1.8)}
  </>,
)

// Memory: a small knowledge graph; links trace in to the node being
// remembered.
export const MemoryIcon = appIcon(
  'MemoryIcon',
  <>
    <circle cx={5} cy={6.6} r={1.9} />
    <circle cx={19} cy={6.6} r={1.9} />
    <circle cx={6.4} cy={18.6} r={1.9} />
    <circle cx={17.6} cy={18.6} r={1.9} />
    <path className="mi-draw" d="M6.7 7.6 10.5 11" pathLength={1} />
    <path className="mi-draw" d="M17.3 7.6 13.5 11" pathLength={1} />
    <path className="mi-draw" d="M7.8 17.3l2.9-3.6" pathLength={1} />
    <path className="mi-draw" d="M16.2 17.3l-2.9-3.6" pathLength={1} />
    {node(12, 12.4, 2.2)}
  </>,
)

// Settings: a gear that turns once around a lit centre.
export const SettingsIcon = appIcon(
  'SettingsIcon',
  <>
    <g className="mi-spin">
      <path d="M10.16 5.14 10.72 2.89h2.56l.56 2.25 1.71.71 1.99-1.2 1.81 1.81-1.2 1.99.71 1.71 2.25.56v2.56l-2.25.56-.71 1.71 1.2 1.99-1.81 1.81-1.99-1.2-1.71.71-.56 2.25h-2.56l-.56-2.25-1.71-.71-1.99 1.2-1.81-1.81 1.2-1.99-.71-1.71-2.25-.56v-2.56l2.25-.56.71-1.71-1.2-1.99 1.81-1.81 1.99 1.2z" />
      <circle cx={12} cy={12} r={3.6} />
    </g>
    {node(12, 12, 1.6)}
  </>,
)

// ---- Stat cards ------------------------------------------------------------

// Solved: two checks, the second traced in, ending on the node.
export const SolvedIcon = appIcon(
  'SolvedIcon',
  <>
    <path d="M2.6 12.8l3.8 3.8 8-8.6" opacity={0.5} />
    <path className="mi-draw" d="M9.8 15.4l1.2 1.2 8-8.6" pathLength={1} />
    {node(20.2, 6.8, 1.8)}
  </>,
)

// Streak: a flame that sways, with an ember at its heart.
export const StreakIcon = appIcon(
  'StreakIcon',
  <>
    <g className="mi-flicker">
      <path
        className="mi-draw"
        d="M12 21.2c-3.9 0-6.6-2.6-6.6-6.3 0-3.4 2.4-5.4 3.7-7.9.4 1.6 1.3 2.7 2.4 3.2C11.5 7 13 4.3 15.4 2.8c-.3 2.9.9 4.7 2.2 6.6 1 1.4 1.4 2.9 1.4 4.6 0 4.2-3 7.2-7 7.2z"
        pathLength={1}
      />
      <path
        d="M12 18.4c-1.5 0-2.5-1-2.5-2.4 0-1.2.8-2 1.4-2.9.5.8 1.1 1.2 1.9 1.4.3-.9.9-1.7 1.6-2.2.1 1.1.6 1.9 1 2.7.3.6.4 1 .4 1.4-.1 1.2-1.5 2-3.8 2z"
        opacity={0.5}
      />
    </g>
    {node(12, 16.4, 1.4)}
  </>,
)

// Platform: bars rising to the platform you use most.
export const PlatformIcon = appIcon(
  'PlatformIcon',
  <>
    <path d="M3 20.8h18" />
    <path d="M5.4 20.8v-5.6M9.8 20.8V11M14.2 20.8v-7.2" opacity={0.55} />
    <path className="mi-draw" d="M18.6 20.8V7.6" pathLength={1} />
    {node(18.6, 4.8, 2)}
  </>,
)

// Topic: a triangle, a circle and a square, joined at the topic you
// practise most.
export const TopicIcon = appIcon(
  'TopicIcon',
  <>
    <path d="M7 3.2l4 6.8H3z" />
    <circle cx={17} cy={6.8} r={3.4} />
    <rect height={6.4} rx={1.2} width={6.4} x={3.6} y={14} />
    <path className="mi-draw" d="M8.4 10.8l6.6 5.4" pathLength={1} />
    <path className="mi-draw" d="M15.6 10l1 4.6" pathLength={1} />
    <path className="mi-draw" d="M10 17.2h4.6" pathLength={1} />
    {node(17.2, 17.2, 2.1)}
  </>,
)

// Active days: a calendar page with the day ticked off.
export const ActiveDaysIcon = appIcon(
  'ActiveDaysIcon',
  <>
    <rect height={15.6} rx={2.6} width={17.2} x={3.4} y={5.2} />
    <path d="M3.4 10.2h17.2M8 3.2v3.8M16 3.2v3.8" />
    <path className="mi-draw" d="M8.4 15.2l2.4 2.4 4.4-4.6" pathLength={1} />
    {node(16.6, 13, 1.5)}
  </>,
)

// Submissions: a paper plane leaving a trail behind it.
export const SubmissionsIcon = appIcon(
  'SubmissionsIcon',
  <>
    <g className="mi-lift">
      <path d="M21 3 3.6 10.4l6.9 2.6 2.6 6.9z" />
      <path d="M10.5 13 21 3" />
    </g>
    <path d="M2.6 21c1.9-.6 3.4-1.8 4.6-3.6" strokeDasharray="1.2 1.8" />
    {node(10.5, 13, 1.5, false)}
  </>,
)

// Acceptance: an arrow landing in the centre of a target.
export const AcceptanceIcon = appIcon(
  'AcceptanceIcon',
  <>
    <circle cx={11} cy={13} r={8.2} />
    <circle cx={11} cy={13} r={4.6} opacity={0.6} />
    <path className="mi-draw" d="M11 13l8.6-8.6" pathLength={1} />
    <path d="M17 3.6h3.4V7" />
    {node(11, 13, 1.8)}
  </>,
)

// Peak rating: a summit with a flag planted on the highest point.
export const PeakIcon = appIcon(
  'PeakIcon',
  <>
    <path d="M2.4 20.6 8.6 10l3.4 5.2 3.4-6.6 6.2 12z" />
    <path d="M6.6 13.4l2 1.4 1.4-1.2" opacity={0.5} />
    <path className="mi-draw" d="M15.4 8.6V3.2l4 1.6-4 1.6" pathLength={1} />
    {node(15.4, 8.6, 1.6)}
  </>,
)

// Hardest solve: a difficulty gauge; the needle swings up to the top.
export const DifficultyIcon = appIcon(
  'DifficultyIcon',
  <>
    <path d="M3.4 17.6a8.6 8.6 0 1 1 17.2 0" />
    <path d="M5.9 11.4l1.3.8M12 8.2v1.5M18.1 11.4l-1.3.8" opacity={0.55} />
    <path className="mi-sweep" d="M12 17.4 16.8 12" />
    {node(12, 17.4, 2)}
  </>,
)

// Best day: a burst of light around a bright day.
export const BestDayIcon = appIcon(
  'BestDayIcon',
  <>
    <circle cx={12} cy={12} r={4.4} />
    <path className="mi-draw" d="M12 2.6v2.6" pathLength={1} />
    <path className="mi-draw" d="M12 18.8v2.6" pathLength={1} />
    <path className="mi-draw" d="M2.6 12h2.6" pathLength={1} />
    <path className="mi-draw" d="M18.8 12h2.6" pathLength={1} />
    <path className="mi-draw" d="M5.4 5.4l1.8 1.8" pathLength={1} />
    <path className="mi-draw" d="M16.8 16.8l1.8 1.8" pathLength={1} />
    <path className="mi-draw" d="M5.4 18.6l1.8-1.8" pathLength={1} />
    <path className="mi-draw" d="M16.8 7.2l1.8-1.8" pathLength={1} />
    {node(12, 12, 1.8)}
  </>,
)
