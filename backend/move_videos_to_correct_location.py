#!/usr/bin/env python3
"""
Script to move video files from backend/app/uploads to project root uploads/
This fixes the path issue where videos were saved to the wrong location.
"""
import os
import shutil
import sys

# Get the backend directory (where this script is located)
backend_dir = os.path.dirname(os.path.abspath(__file__))
# Get project root (parent of backend)
project_root = os.path.dirname(backend_dir)

# Old location: backend/app/uploads/videos/
old_videos_dir = os.path.join(backend_dir, "app", "uploads", "videos")

# New location: uploads/videos/ (at project root)
new_videos_dir = os.path.join(project_root, "uploads", "videos")

print(f"Backend directory: {backend_dir}")
print(f"Project root: {project_root}")
print(f"Old videos directory: {old_videos_dir}")
print(f"New videos directory: {new_videos_dir}")
print()

if not os.path.exists(old_videos_dir):
    print("[OK] No videos found in old location. Nothing to move.")
    sys.exit(0)

# Create new directory if it doesn't exist
os.makedirs(new_videos_dir, exist_ok=True)

# Move all user directories and files
moved_count = 0
for item in os.listdir(old_videos_dir):
    old_path = os.path.join(old_videos_dir, item)
    new_path = os.path.join(new_videos_dir, item)
    
    if os.path.isdir(old_path):
        # Move entire directory
        if os.path.exists(new_path):
            print(f"[WARN] Directory {item} already exists in new location. Merging...")
            # Move files from old to new
            for file_item in os.listdir(old_path):
                old_file = os.path.join(old_path, file_item)
                new_file = os.path.join(new_path, file_item)
                if not os.path.exists(new_file):
                    shutil.move(old_file, new_file)
                    print(f"  [OK] Moved {file_item}")
                else:
                    print(f"  [SKIP] Skipped {file_item} (already exists)")
            # Remove old directory if empty
            try:
                os.rmdir(old_path)
            except OSError:
                pass
        else:
            shutil.move(old_path, new_path)
            print(f"[OK] Moved directory: {item}")
        moved_count += 1
    else:
        # Move file
        if os.path.exists(new_path):
            print(f"[WARN] File {item} already exists in new location. Skipping...")
        else:
            shutil.move(old_path, new_path)
            print(f"[OK] Moved file: {item}")
            moved_count += 1

print()
print(f"[SUMMARY] Moved {moved_count} items")
print(f"[OK] Videos are now in the correct location: {new_videos_dir}")

# Try to remove old directory if empty
try:
    old_uploads_dir = os.path.join(backend_dir, "app", "uploads")
    if os.path.exists(old_uploads_dir):
        # Check if directory is empty
        if not os.listdir(old_uploads_dir):
            os.rmdir(old_uploads_dir)
            print(f"[OK] Removed empty old uploads directory")
        else:
            print(f"[INFO] Old uploads directory still contains files, not removing")
except Exception as e:
    print(f"[WARN] Could not remove old directory: {e}")

print()
print("[OK] Migration complete!")
