// =============================================================================
// DICOM Annotation Viewer — Main Application
// Atomorphic Mini Hackathon
// =============================================================================
//
// This viewer is ALREADY WORKING (load DICOM, scroll, W/L, draw annotations).
// Your four hackathon tasks are to ADD NEW FEATURES using the skeleton
// functions below — look for the TODO markers!
//
// Tasks summary:
//   Task 1 — Load Ground Truth    (30 pts)  → handleLoadGT()
//   Task 2 — Export XML           (30 pts)  → handleExportXML()
//   Task 3 — Load AI Segmentation (40 pts)  → handleLoadAI()
//   Bonus A — Run AI Pipeline     (30 pts)  → handleRunAI()
//   Bonus B — UI Polish           (20 pts)  → style / UX improvements
//
// See HACKATHON_TASKS.md for full specifications and hints.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  initCornerstone,
  initViewport,
  initTools,
  setActiveTool,
  getRenderingEngine,
  VIEWPORT_ID,
} from './core/init'
import { loadDicomFiles, loadSampleData, getImageIds } from './core/loader'
import {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  RectangleROITool,
  PlanarFreehandROITool,
  annotation,
} from '@cornerstonejs/tools'
import { Enums as CoreEnums } from '@cornerstonejs/core'
import { Enums as ToolEnums } from '@cornerstonejs/tools'

// ─── Types ────────────────────────────────────────────────────────────────────
type NavTool  = 'WindowLevel' | 'Pan' | 'Zoom'
type DrawTool = 'Length' | 'RectangleROI' | 'Freehand'
type ActiveTool = NavTool | DrawTool

interface SegmentEntry { index: number; label: string; color: number[] }
interface AnnotationEntry { uid: string; type: string }
interface Info { slice: string; total: string; wl: string }

// =============================================================================
export default function App() {
  const viewportRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [ready,       setReady]       = useState(false)
  const [status,      setStatus]      = useState('Initialising...')
  const [activeTool,  setActiveToolUI] = useState<ActiveTool>('WindowLevel')
  const [info,        setInfo]        = useState<Info>({ slice: '--', total: '--', wl: '--' })
  const [segments,    setSegments]    = useState<SegmentEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])

  // ── Initialise Cornerstone once the viewport div is mounted ────────────────
  useEffect(() => {
    if (!viewportRef.current) return
    const el = viewportRef.current

    ;(async () => {
      try {
        setStatus('Initialising Cornerstone3D…')
        await initCornerstone()
        initViewport(el)
        initTools()

        // Try to auto-load sample data from public/data/
        setStatus('Looking for sample data…')
        const n = await loadSampleData((loaded, total) =>
          setStatus(`Loading sample data… ${loaded}/${total}`)
        )
        if (n > 0) {
          setInfo({ slice: String(Math.floor(n / 2) + 1), total: String(n), wl: '--' })
          setStatus(`Loaded ${n} sample image${n !== 1 ? 's' : ''} — ready!`)
        } else {
          setStatus('Ready — use "Load DICOM" to load images')
        }

        setReady(true)
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }, [])

  // ── Slice change listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const handleSlice = () => {
      const re = getRenderingEngine()
      if (!re) return
      const vp = re.getViewport(VIEWPORT_ID) as any
      const idx = vp?.getCurrentImageIdIndex?.() ?? 0
      setInfo(prev => ({ ...prev, slice: String(idx + 1), total: String(getImageIds().length) }))
    }

    el.addEventListener(CoreEnums.Events.STACK_VIEWPORT_SCROLL, handleSlice)
    return () => el.removeEventListener(CoreEnums.Events.STACK_VIEWPORT_SCROLL, handleSlice)
  }, [ready])

  // ── W/L change listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const handleVOI = (evt: Event) => {
      const { range } = (evt as CustomEvent).detail ?? {}
      if (!range) return
      const W = Math.round(range.upper - range.lower)
      const L = Math.round((range.upper + range.lower) / 2)
      setInfo(prev => ({ ...prev, wl: `${W} / ${L}` }))
    }

    el.addEventListener(CoreEnums.Events.VOI_MODIFIED, handleVOI)
    return () => el.removeEventListener(CoreEnums.Events.VOI_MODIFIED, handleVOI)
  }, [ready])

  // ── Annotation change listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewportRef.current) return
    const el = viewportRef.current

    const refresh = () => {
      const all = annotation.state.getAllAnnotations()
      setAnnotations(all.map(a => ({ uid: a.annotationUID ?? '', type: a.metadata?.toolName ?? '' })))
    }

    el.addEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, refresh)
    el.addEventListener(ToolEnums.Events.ANNOTATION_REMOVED,   refresh)
    return () => {
      el.removeEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, refresh)
      el.removeEventListener(ToolEnums.Events.ANNOTATION_REMOVED,   refresh)
    }
  }, [ready])

  // ── File loading ───────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus(`Loading ${files.length} file(s)…`)
    const n = await loadDicomFiles(Array.from(files), (loaded, total) =>
      setStatus(`Loading… ${loaded}/${total}`)
    )
    if (n === 0) { setStatus('No DICOM files found'); return }
    setInfo(prev => ({ ...prev, slice: String(Math.floor(n / 2) + 1), total: String(n) }))
    setStatus(`Loaded ${n} image${n !== 1 ? 's' : ''}`)
  }, [])

  // ── Navigation tool switch ─────────────────────────────────────────────────
  const handleNavTool = useCallback((tool: NavTool) => {
    const name = tool === 'WindowLevel' ? WindowLevelTool.toolName
               : tool === 'Pan'         ? PanTool.toolName
                                        : ZoomTool.toolName
    setActiveTool(name)
    setActiveToolUI(tool)
  }, [])

  // ── Annotation tool switch ─────────────────────────────────────────────────
  const handleDrawTool = useCallback((tool: DrawTool) => {
    const name = tool === 'Length'       ? LengthTool.toolName
               : tool === 'RectangleROI' ? RectangleROITool.toolName
                                         : PlanarFreehandROITool.toolName
    setActiveTool(name)
    setActiveToolUI(tool)
  }, [])

  // ── Reset view ─────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const re = getRenderingEngine()
    if (!re) return
    const vp = re.getViewport(VIEWPORT_ID) as any
    vp?.resetCamera?.()
    vp?.render?.()
    setStatus('View reset')
  }, [])

  // ── Export JSON (built-in utility) ─────────────────────────────────────────
  const handleExportJSON = useCallback(() => {
    const all = annotation.state.getAllAnnotations()
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'annotations.json'; a.click()
    URL.revokeObjectURL(url)
    setStatus('Exported annotations.json')
  }, [])

  // ===========================================================================
  // HACKATHON TASKS — implement the functions below
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // TASK 1 — Load Ground Truth Annotations (30 points)
  // ---------------------------------------------------------------------------
  // Load the LIDC XML file from /data/sample_annotations/ and render the
  // radiologist-drawn nodule contours as PlanarFreehandROI annotations.
  //
  // Steps (see HACKATHON_TASKS.md § Task 1 for full hints):
  //   1. Fetch the XML:  await fetch('/data/sample_annotations/<name>.xml')
  //   2. Parse it with DOMParser to find <roi> → <edgeMap> elements
  //   3. Convert pixel (col, row) to world coords using:
  //        import { utilities } from '@cornerstonejs/core'
  //        const worldPoint = utilities.imageToWorldCoords(imageId, [col, row])
  //      Z comes directly from <imageZposition> in the XML (already in mm)
  //   4. Build PlanarFreehandROI annotations and add them with
  //        annotation.state.addAnnotation(ann, element)
  //
  const handleLoadGT = useCallback(async () => {
    // TODO Task 1 — replace the placeholder below with your implementation
    setStatus('TODO Task 1: Load Ground Truth — implement handleLoadGT()')
    alert(
      'TASK 1 — Load Ground Truth (30 pts)\n\n' +
      'Implement handleLoadGT() in src/App.tsx.\n\n' +
      'Steps:\n' +
      '1. fetch(\'/data/sample_annotations/<name>.xml\')\n' +
      '2. Parse XML → <roi> → <edgeMap> x/y/z coords\n' +
      '3. Convert pixel → world coords using viewport\n' +
      '4. Create PlanarFreehandROI annotations\n\n' +
      'See HACKATHON_TASKS.md for full hints!'
    )
  }, [])

  // ---------------------------------------------------------------------------
  // TASK 2 — Export Annotations as LIDC-compatible XML (30 points)
  // ---------------------------------------------------------------------------
  // Export all PlanarFreehandROI annotations drawn by the user to an XML file
  // that matches the LIDC annotation schema.
  //
  // Steps (see HACKATHON_TASKS.md § Task 2):
  //   1. Get all annotations:  annotation.state.getAllAnnotations()
  //   2. Filter for PlanarFreehandROI annotations
  //   3. Convert world coords back to pixel coords using:
  //        vp.worldToCanvas(worldPoint)
  //   4. Build XML string with <LidcReadMessage> → <readingSession> →
  //        <unblindedReadNodule> → <roi> → <edgeMap x="…" y="…"/>
  //   5. Trigger download as annotations.xml
  //
  const handleExportXML = useCallback(() => {
    // TODO Task 2 — replace the placeholder below with your implementation
    setStatus('TODO Task 2: Export XML — implement handleExportXML()')
    alert(
      'TASK 2 — Export as XML (30 pts)\n\n' +
      'Implement handleExportXML() in src/App.tsx.\n\n' +
      'Steps:\n' +
      '1. annotation.state.getAllAnnotations()\n' +
      '2. Filter PlanarFreehandROI\n' +
      '3. world → pixel coords via viewport\n' +
      '4. Build & download annotations.xml\n\n' +
      'See HACKATHON_TASKS.md for XML schema!'
    )
  }, [])

  // ---------------------------------------------------------------------------
  // TASK 3 — Load AI Segmentation Overlay (40 points)
  // ---------------------------------------------------------------------------
  // Load the TotalSegmentator NIfTI result from
  // /data/sample_annotations/segmentation.nii.gz and display it as a
  // Cornerstone3D labelmap segmentation overlay.
  //
  // Steps (see HACKATHON_TASKS.md § Task 3):
  //   1. Fetch and decode the NIfTI file (consider: nifti-reader-js)
  //        npm install nifti-reader-js
  //   2. Create a segmentation representation:
  //        segmentation.addSegmentations([{ segmentationId, representation }])
  //   3. Add the labelmap to the tool group
  //   4. Call setSegments() to populate the Segments panel (bottom-right)
  //
  const handleLoadAI = useCallback(async () => {
    // TODO Task 3 — replace the placeholder below with your implementation
    setStatus('TODO Task 3: Load AI Result — implement handleLoadAI()')
    alert(
      'TASK 3 — Load AI Segmentation (40 pts)\n\n' +
      'Implement handleLoadAI() in src/App.tsx.\n\n' +
      'Steps:\n' +
      '1. Fetch NIfTI: /data/sample_annotations/segmentation.nii.gz\n' +
      '2. Decode with nifti-reader-js\n' +
      '3. Create Cornerstone3D labelmap segmentation\n' +
      '4. Display overlay with per-segment colours\n\n' +
      'See HACKATHON_TASKS.md for API examples!'
    )
  }, [])

  // ---------------------------------------------------------------------------
  // BONUS A — One-Click AI Pipeline (30 points)
  // ---------------------------------------------------------------------------
  // Trigger the full TotalSegmentator pipeline in one click:
  //   1. Send the loaded DICOM to a Python backend (you need to build one), OR
  //   2. Show instructions to run scripts/run_totalsegmentator.py manually
  //      and poll for the output file to appear.
  //
  // Partial credit is awarded for any working progress toward automation.
  //
  const handleRunAI = useCallback(async () => {
    // TODO Bonus A — replace the placeholder below with your implementation
    setStatus('TODO Bonus A: Run AI Pipeline — implement handleRunAI()')
    alert(
      'BONUS A — One-Click AI Pipeline (30 pts)\n\n' +
      'Implement handleRunAI() in src/App.tsx.\n\n' +
      'Options:\n' +
      '1. Build a Python backend to call TotalSegmentator\n' +
      '2. Guide the user to run scripts/run_totalsegmentator.py\n' +
      '   then poll /data/sample_annotations/ for the NIfTI output\n\n' +
      'Partial credit for any working progress!\n\n' +
      'See scripts/ folder for the Python utilities.'
    )
  }, [])

  // ==========================================================================
  return (
    <div id="app">

      {/* Header */}
      <header className="header">
        <h1>DICOM Annotation Viewer</h1>
        <span className="subtitle">Atomorphic Mini Hackathon</span>
      </header>

      {/* Toolbar */}
      <div className="toolbar">

        {/* File loading */}
        <div className="tool-group">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".dcm"
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <button disabled={!ready} onClick={() => fileInputRef.current?.click()}>
            Load DICOM
          </button>
        </div>

        <div className="divider" />

        {/* Navigation tools */}
        <div className="tool-group">
          {(['WindowLevel', 'Pan', 'Zoom'] as NavTool[]).map(tool => (
            <button
              key={tool}
              disabled={!ready}
              className={activeTool === tool ? 'active' : ''}
              onClick={() => handleNavTool(tool)}
            >
              {tool === 'WindowLevel' ? 'W/L' : tool}
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Annotation drawing tools */}
        <div className="tool-group">
          {([
            ['Length',       'Length'],
            ['RectangleROI', 'Rect'],
            ['Freehand',     'Freehand'],
          ] as [DrawTool, string][]).map(([tool, label]) => (
            <button
              key={tool}
              disabled={!ready}
              className={activeTool === tool ? 'active' : ''}
              onClick={() => handleDrawTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Utility */}
        <div className="tool-group">
          <button disabled={!ready} onClick={handleReset}>Reset</button>
          <button disabled={!ready} onClick={handleExportJSON}>Export JSON</button>
        </div>

        <div className="divider" />

        {/* ── HACKATHON TASK BUTTONS ── */}
        <div className="tool-group hackathon-tasks">
          <button disabled={!ready} onClick={handleLoadGT}>
            Load GT
          </button>
          <button disabled={!ready} onClick={handleExportXML}>
            Export XML
          </button>
          <button disabled={!ready} onClick={handleLoadAI}>
            Load AI
          </button>
          <button disabled={!ready} onClick={handleRunAI}>
            Run AI
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="main-content">

        {/* Left panel — image info */}
        <div className="panel">
          <h3>Image Info</h3>
          <div className="list-content">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Slice',  `${info.slice} / ${info.total}`],
                  ['W / L',  info.wl],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--text-dim)', paddingBottom: 6 }}>{label}</td>
                    <td style={{ paddingBottom: 6 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Viewport */}
        <div className="viewport-container">
          <div className="viewport">
            <div ref={viewportRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* Right panel — annotations + segments */}
        <div className="panel right-panel">
          <h3>Annotations</h3>
          <div className="list-content">
            {annotations.length === 0
              ? <p className="empty">No annotations</p>
              : annotations.map(a => (
                  <div key={a.uid} className="annotation-item">
                    <span className="annotation-type">{a.type}</span>
                  </div>
                ))
            }
          </div>

          <h3 style={{ borderTop: '1px solid var(--border)' }}>Segments</h3>
          <div className="list-content">
            {segments.length === 0
              ? <p className="empty">No segmentation loaded</p>
              : segments.map(s => (
                  <div key={s.index} className="segment-item">
                    <span
                      className="segment-color"
                      style={{ background: `rgb(${s.color[0]},${s.color[1]},${s.color[2]})` }}
                    />
                    <span className="segment-label">{s.label}</span>
                  </div>
                ))
            }
          </div>
        </div>

      </div>

      {/* Status bar */}
      <footer className="status-bar">{status}</footer>

    </div>
  )
}
