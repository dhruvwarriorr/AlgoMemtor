import { iconNode as node, motionIcon as mentorIcon } from './motion-icon'

/*
 * Mentor tool icons, drawn for what each tool does rather than borrowed
 * from a generic set. Drawing kit and motion: see motion-icon.tsx.
 */

// Doubt Helper: steps climbing toward a lit node, one hint at a time.
export const DoubtHelperIcon = mentorIcon(
  'DoubtHelperIcon',
  <>
    <path className="mi-draw" d="M3 20.5h4v-4h4v-4h4V9" pathLength={1} />
    <path className="mi-draw" d="M18.5 2v1.4" pathLength={1} />
    <path className="mi-draw" d="M22.4 7.5H21" pathLength={1} />
    <path className="mi-draw" d="M14.9 4.1l.9.9" pathLength={1} />
    <path className="mi-draw" d="M21.2 4.1l-.9.9" pathLength={1} />
    {node(18.5, 7.5, 2.1)}
  </>,
)

// Solution Explorer: one start splitting into three approaches; the
// straight, fastest path ends on the node.
export const SolutionExplorerIcon = mentorIcon(
  'SolutionExplorerIcon',
  <>
    <circle cx={4.2} cy={12} r={1.8} />
    <path
      className="mi-draw"
      d="M6 12h2.4c2.2 0 3.1-1.3 4-3.2C13.3 7 14.2 6 16.2 6H18"
      pathLength={1}
    />
    <path className="mi-draw" d="M6 12h11.6" pathLength={1} />
    <path
      className="mi-draw"
      d="M6 12h2.4c2.2 0 3.1 1.3 4 3.2.9 1.8 1.8 2.8 3.8 2.8H18"
      pathLength={1}
    />
    <circle cx={20} cy={6} r={1.6} />
    <circle cx={20} cy={18} r={1.6} />
    {node(19.8, 12, 2.1)}
  </>,
)

// Upsolve: a loop that turns back to a problem and closes it with a check.
export const UpsolveIcon = mentorIcon(
  'UpsolveIcon',
  <>
    <g className="mi-spin">
      <path d="M19.3 9.2A7.8 7.8 0 1 0 19.8 14" />
      <path d="M19.8 4.6l-.4 4.7-4.6-.5" />
    </g>
    <path className="mi-draw" d="M8.6 12.3l2.3 2.3 4.1-4.3" pathLength={1} />
    {node(19.8, 14, 1.6)}
  </>,
)

// Contest analysis: a contest clock with your submission pulse through it.
export const ContestAnalysisIcon = mentorIcon(
  'ContestAnalysisIcon',
  <>
    <path d="M10 2.8h4M12 2.8v2.4M18.3 6.6l1.3-1.3" />
    <path d="M19.4 11.6A7.6 7.6 0 1 1 12 5.9" />
    <path
      className="mi-draw"
      d="M3.4 13.6h3.4l1.5-2.6 2.2 5.2 2-4.4 1.3 1.8h2.1"
      pathLength={1}
    />
    {node(18.3, 13.6, 1.9)}
  </>,
)

// Progress report: growth read off real steps, trending up to a node.
export const ProgressReportIcon = mentorIcon(
  'ProgressReportIcon',
  <>
    <path d="M3.2 20.6h17.6" />
    <path d="M6 20.6v-3.4M10.4 20.6v-6M14.8 20.6v-4.4" opacity={0.45} />
    <path className="mi-draw" d="M4 15.4l5.2-5 3.7 2.6 5.4-6" pathLength={1} />
    {node(19.4, 5.8, 2)}
  </>,
)

// Test Case Visualizer: array cells with a pointer climbing to the cell
// being executed.
export const TestCaseVisualizerIcon = mentorIcon(
  'TestCaseVisualizerIcon',
  <>
    <rect height={5.6} rx={1.1} width={5.6} x={2.6} y={4.2} />
    <rect height={5.6} rx={1.1} width={5.6} x={9.2} y={4.2} />
    <rect height={5.6} rx={1.1} width={5.6} x={15.8} y={4.2} />
    <path className="mi-draw" d="M12 19.2v-6.6" pathLength={1} />
    <path className="mi-draw" d="M9.4 15.1 12 12.5l2.6 2.6" pathLength={1} />
    {node(12, 20.2, 1.8)}
  </>,
)
