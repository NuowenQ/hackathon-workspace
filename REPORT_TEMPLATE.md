# Hackathon Report — Qian Nuowen

**Date:** 24 February 2026
**Coding:** 16:00–18:00
**Report writing:** 18:00–18:30
**Tasks completed:** Task 1, Task 2, Task 3, Task 4, Bonus A, Bonus B

---

## Overview

I implemented all four core tasks and both bonuses for the DICOM Annotation Viewer. My strategy was to work sequentially — Task 1 first (since it unlocks everything else), then Tasks 2-4 in order, followed by the bonuses. For Task 4, I used the pre-computed DICOM SEG files during development to avoid waiting for TotalSegmentator. All implementation lives in a single file (`src/App.tsx`), building on the existing skeleton functions.

---

## Tasks

### Task 1 — Study Selector

Built a clickable list of LIDC studies in the left sidebar panel. Each item shows the study ID and slice count. Clicking a study calls `loadStudy(caseId)` to fetch CT slices into the viewport, with a progress callback updating the status bar (e.g. "Loading LIDC-IDRI-0001... 45/133"). The `activeStudy` state tracks the selection and applies visual highlighting (accent background, white text). After loading, the viewport jumps to the middle slice.

**Tradeoff:** I set `activeStudy` before loading completes so that Tasks 2-4 can reference it immediately. This means a user could theoretically click "Load GT" while slices are still loading, but the guard checks in those handlers prevent issues.

### Task 2 — Load Ground Truth

This was the most technically challenging core task. The pipeline:

1. Fetch the LIDC XML using the study metadata's `xml` field
2. Parse with `getElementsByTagNameNS` (the `xmlns="http://www.nih.gov"` namespace means standard queries silently return nothing)
3. Pre-load all images via `imageLoader.loadAndCacheImage()` to populate `ImagePositionPatient` metadata (with `wadouri:`, metadata is unavailable until the DICOM is actually fetched)
4. Build a Z-position-to-imageId lookup map using `.toFixed(1)` rounding for robust float matching
5. For each `<roi>`, extract `<imageZposition>` and `<edgeMap>` points, convert pixel coords to world coords via `csUtils.imageToWorldCoords()`, and create `PlanarFreehandROI` annotations
6. Skip ROIs with fewer than 3 edge points (single-point markers can't form freehand contours)

**What surprised me:** The `imageToWorldCoords` coordinate order was the single biggest gotcha — see the [dedicated section below](#the-imagetoworldcoords-coordinate-trap) for the full story.

### Task 3 — Run AI Segmentation

Chose the HTTP API approach: the "Run AI" button POSTs `{ case_id }` to `localhost:8000/segment` (the provided FastAPI server). The server returns `{ seg_path, status }` — if the SEG already exists on disk, it returns instantly without re-running the model.

The returned `seg_path` is prefixed with `/` to form a browser-fetchable URL and stored in React state for Task 4. An `aiRunning` state flag disables the button and shows "Running..." to prevent duplicate submissions. Network errors (server not running) are detected and shown as a user-friendly message.

**Tradeoff:** I didn't implement polling or WebSocket progress updates — the fetch simply awaits the response. For CPU-mode TotalSegmentator (5-30 min), the UI just shows "Running..." with no progress indicator. Given the time constraint, this was acceptable since the pre-computed files mean the response is instant in practice.

### Task 4 — Display AI Segmentation

This task required the deepest dive into DICOM internals. The pipeline:

1. Fetch the DICOM SEG file (from Task 3's `segPath` or the pre-computed fallback)
2. Parse with `dcmjs.data.DicomMessage.readFile()` and `naturalizeDataset()`
3. Extract segment metadata from `SegmentSequence`, filtering out "Background" segments
4. Unpack bitpacked pixel data (1-bit-per-pixel) using `dcmjs.data.BitArray.unpack()` — critically, the raw binary must be extracted from `dicomData.dict['7FE00010'].Value[0]` because `naturalizeDataset` corrupts binary ArrayBuffers
5. Map each SEG frame to a CT slice using Z-position from `PerFrameFunctionalGroupsSequence.PlanePositionSequence.ImagePositionPatient`
6. Extract segment numbers from `SegmentIdentificationSequence` or `FrameContentSequence.DimensionIndexValues` (TotalSegmentator uses the latter)
7. Create derived labelmap images, write segment values into their pixel data
8. Register with Cornerstone via `addSegmentations()` + `addLabelmapRepresentationToViewport()`
9. Read colours from Cornerstone's internal colour LUT to populate the Segments sidebar panel

**What surprised me:** The `naturalizeDataset` binary corruption issue. The first attempt used `dataset.PixelData` directly, which produced garbage. It took several iterations to discover the raw dict access pattern.

### Bonus

**Bonus A — AI-Assisted Segmentation:** Combined Task 3 + Task 4 into a single "AI Assist" button click. POSTs to the segment server, then immediately loads and displays the returned SEG as a labelmap overlay. The `aiRunning` state is shared with "Run AI" to prevent concurrent requests. Status bar provides step-by-step feedback.

**Bonus B — UI Polish:** Implemented two features:

1. **Keyboard shortcuts** — `W`/`P`/`Z` switch navigation tools, arrow keys navigate slices. Events are ignored when focus is in an input field, and arrow keys call `preventDefault()` to block page scrolling.

2. **Slice slider** — A range input below the viewport for visually scrubbing through slices. Bidirectionally synced with the slice counter: moving the slider updates the viewport and UI, and mouse-wheel scrolling updates the slider position. Fixed a bug where programmatic `setImageIdIndex()` calls (from slider/keyboard) didn't trigger `STACK_VIEWPORT_SCROLL` events, requiring explicit `setInfo()` calls to keep the displayed slice number in sync.

---

## Reflection

### What was the hardest part?

The `imageToWorldCoords` coordinate order issue (detailed below). It consumed significant debugging time because the contours rendered — just in the wrong positions. The hint in the task description was actively misleading, and the fix required reading the actual Cornerstone3D implementation rather than trusting the documentation.

### The imageToWorldCoords coordinate trap

The task description states:

> Its signature is `(imageId, [row, col])` — note the order: row first, then column (i.e. `[yCoord, xCoord]` from the LIDC `<edgeMap>`).

This led to the initial implementation:

```ts
// WRONG — following the hint literally
const worldPt = csUtils.imageToWorldCoords(imageId, [yCoord, xCoord])
```

The contours appeared mirrored/offset from actual nodule locations. After extensive debugging, I traced the issue to the parameter order. The actual Cornerstone3D implementation interprets the second parameter as:
- `imageCoords[0]` is used along **rowCosines** (the horizontal/column direction)
- `imageCoords[1]` is used along **columnCosines** (the vertical/row direction)

The word "row" has two meanings in imaging:
1. **Row index** (which row) — this is the y-coordinate
2. **Row direction** (the direction a row extends) — this is the x/horizontal direction

The hint uses meaning 1 ("row" = y-index), but the implementation uses meaning 2 ("row" = horizontal direction). These are perpendicular, leading to transposed coordinates. The fix:

```ts
// CORRECT — matches the actual implementation
const worldPt = csUtils.imageToWorldCoords(imageId, [xCoord, yCoord])
```

**Lesson:** When working with medical imaging coordinates, always verify conventions empirically with known data points rather than trusting documentation. The row/column/x/y terminology is genuinely ambiguous across the DICOM ecosystem.

### What would I do differently?

- Extract the DICOM SEG loading logic into a shared helper function instead of duplicating it between Task 4 and Bonus A
- Add a visual loading progress bar for long-running operations instead of relying solely on status bar text
- Implement segment visibility toggles in the sidebar panel — I had planned this for Bonus B but prioritised getting the slider and keyboard shortcuts solid first

### Was there anything surprising about the codebase?

The Cornerstone3D API surface is large and the TypeScript types are often `any`-heavy, making it hard to discover available methods through autocomplete. The `wadouri:` loader's lazy metadata loading (metadata only available after image fetch) was an unexpected wrinkle that required pre-loading all images before building the Z-position lookup map.

---

## AI Usage

**Tool used:** Claude Code (Claude Opus) as an AI coding agent throughout the session.

**How it was used:**
- Scaffolding initial implementations for each task handler
- Navigating Cornerstone3D and dcmjs APIs (complex, under-documented TypeScript interfaces)
- Debugging the DICOM SEG bitpacking and binary extraction issues
- Implementing Bonus B keyboard shortcuts and slider

**What the AI got wrong and I had to correct:**

1. **`imageToWorldCoords` parameter order** — The AI followed the task hint literally and used `[yCoord, xCoord]`. I had to investigate the actual Cornerstone3D source to discover the correct order is `[xCoord, yCoord]` because the implementation uses `imageCoords[0]` along rowCosines (horizontal), not as a row index.

2. **Slider UI sync** — The initial slider implementation changed the viewport but didn't update React state for the slice counter. The `STACK_VIEWPORT_SCROLL` event only fires on wheel-based scrolling, not programmatic `setImageIdIndex()`. I identified this during manual testing and added explicit `setInfo()` calls.

3. **SEG PixelData extraction** — The first attempt used `dataset.PixelData` from the naturalized dataset, which was corrupted binary data. It took multiple iterations to find that raw binary must be extracted from `dicomData.dict['7FE00010'].Value[0]` before `naturalizeDataset` corrupts it.

**What I verified and understood independently:**
- Z-position matching logic (`.toFixed(1)` rounding for float comparison)
- PlanarFreehandROI annotation object structure (handles, contour, metadata)
- DICOM SEG per-frame functional group structure for frame-to-slice mapping
- Cornerstone3D segmentation API flow (`addSegmentations` -> `addLabelmapRepresentationToViewport`)
- The difference between `SegmentIdentificationSequence` and `DimensionIndexValues` for segment number extraction
