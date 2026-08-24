// Seeded Diagram Labeler puzzles. Each diagram is an SVG background with
// N labeled slots. The user drags labels from a shuffled pool onto slots
// and scores by fraction of correctly-placed labels.
//
// slot.x, slot.y are the CENTER coordinates within svgViewBox.
// bgSvg is raw SVG inner-markup (paths / rects / lines / text-for-context),
// wrapped by the page in a <svg viewBox={svgViewBox} …> element.

export interface DiagramSlot {
  id: string;
  x: number;
  y: number;
  w?: number;   // width of the label bubble (defaults 120)
  h?: number;   // height (defaults 28)
  correctLabel: string;
}

export interface DiagramPuzzle {
  id: string;
  title: string;
  subject: string;
  description: string;
  svgViewBox: string;    // e.g. "0 0 500 400"
  bgSvg: string;         // raw <path> / <line> / <text> etc. — no <svg> wrapper
  slots: DiagramSlot[];
  // Label pool = all correctLabel strings shuffled + optionally decoys
  decoys?: string[];
}

export const DIAGRAM_PUZZLES: DiagramPuzzle[] = [
  {
    id: 'osi-layers',
    title: 'The OSI 7-Layer Model',
    subject: 'CN',
    description: 'Label each layer of the OSI reference model. Layer 1 is at the bottom.',
    svgViewBox: '0 0 500 460',
    bgSvg: `
      <rect x="140" y="20"  width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="80"  width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="140" width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="200" width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="260" width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="320" width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="140" y="380" width="220" height="50" rx="4" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <text x="50"  y="52"  font-size="14" fill="#475569" font-weight="700">Layer 7</text>
      <text x="50"  y="112" font-size="14" fill="#475569" font-weight="700">Layer 6</text>
      <text x="50"  y="172" font-size="14" fill="#475569" font-weight="700">Layer 5</text>
      <text x="50"  y="232" font-size="14" fill="#475569" font-weight="700">Layer 4</text>
      <text x="50"  y="292" font-size="14" fill="#475569" font-weight="700">Layer 3</text>
      <text x="50"  y="352" font-size="14" fill="#475569" font-weight="700">Layer 2</text>
      <text x="50"  y="412" font-size="14" fill="#475569" font-weight="700">Layer 1</text>
    `,
    slots: [
      { id: 'l7', x: 250, y: 45,  correctLabel: 'Application' },
      { id: 'l6', x: 250, y: 105, correctLabel: 'Presentation' },
      { id: 'l5', x: 250, y: 165, correctLabel: 'Session' },
      { id: 'l4', x: 250, y: 225, correctLabel: 'Transport' },
      { id: 'l3', x: 250, y: 285, correctLabel: 'Network' },
      { id: 'l2', x: 250, y: 345, correctLabel: 'Data Link' },
      { id: 'l1', x: 250, y: 405, correctLabel: 'Physical' },
    ],
  },
  {
    id: 'tcp-handshake',
    title: 'TCP 3-Way Handshake',
    subject: 'CN',
    description: 'Label the three messages exchanged when a TCP connection is established.',
    svgViewBox: '0 0 500 300',
    bgSvg: `
      <text x="80" y="40" font-size="16" fill="#1e293b" font-weight="800">Client</text>
      <text x="380" y="40" font-size="16" fill="#1e293b" font-weight="800">Server</text>
      <line x1="120" y1="60" x2="120" y2="280" stroke="#94a3b8" stroke-width="2"/>
      <line x1="420" y1="60" x2="420" y2="280" stroke="#94a3b8" stroke-width="2"/>

      <line x1="120" y1="100" x2="420" y2="130" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>
      <line x1="420" y1="180" x2="120" y2="210" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>
      <line x1="120" y1="240" x2="420" y2="270" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>

      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L7,3 z" fill="#6366f1"/>
        </marker>
      </defs>
    `,
    slots: [
      { id: 'm1', x: 270, y: 108, w: 100, correctLabel: 'SYN' },
      { id: 'm2', x: 270, y: 188, w: 100, correctLabel: 'SYN + ACK' },
      { id: 'm3', x: 270, y: 248, w: 100, correctLabel: 'ACK' },
    ],
    decoys: ['FIN', 'RST'],
  },
  {
    id: 'er-lite',
    title: 'Simple ER Diagram — Students & Courses',
    subject: 'DBMS',
    description: 'Label the entities, the relationship, and its cardinality.',
    svgViewBox: '0 0 500 260',
    bgSvg: `
      <rect x="30"  y="90" width="140" height="70" rx="6" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <rect x="330" y="90" width="140" height="70" rx="6" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
      <polygon points="215,90 285,125 215,160 145,125" fill="#fef3c7" stroke="#eab308" stroke-width="1.5"/>
      <line x1="170" y1="125" x2="145" y2="125" stroke="#334155" stroke-width="1.5"/>
      <line x1="285" y1="125" x2="330" y2="125" stroke="#334155" stroke-width="1.5"/>
      <text x="30" y="220" font-size="12" fill="#475569" font-style="italic">
        A student can enroll in many courses; each course can have many students.
      </text>
    `,
    slots: [
      { id: 'left',   x: 100, y: 125, w: 100, correctLabel: 'Student' },
      { id: 'rel',    x: 215, y: 125, w: 110, correctLabel: 'Enrolls_In' },
      { id: 'right',  x: 400, y: 125, w: 100, correctLabel: 'Course' },
      { id: 'card',   x: 250, y: 190, w: 100, correctLabel: 'M : N' },
    ],
    decoys: ['1 : 1', '1 : N', 'Teaches'],
  },
];
