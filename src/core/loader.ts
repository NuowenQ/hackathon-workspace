// =============================================================================
// DICOM Loading
// =============================================================================

import { type Types } from '@cornerstonejs/core'
import * as dicomLoader from '@cornerstonejs/dicom-image-loader'
import { getRenderingEngine, VIEWPORT_ID } from './init'

let imageIds: string[] = []

export function getImageIds() { return imageIds }

// Load File objects into the viewport.
// onProgress(loaded, total) is called with progress updates.
// Returns the number of images loaded (0 if none).
export async function loadDicomFiles(
  files: File[],
  onProgress?: (loaded: number, total: number) => void
): Promise<number> {
  if (files.length === 0) return 0

  imageIds = []
  for (const file of files) {
    if (file.name.endsWith('.dcm') || !file.name.includes('.')) {
      const id = dicomLoader.wadouri.fileManager.add(file)
      imageIds.push(id)
    }
  }

  if (imageIds.length === 0) return 0

  const re = getRenderingEngine()
  const vp = re.getViewport(VIEWPORT_ID) as Types.IStackViewport
  const mid = Math.floor(imageIds.length / 2)

  onProgress?.(0, imageIds.length)
  await vp.setStack(imageIds, mid)
  vp.render()
  onProgress?.(imageIds.length, imageIds.length)

  return imageIds.length
}

// Load sample DICOM data from public/data/ using manifest.json.
// Returns the number of images loaded (0 if unavailable).
export async function loadSampleData(
  onProgress?: (loaded: number, total: number) => void
): Promise<number> {
  try {
    const response = await fetch('/data/manifest.json')
    if (!response.ok) return 0

    const manifest = await response.json()
    if (!manifest.files || manifest.files.length === 0) return 0

    imageIds = manifest.files.map((f: string) => `wadouri:/data/sample_dicom/${f}`)

    const re = getRenderingEngine()
    const vp = re.getViewport(VIEWPORT_ID) as Types.IStackViewport
    const mid = Math.floor(imageIds.length / 2)

    onProgress?.(0, imageIds.length)
    await vp.setStack(imageIds, mid)
    vp.render()
    onProgress?.(imageIds.length, imageIds.length)

    return imageIds.length
  } catch {
    return 0
  }
}
