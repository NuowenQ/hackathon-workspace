# DICOM Annotation Viewer — Implementation Document

**Atomorphic Mini Hackathon**
**Author**: Qian Ning

---

## Table of Contents

1. [Summary of Completed Work](#summary-of-completed-work)
2. [Task 1: Study Selector Panel](#task-1-study-selector-panel)
3. [Task 2: Load Ground Truth Annotations](#task-2-load-ground-truth-annotations)
4. [Task 3: Run AI Segmentation Model](#task-3-run-ai-segmentation-model)
5. [Task 4: Load & Display AI Segmentation](#task-4-load--display-ai-segmentation)
6. [Bonus A: AI-Assisted Segmentation](#bonus-a-ai-assisted-segmentation)
7. [Bonus B: UI Polish & Extra Features](#bonus-b-ui-polish--extra-features)
8. [Key Challenge: The imageToWorldCoords Coordinate Trap](#key-challenge-the-imagetoworldcoords-coordinate-trap)
9. [Thinking Process & AI Usage](#thinking-process--ai-usage)

---

## Summary of Completed Work

| Task | Status | Description |
|------|--------|-------------|
| Task 1 | Complete | Study selector panel with active highlighting |
| Task 2 | Complete | LIDC XML ground truth contours as PlanarFreehandROI overlays |
| Task 3 | Complete | Frontend integration with FastAPI segmentation server |
| Task 4 | Complete | DICOM SEG labelmap overlay with segment panel |
| Bonus A | Complete | One-click AI assist: POST to server + auto-display overlay |
| Bonus B | Complete | Keyboard shortcuts + slice slider with synced UI |

All implementation lives in `src/App.tsx`.

---

## Task 1: Study Selector Panel

### What was built

A clickable list of LIDC studies in the left sidebar panel. Clicking a study loads its CT slices into the viewport.

### Approach

- Iterated over `LIDC_STUDIES` (imported from `./core/loader`) to render a list of study items
- Used `activeStudy` state to track the currently selected study and apply visual highlighting (accent background, white text)
- On click, `handleSelectStudy(caseId)` calls `loadStudy(caseId)` which fetches the CT DICOM slices and loads them into the Cornerstone3D viewport
- A progress callback updates the status bar during loading (`Loading LIDC-IDRI-0001... 45/133`)
- After loading, the viewport jumps to the middle slice and updates the slice counter

### Edge cases considered

- Error handling wraps the entire load in try/catch, showing errors in the status bar
- The `activeStudy` state is set before loading begins, so subsequent tasks (Load GT, Run AI, etc.) can reference it even if loading is still in progress

---

## Task 2: Load Ground Truth Annotations

### What was built

Clicking "Load GT" fetches the LIDC XML annotation file for the active study, parses the radiologist-drawn nodule contours, and renders them as `PlanarFreehandROI` overlays on the correct CT slices.

### Approach

1. **Fetch XML**: Retrieved from `data/<activeStudy>/annotations/<xml>` using the study metadata
2. **Namespace-aware parsing**: The LIDC XML uses `xmlns="http://www.nih.gov"`, so all element queries use `getElementsByTagNameNS(NS, tagName)` — standard `getElementsByTagName` silently returns nothing
3. **Metadata pre-loading**: Called `imageLoader.loadAndCacheImage()` on all image IDs to ensure `ImagePositionPatient` metadata is populated (with `wadouri:`, metadata is only available after the DICOM file is actually fetched)
4. **Z-position matching**: Built a `Map<string, string>` from Z-position (rounded to 1 decimal) to imageId, then matched each XML `<imageZposition>` to the corresponding CT slice
5. **Coordinate conversion**: Converted pixel `(xCoord, yCoord)` from each `<edgeMap>` to world coordinates using `csUtils.imageToWorldCoords(imageId, [xCoord, yCoord])`
6. **Annotation creation**: Constructed `PlanarFreehandROI` annotation objects with closed polylines and added them via `annotation.state.addAnnotation()`
7. **Single-point filtering**: ROIs with fewer than 3 edge points are skipped since they cannot form a meaningful freehand contour

### Coordinate conversion details

See the [dedicated section below](#key-challenge-the-imagetoworldcoords-coordinate-trap) for the full story on how the `imageToWorldCoords` parameter order caused a significant debugging detour.

---

## Task 3: Run AI Segmentation Model

### What was built

Clicking "Run AI" sends a POST request to the locally running FastAPI segmentation server (`localhost:8000/segment`) and stores the returned DICOM SEG file path for Task 4 to display.

### Integration approach

- Chose the HTTP API approach (calling `scripts/segment_server.py`) for clean frontend-backend separation
- The server returns `{ seg_path, status }` — if the SEG file already exists on disk, it returns immediately without re-running TotalSegmentator
- The returned `seg_path` is prefixed with `/` to make it a valid browser-fetchable URL and stored in React state (`segPath`)
- A loading state (`aiRunning`) disables the button and shows "Running..." text to prevent duplicate submissions

### Error handling

- Network errors (server not running) are detected via `Failed to fetch` in the error message and shown as a user-friendly message prompting the user to start the server
- HTTP errors are caught and displayed with the status code and response body

---

## Task 4: Load & Display AI Segmentation

### What was built

Clicking "Show AI Seg" loads a DICOM SEG file and renders it as a coloured labelmap overlay on the CT images. The Segments panel in the right sidebar displays segment names and colours.

### Approach

1. **SEG file source**: Uses the path from Task 3 if available, otherwise falls back to the pre-computed file at `data/<activeStudy>/annotations/<activeStudy>_lung_nodules_seg.dcm`
2. **DICOM SEG parsing with dcmjs**: Used `dcmjs.data.DicomMessage.readFile()` to parse the binary DICOM SEG and `DicomMetaDictionary.naturalizeDataset()` to extract structured metadata
3. **Segment metadata extraction**: Iterated over `SegmentSequence` to get segment numbers, labels, and filtered out "Background" segments that would obscure the CT
4. **Bitpacked pixel data handling**: DICOM SEG stores pixel data as 1-bit-per-pixel bitpacked arrays. Detected bitpacking by comparing buffer size to expected size, then used `dcmjs.data.BitArray.unpack()` to expand to byte-per-pixel. A critical detail: `naturalizeDataset` corrupts binary data, so the raw PixelData was extracted directly from `dicomData.dict['7FE00010']`
5. **Frame-to-slice mapping**: Each SEG frame has per-frame functional groups containing `PlanePositionSequence.ImagePositionPatient` (for Z position) and segment number (via `SegmentIdentificationSequence` or `FrameContentSequence.DimensionIndexValues`). Matched each frame's Z position to the corresponding CT slice
6. **Labelmap creation**: Used `imageLoader.createAndCacheDerivedLabelmapImages(imageIds)` to create derived images, then wrote segment index values into each derived image's scalar data
7. **Cornerstone registration**: Called `segmentationModule.addSegmentations()` and `addLabelmapRepresentationToViewport()` to register and display the labelmap
8. **Colour retrieval**: Read the actual colours from Cornerstone's internal colour LUT (`segmentationModule.state.getColorLUT(0)`) rather than hardcoding, ensuring the sidebar matches what's rendered

### Alignment challenges

The overlay alignment depends on correctly matching the Z coordinate from each SEG frame to the correct CT slice. Using `.toFixed(1)` for Z-position rounding provided robust matching across floating-point precision differences.

---

## Bonus A: AI-Assisted Segmentation

### What was built

A single "AI Assist" button that combines Task 3 (run segmentation) and Task 4 (display overlay) into one click with loading feedback.

### Approach

1. POST to `localhost:8000/segment` with the active study ID
2. While waiting, show "AI Assist: running segmentation..." in the status bar and disable the button
3. On success, immediately fetch and display the returned SEG file as a labelmap overlay (reusing Task 4's logic inline)
4. On failure, show a clear error message distinguishing between network errors and server errors

### UX considerations

- The `aiRunning` state is shared with Task 3's "Run AI" button, preventing concurrent segmentation requests
- The status bar provides step-by-step feedback: "running segmentation..." then "loading segmentation overlay..."
- Button text changes to "Running..." while in flight

---

## Bonus B: UI Polish & Extra Features

### Feature 1: Keyboard Shortcuts

**Implemented in**: `useEffect` hook with `keydown` listener

| Key | Action |
|-----|--------|
| `W` | Switch to Window/Level tool |
| `P` | Switch to Pan tool |
| `Z` | Switch to Zoom tool |
| Arrow Left / Up | Previous slice |
| Arrow Right / Down | Next slice |

Design details:
- Keyboard events are ignored when focus is in an input field (prevents conflicts with text entry)
- Arrow keys call `e.preventDefault()` to prevent page scrolling
- Slice navigation directly calls `vp.setImageIdIndex()` and updates the `info` state for immediate UI feedback

### Feature 2: Slice Slider

**Implemented in**: Range input below the viewport

- An `<input type="range">` element spans the full width beneath the viewport
- Min is 0, max is the total number of slices minus 1
- The slider value is synced bidirectionally with the current slice index:
  - Moving the slider updates the viewport and the slice counter
  - Scrolling with the mouse wheel or keyboard updates the slider position
- The slider is only rendered when images are loaded (`ready && getImageIds().length > 0`)

### Bug fix: UI sync for programmatic slice changes

The original `STACK_VIEWPORT_SCROLL` event listener only fires on mouse wheel scrolling. When the slice is changed programmatically (via the slider or keyboard shortcuts), the slice counter in the Image Info panel would not update. This was fixed by explicitly calling `setInfo()` in both `handleSliderChange` and the keyboard arrow key handlers to keep the displayed slice number in sync.

---

## Key Challenge: The imageToWorldCoords Coordinate Trap

### The problem

This was the single most time-consuming debugging challenge in the entire hackathon. The task description in `HACKATHON_TASKS.md` states:

> There is a utility in `@cornerstonejs/core` that converts image pixel coordinates to world coordinates. Its signature is `(imageId, [row, col])` — note the order: row first, then column (i.e. `[yCoord, xCoord]` from the LIDC `<edgeMap>`).

This led to the initial implementation using `[yCoord, xCoord]` order:

```ts
const worldPt = csUtils.imageToWorldCoords(imageId, [yCoord, xCoord])
```

### What actually happened

The contours rendered incorrectly — they appeared mirrored or offset from the actual nodule locations. After extensive debugging (inspecting raw coordinate values, comparing against the XML data, checking slice matching), the issue was traced to the parameter order.

### The root cause

Despite the documentation suggesting `[row, col]` = `[yCoord, xCoord]`, the actual Cornerstone3D `imageToWorldCoords` implementation interprets its second parameter as:
- `imageCoords[0]` is used along **rowCosines** (the horizontal/column direction)
- `imageCoords[1]` is used along **columnCosines** (the vertical/row direction)

In standard image conventions:
- **Row direction** = horizontal = corresponds to the **x/column** pixel coordinate
- **Column direction** = vertical = corresponds to the **y/row** pixel coordinate

So the correct call is actually `[xCoord, yCoord]`:

```ts
const worldPt = csUtils.imageToWorldCoords(imageId, [xCoord, yCoord])
```

### Why this was misleading

The hint says the signature is `(imageId, [row, col])` and to pass `[yCoord, xCoord]`. The word "row" in imaging has two common meanings:
1. **Row index** (which row of the image) — this is the y-coordinate
2. **Row direction/cosine** (the direction along a row) — this is the x/horizontal direction

The hint uses meaning 1 ("row" = y-index), but the implementation uses meaning 2 ("row" = the direction a row extends, i.e. horizontal = x). These are perpendicular to each other, leading to transposed coordinates.

### The fix

Changed from `[yCoord, xCoord]` to `[xCoord, yCoord]`:

```ts
// WRONG (from misleading hint):
const worldPt = csUtils.imageToWorldCoords(imageId, [yCoord, xCoord])

// CORRECT (matches actual implementation):
const worldPt = csUtils.imageToWorldCoords(imageId, [xCoord, yCoord])
```

### Lesson learned

When working with medical imaging coordinate systems, always verify coordinate conventions empirically by testing with known data points, rather than relying solely on documentation. The interplay between image space (row/column), pixel space (x/y), and world space (mm) creates multiple opportunities for transposition errors, especially when documentation is ambiguous about which "row" convention it means.

---

## Thinking Process & AI Usage

### Overall strategy

1. **Started with Task 1** as recommended — it unlocks all subsequent tasks by providing the `activeStudy` context
2. **Tackled tasks sequentially** (1 -> 2 -> 3 -> 4 -> Bonus A -> Bonus B) since each builds on the previous
3. **Used pre-computed files** for Task 4 development to avoid waiting for TotalSegmentator to run

### AI agent usage

The AI agent (Claude Code) was used throughout for:
- Scaffolding the initial implementation of each task handler
- Navigating the Cornerstone3D and dcmjs APIs (these libraries have complex, poorly-documented TypeScript interfaces)
- Debugging the DICOM SEG bitpacking issue (the agent identified that `naturalizeDataset` corrupts binary data)
- Implementing the Bonus B keyboard shortcuts and slider

### What the AI got wrong

1. **The `imageToWorldCoords` parameter order** — The AI initially followed the task hint literally and used `[yCoord, xCoord]`. This produced contours that were visually wrong. I had to investigate the actual Cornerstone3D source code to discover the implementation uses `imageCoords[0]` along rowCosines (horizontal), making the correct order `[xCoord, yCoord]`. This is documented in detail in the section above.

2. **Slider UI sync** — The AI's initial slice slider implementation changed the viewport but didn't update the React state for the slice counter display. The `STACK_VIEWPORT_SCROLL` event only fires on wheel-based scrolling, not on programmatic `setImageIdIndex()` calls. I identified this issue during testing and the fix was straightforward: add `setInfo()` calls in both the slider handler and keyboard handlers.

3. **SEG PixelData extraction** — The AI's first attempt used `dataset.PixelData` from the naturalized dataset, which was corrupted. It took iterating through multiple fallback strategies to find that the raw binary must be extracted from `dicomData.dict['7FE00010'].Value[0]` before naturalization mangles it.

### What I verified and understood

- The Z-position matching logic (`.toFixed(1)` rounding for float comparison)
- The PlanarFreehandROI annotation object structure (handles, contour, metadata)
- The DICOM SEG per-frame functional group structure for frame-to-slice mapping
- The Cornerstone3D segmentation API flow (addSegmentations -> addLabelmapRepresentationToViewport)
- The difference between `SegmentIdentificationSequence` and `DimensionIndexValues` for segment number extraction
