#!/usr/bin/env python3
"""
DICOM to NIfTI Converter
========================
Converts a directory of DICOM files to a single NIfTI file.
Used to prepare input for TotalSegmentator.

Usage:
    python dicom_to_nifti.py <dicom_dir> <output_nifti>

Example:
    python dicom_to_nifti.py ./data/sample_dicom ./data/input.nii.gz

Requirements:
    pip install SimpleITK
"""

import sys
from pathlib import Path

try:
    import SimpleITK as sitk
except ImportError:
    print("ERROR: SimpleITK not installed. Run: pip install SimpleITK")
    sys.exit(1)


def dicom_to_nifti(dicom_dir: str, output_path: str) -> bool:
    """
    Convert a directory of DICOM files to NIfTI format.
    
    Args:
        dicom_dir: Path to directory containing DICOM files
        output_path: Output NIfTI file path (e.g., output.nii.gz)
        
    Returns:
        True if successful, False otherwise
    """
    dicom_path = Path(dicom_dir)
    
    if not dicom_path.exists():
        print(f"ERROR: Directory not found: {dicom_dir}")
        return False
    
    # Find DICOM files
    dicom_files = list(dicom_path.glob("*.dcm"))
    if not dicom_files:
        # Try files without extension (common in DICOM)
        dicom_files = [f for f in dicom_path.iterdir() 
                       if f.is_file() and not f.suffix]
    
    if not dicom_files:
        print(f"ERROR: No DICOM files found in {dicom_dir}")
        return False
    
    print(f"Found {len(dicom_files)} DICOM files")
    
    # Read DICOM series
    reader = sitk.ImageSeriesReader()
    
    # Get series IDs
    series_ids = reader.GetGDCMSeriesIDs(str(dicom_path))
    
    if not series_ids:
        print("ERROR: No valid DICOM series found")
        return False
    
    print(f"Found {len(series_ids)} series")
    
    # Use the first series (or the one with most files)
    series_id = series_ids[0]
    file_names = reader.GetGDCMSeriesFileNames(str(dicom_path), series_id)
    
    print(f"Reading series with {len(file_names)} slices...")
    
    reader.SetFileNames(file_names)
    
    # Read the image
    try:
        image = reader.Execute()
    except Exception as e:
        print(f"ERROR: Failed to read DICOM series: {e}")
        return False
    
    # Print image info
    print(f"Image size: {image.GetSize()}")
    print(f"Image spacing: {image.GetSpacing()}")
    print(f"Image origin: {image.GetOrigin()}")
    print(f"Image direction: {image.GetDirection()}")
    
    # Write NIfTI
    print(f"Writing to {output_path}...")
    
    try:
        sitk.WriteImage(image, output_path)
        print("SUCCESS: NIfTI file created")
        return True
    except Exception as e:
        print(f"ERROR: Failed to write NIfTI: {e}")
        return False


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    
    dicom_dir = sys.argv[1]
    output_path = sys.argv[2]
    
    success = dicom_to_nifti(dicom_dir, output_path)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
