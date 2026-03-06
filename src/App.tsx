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
//   Task 1 — Study Selector          → handleSelectStudy()
//   Task 2 — Load Ground Truth        → handleLoadGT()
//   Task 3 — Run AI Segmentation      → handleRunAI()
//   Task 4 — Show AI Segmentation     → handleShowAISeg()
//   Bonus A — AI-Assisted Segmentation → handleAIAssist()
//   Bonus B — UI Polish / Extra Tools
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
  setupResizeObserver,
  VIEWPORT_ID,
  getToolGroup,
} from './core/init'
import { loadDicomFiles, loadStudy, getImageIds, LIDC_STUDIES } from './core/loader'
import {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  RectangleROITool,
  PlanarFreehandROITool,
  annotation,
  segmentation as segmentationModule,
} from '@cornerstonejs/tools'
import { Enums as CoreEnums, utilities as csUtils, metaData, imageLoader } from '@cornerstonejs/core'
import { Enums as ToolEnums } from '@cornerstonejs/tools'
import dcmjs from 'dcmjs'

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
  const [activeStudy, setActiveStudy] = useState<string | null>(null)
  const [info,        setInfo]        = useState<Info>({ slice: '--', total: '--', wl: '--' })
  const [segments,    setSegments]    = useState<SegmentEntry[]>([])
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])
  const [segPath,     setSegPath]     = useState<string | null>(null)
  const [aiRunning,   setAiRunning]   = useState(false)

  // ── Initialise Cornerstone once the viewport div is mounted ────────────────
  useEffect(() => {
    if (!viewportRef.current) return
    const el = viewportRef.current

    let cleanupResize: (() => void) | undefined

    ;(async () => {
      try {
        setStatus('Initialising Cornerstone3D…')
        await initCornerstone()
        initViewport(el)
        initTools()
        cleanupResize = setupResizeObserver(el)
        setReady(true)
        setStatus('Ready — select a study from the panel to begin')
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()

    return () => { cleanupResize?.() }
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
  // TASK 1 — Study Selector
  // ---------------------------------------------------------------------------
  // Build a data panel that lists the available LIDC studies and loads the
  // selected study's CT slices into the viewer.
  //
  // LIDC_STUDIES (imported from ./core/loader) is an array of study metadata.
  // loadStudy(caseId) (also in ./core/loader) fetches and loads the CT slices.
  //
  // See HACKATHON_TASKS.md § Task 1 for hints.
  //
  const handleSelectStudy = useCallback(async (caseId: string) => {
    try {
      setStatus(`Loading ${caseId}…`)
      setActiveStudy(caseId)
      const n = await loadStudy(caseId, (loaded, total) =>
        setStatus(`Loading ${caseId}… ${loaded}/${total}`)
      )
      setInfo(prev => ({ ...prev, slice: String(Math.floor(n / 2) + 1), total: String(n) }))
      setStatus(`${caseId} — ${n} slices loaded`)
    } catch (err) {
      setStatus(`Error loading ${caseId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // TASK 2 — Load Ground Truth Annotations
  // ---------------------------------------------------------------------------
  // Load the LIDC XML file for the active study and render the
  // radiologist-drawn nodule contours as PlanarFreehandROI annotations
  // on the correct slices.
  //
  // See HACKATHON_TASKS.md § Task 2 for hints.
  //
  const handleLoadGT = useCallback(async () => {
    if (!activeStudy) { setStatus('Select a study first'); return }

    const study = LIDC_STUDIES.find(s => s.id === activeStudy)
    if (!study) return

    try {
      setStatus('Loading ground truth annotations…')

      // 1. Fetch the LIDC XML
      const xmlUrl = `/data/${activeStudy}/annotations/${study.xml}`
      const resp = await fetch(xmlUrl)
      if (!resp.ok) throw new Error(`Failed to fetch ${xmlUrl}: ${resp.status}`)
      const xmlText = await resp.text()

      // 2. Parse XML (namespace-aware: xmlns="http://www.nih.gov")
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlText, 'text/xml')
      const NS = 'http://www.nih.gov'

      // 3. Pre-load all images so their metadata (ImagePositionPatient) is available.
      //    With wadouri:, metadata is only populated after the DICOM file is fetched.
      const imageIds = getImageIds()
      setStatus(`Loading metadata for ${imageIds.length} slices…`)
      await Promise.all(imageIds.map(id => imageLoader.loadAndCacheImage(id)))

      // 4. Build a Z-position → imageId lookup from the loaded stack
      const zToImageId = new Map<string, string>()
      for (const imgId of imageIds) {
        const ipp = metaData.get('imagePlaneModule', imgId)?.imagePositionPatient
        if (ipp) {
          const zKey = parseFloat(ipp[2]).toFixed(1)
          zToImageId.set(zKey, imgId)
        }
      }
      console.log(`Z→imageId map: ${zToImageId.size} entries from ${imageIds.length} images`)

      // 4. Extract ROIs and create annotations
      const rois = doc.getElementsByTagNameNS(NS, 'roi')
      let addedCount = 0

      for (let i = 0; i < rois.length; i++) {
        const roi = rois[i]

        // Get Z position
        const zElem = roi.getElementsByTagNameNS(NS, 'imageZposition')[0]
        if (!zElem?.textContent) continue
        const zVal = parseFloat(zElem.textContent.trim())
        const zKey = zVal.toFixed(1)

        // Find matching imageId
        const imageId = zToImageId.get(zKey)
        if (!imageId) continue

        // Get edge points
        const edgeMaps = roi.getElementsByTagNameNS(NS, 'edgeMap')
        if (edgeMaps.length < 3) continue // skip single-point markers

        // Convert pixel coords to world coords
        const polyline: [number, number, number][] = []
        for (let j = 0; j < edgeMaps.length; j++) {
          const xElem = edgeMaps[j].getElementsByTagNameNS(NS, 'xCoord')[0]
          const yElem = edgeMaps[j].getElementsByTagNameNS(NS, 'yCoord')[0]
          if (!xElem?.textContent || !yElem?.textContent) continue

          const xCoord = parseFloat(xElem.textContent)
          const yCoord = parseFloat(yElem.textContent)

          // imageToWorldCoords: [0] along rowCosines (horiz=col), [1] along columnCosines (vert=row)
          const worldPt = csUtils.imageToWorldCoords(imageId, [xCoord, yCoord])
          if (worldPt) {
            polyline.push(worldPt as [number, number, number])
          }
        }

        if (polyline.length < 3) continue

        // 5. Build PlanarFreehandROI annotation object
        const ann = {
          annotationUID: crypto.randomUUID(),
          metadata: {
            toolName: PlanarFreehandROITool.toolName,
            referencedImageId: imageId,
            FrameOfReferenceUID: metaData.get('imagePlaneModule', imageId)?.frameOfReferenceUID ?? '',
          },
          data: {
            handles: { points: [] as [number, number, number][], activeHandleIndex: null },
            contour: {
              polyline,
              closed: true,
            },
            label: '',
          },
          highlighted: false,
          isLocked: true,
          isVisible: true,
          invalidated: true,
          autoGenerated: true,
        }

        annotation.state.addAnnotation(ann as any, viewportRef.current!)
        addedCount++
      }

      // 6. Ensure PlanarFreehandROI tool is at least Enabled so annotations render
      const tg = getToolGroup()
      try { tg.setToolEnabled(PlanarFreehandROITool.toolName) } catch { /* ok */ }

      // 7. Refresh the viewport to render annotations
      const re = getRenderingEngine()
      re?.getViewport(VIEWPORT_ID)?.render()

      // Update annotations list in sidebar
      const all = annotation.state.getAllAnnotations()
      setAnnotations(all.map(a => ({ uid: a.annotationUID ?? '', type: a.metadata?.toolName ?? '' })))

      setStatus(`Loaded ${addedCount} ground truth contours from ${study.xml}`)
    } catch (err) {
      setStatus(`Error loading GT: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [activeStudy])

  // ---------------------------------------------------------------------------
  // TASK 3 — Run AI Segmentation Model
  // ---------------------------------------------------------------------------
  // Trigger TotalSegmentator or MONAI Label on the active study's CT data and
  // retrieve the segmentation result so Task 4 can display it.
  //
  // See HACKATHON_TASKS.md § Task 3 for hints and available scripts.
  //
  const handleRunAI = useCallback(async () => {
    if (!activeStudy) { setStatus('Select a study first'); return }
    if (aiRunning) { setStatus('AI segmentation already running…'); return }

    try {
      setAiRunning(true)
      setStatus(`Running AI segmentation on ${activeStudy}… (this may take a while)`)

      const resp = await fetch('http://localhost:8000/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: activeStudy }),
      })

      if (!resp.ok) {
        const detail = await resp.text()
        throw new Error(`Server error ${resp.status}: ${detail}`)
      }

      const data = await resp.json()
      const path = '/' + data.seg_path   // make it a browser-fetchable URL
      setSegPath(path)
      setStatus(`AI segmentation complete → ${data.seg_path}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setStatus('Error: Cannot reach segmentation server. Is it running on localhost:8000?')
      } else {
        setStatus(`Error running AI: ${msg}`)
      }
    } finally {
      setAiRunning(false)
    }
  }, [activeStudy, aiRunning])

  // ---------------------------------------------------------------------------
  // TASK 4 — Display AI Segmentation Overlay
  // ---------------------------------------------------------------------------
  // Load a DICOM SEG file (from Task 3, or the pre-computed fallback in
  // data/<activeStudy>/annotations/) and display it as a coloured labelmap
  // overlay using Cornerstone3D's segmentation API.
  //
  // See HACKATHON_TASKS.md § Task 4 for hints.
  //
  const handleShowAISeg = useCallback(async () => {
    if (!activeStudy) { setStatus('Select a study first'); return }

    // Use segPath from Task 3 if available, otherwise fall back to pre-computed file
    const study = LIDC_STUDIES.find(s => s.id === activeStudy)
    if (!study) return
    const url = segPath ?? `/data/${activeStudy}/annotations/${activeStudy}_lung_nodules_seg.dcm`

    try {
      setStatus('Loading DICOM SEG file…')

      // 1. Fetch and parse the DICOM SEG
      const arrayBuffer = await fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch SEG: ${r.status}`)
        return r.arrayBuffer()
      })

      const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer)
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict)

      const numFrames = Number(dataset.NumberOfFrames) || 0
      const rows = Number(dataset.Rows) || 0
      const cols = Number(dataset.Columns) || 0
      const pixelsPerFrame = rows * cols

      if (numFrames === 0 || pixelsPerFrame === 0) throw new Error('Invalid SEG: no frames or dimensions')

      // 2. Extract segment metadata
      const segSequence: any[] = Array.isArray(dataset.SegmentSequence)
        ? dataset.SegmentSequence
        : dataset.SegmentSequence ? [dataset.SegmentSequence] : []

      const segmentMeta: { index: number; label: string; color: number[] }[] = []
      const skipSegNums = new Set<number>()
      for (let i = 0; i < segSequence.length; i++) {
        const seg = segSequence[i]
        const segNum = Number(seg.SegmentNumber) || (i + 1)
        const label = seg.SegmentLabel || seg.SegmentDescription || `Segment ${i + 1}`
        // Skip "Background" segment — it covers the whole image and obscures the CT
        if (/background/i.test(label)) {
          skipSegNums.add(segNum)
          continue
        }
        segmentMeta.push({ index: segNum, label, color: [255, 0, 0] })
      }

      // 3. Unpack bitpacked pixel data — get raw ArrayBuffer from dict (naturalizeDataset mangles binary)
      let pixelDataBuffer: ArrayBuffer
      const rawPD = (dicomData.dict as any)['7FE00010']
      if (rawPD?.Value?.[0] instanceof ArrayBuffer) {
        pixelDataBuffer = rawPD.Value[0]
      } else if (dataset.PixelData instanceof ArrayBuffer) {
        pixelDataBuffer = dataset.PixelData
      } else if (dataset.PixelData?.byteLength) {
        pixelDataBuffer = dataset.PixelData.buffer ?? dataset.PixelData
      } else {
        throw new Error('Could not extract PixelData from DICOM SEG')
      }
      // Check if data is bitpacked (1 bit/pixel) or byte-per-pixel
      const expectedBytesIfBitpacked = Math.ceil(numFrames * pixelsPerFrame / 8)
      const isBitpacked = pixelDataBuffer.byteLength <= expectedBytesIfBitpacked * 1.1
      const pixelValues = isBitpacked
        ? dcmjs.data.BitArray.unpack(pixelDataBuffer)
        : new Uint8Array(pixelDataBuffer)
      console.log('SEG PixelData:', pixelDataBuffer.byteLength, 'bytes,',
        isBitpacked ? 'bitpacked' : 'byte-per-pixel',
        'pixels:', pixelValues.length, 'expected:', numFrames * pixelsPerFrame)

      // 4. Get per-frame functional groups to map each frame → Z position + segment number
      const perFrame: any[] = dataset.PerFrameFunctionalGroupsSequence || []
      // Log full keys of first frame to find SegmentIdentificationSequence location
      console.log('PerFrame[0] keys:', perFrame[0] ? Object.keys(perFrame[0]) : 'none')
      console.log('PerFrame[0] full:', JSON.stringify(perFrame[0], null, 2).slice(0, 1500))

      // 5. Build Z → imageId map from CT stack (use .toFixed(1) for robust matching)
      const imageIds = getImageIds()
      await Promise.all(imageIds.map(id => imageLoader.loadAndCacheImage(id)))

      const zToImageId = new Map<string, string>()
      for (const imgId of imageIds) {
        const ipp = metaData.get('imagePlaneModule', imgId)?.imagePositionPatient
        if (ipp) {
          const zKey = parseFloat(ipp[2]).toFixed(1)
          zToImageId.set(zKey, imgId)
        }
      }
      console.log('CT Z→imageId map:', zToImageId.size, 'entries. Sample keys:', [...zToImageId.keys()].slice(0, 5))

      // 6. Create derived labelmap images for all CT slices
      const derivedImages = imageLoader.createAndCacheDerivedLabelmapImages(imageIds)
      const derivedImageIds = derivedImages.map((img: any) => img.imageId)

      // Build imageId → derived image index lookup
      const imageIdToIdx = new Map<string, number>()
      imageIds.forEach((id, idx) => imageIdToIdx.set(id, idx))

      // 7. Write segment labels into the derived labelmap pixel data
      let matchedFrames = 0, skippedBg = 0, noZMatch = 0, pixelsWritten = 0
      for (let f = 0; f < numFrames; f++) {
        const frameGroup = perFrame[f]
        if (!frameGroup) continue

        // Get segment number for this frame — check multiple locations
        let segNum = 0
        // 1. SegmentIdentificationSequence (standard location)
        const segId = frameGroup.SegmentIdentificationSequence
        if (segId) {
          segNum = Number(Array.isArray(segId) ? segId[0]?.ReferencedSegmentNumber : segId?.ReferencedSegmentNumber) || 0
        }
        // 2. FrameContentSequence.DimensionIndexValues (common in TotalSegmentator output)
        if (!segNum) {
          const fcs = frameGroup.FrameContentSequence
          const fc = Array.isArray(fcs) ? fcs[0] : fcs
          const div = fc?.DimensionIndexValues
          if (div != null) {
            segNum = Number(Array.isArray(div) ? div[0] : div) || 0
          }
        }
        if (!segNum) segNum = 1  // ultimate fallback

        // Skip background segment frames
        if (skipSegNums.has(segNum)) { skippedBg++; continue }

        // Get Z position for this frame
        const planePos = frameGroup.PlanePositionSequence
        const ipp = Array.isArray(planePos) ? planePos[0]?.ImagePositionPatient : planePos?.ImagePositionPatient
        if (!ipp) {
          if (f < 3) console.log(`Frame ${f}: no IPP. planePos=`, planePos)
          continue
        }

        // ImagePositionPatient is [x, y, z] — extract Z
        const ippArr = Array.isArray(ipp) ? ipp : [ipp]
        const zVal = parseFloat(ippArr.length >= 3 ? ippArr[2] : ippArr[0])
        const zKey = zVal.toFixed(1)

        if (f < 3) console.log(`Frame ${f}: seg=${segNum}, ipp=`, ipp, `zKey=${zKey}, match=${zToImageId.has(zKey)}`)

        const ctImageId = zToImageId.get(zKey)
        if (!ctImageId) { noZMatch++; continue }

        const sliceIdx = imageIdToIdx.get(ctImageId)
        if (sliceIdx === undefined) continue

        // Get the derived image's pixel data and write segment values
        const derivedImg = derivedImages[sliceIdx] as any
        const scalarData = derivedImg.voxelManager?.getScalarData?.()
          ?? derivedImg.getPixelData?.()
        if (!scalarData) {
          if (f < 3) console.log(`Frame ${f}: no scalarData. derivedImg keys=`, Object.keys(derivedImg))
          continue
        }

        const frameOffset = f * pixelsPerFrame
        for (let p = 0; p < pixelsPerFrame; p++) {
          if (pixelValues[frameOffset + p] !== 0) {
            scalarData[p] = segNum
            pixelsWritten++
          }
        }
        matchedFrames++
      }
      console.log(`SEG frame matching: matched=${matchedFrames}, skippedBg=${skippedBg}, noZMatch=${noZMatch}, pixelsWritten=${pixelsWritten}`)

      // 8. Register segmentation with Cornerstone tools
      const segmentationId = `seg-${activeStudy}-${Date.now()}`

      segmentationModule.addSegmentations([{
        segmentationId,
        representation: {
          type: ToolEnums.SegmentationRepresentations.Labelmap,
          data: { imageIds: derivedImageIds } as any,
        },
        config: {
          segments: Object.fromEntries(
            segmentMeta.map(s => [s.index, { label: s.label, active: false }])
          ),
        },
      }])

      segmentationModule.addLabelmapRepresentationToViewport(VIEWPORT_ID, [{
        segmentationId,
        type: ToolEnums.SegmentationRepresentations.Labelmap,
      }])

      // 9. Update segments panel with actual colors from Cornerstone's color LUT
      const colorLUT = segmentationModule.state.getColorLUT(0)
      const segmentsWithColors = segmentMeta.map(s => ({
        ...s,
        color: colorLUT?.[s.index]
          ? [colorLUT[s.index][0], colorLUT[s.index][1], colorLUT[s.index][2]]
          : s.color,
      }))
      setSegments(segmentsWithColors)

      // 10. Re-render
      getRenderingEngine()?.getViewport(VIEWPORT_ID)?.render()
      setStatus(`Loaded ${numFrames} SEG frames (${segmentMeta.length} segment${segmentMeta.length !== 1 ? 's' : ''})`)
    } catch (err) {
      setStatus(`Error loading SEG: ${err instanceof Error ? err.message : String(err)}`)
      console.error('SEG load error:', err)
    }
  }, [activeStudy, segPath])

  // ---------------------------------------------------------------------------
  // BONUS A — AI-Assisted Segmentation
  // ---------------------------------------------------------------------------
  // POST the active study ID to a local segmentation API at localhost:8000,
  // receive the resulting DICOM SEG path, and display it as a labelmap overlay.
  // Show loading feedback while the model runs and handle errors gracefully.
  //
  // API: POST http://localhost:8000/segment  { case_id: string }
  //      → { seg_path: string }
  //
  // See HACKATHON_TASKS.md § Bonus A for hints.
  //
  const handleAIAssist = useCallback(async () => {
    // TODO Bonus A — implement handleAIAssist()
    console.warn('Bonus A not yet implemented')
    setStatus('Bonus A: AI-Assisted Segmentation — not yet implemented')
  }, [activeStudy])

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
          <button disabled={!ready || aiRunning} onClick={handleRunAI}>
            {aiRunning ? 'Running…' : 'Run AI'}
          </button>
          <button disabled={!ready} onClick={handleShowAISeg}>
            Show AI Seg
          </button>
          <button disabled={!ready} onClick={handleAIAssist}>
            AI Assist
          </button>
        </div>

      </div>

      {/* Main content */}
      <div className="main-content">

        {/* Left panel — image info + study selector */}
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

          {/* ── TASK 1: Study Selector — implement handleSelectStudy() ── */}
          <h3 style={{ borderTop: '1px solid var(--border)' }}>Studies</h3>
          <div className="list-content">
            {LIDC_STUDIES.map(s => (
              <div
                key={s.id}
                className={`annotation-item${activeStudy === s.id ? ' active' : ''}`}
                style={{
                  cursor: 'pointer',
                  padding: '6px 8px',
                  background: activeStudy === s.id ? 'var(--accent)' : 'transparent',
                  color: activeStudy === s.id ? '#fff' : 'inherit',
                  borderRadius: 4,
                  marginBottom: 2,
                }}
                onClick={() => handleSelectStudy(s.id)}
              >
                <strong>{s.id}</strong>
                <br />
                <span style={{ fontSize: 11, opacity: 0.8 }}>{s.slices} slices</span>
              </div>
            ))}
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
