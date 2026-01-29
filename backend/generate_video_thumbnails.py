#!/usr/bin/env python3
"""
Script to generate thumbnails for existing videos that don't have thumbnails
Run this script to create default thumbnails for all existing videos based on their unit level
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.video import Video
from app.models.unit import Unit
from app.utils.thumbnail_generator import generate_default_thumbnail, get_thumbnail_path

def generate_thumbnails_for_existing_videos():
    """Generate thumbnails for all videos that don't have one or have missing files"""
    db: Session = SessionLocal()
    
    try:
        # Get project root (parent of backend directory)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Get all videos with units that have levels
        all_videos = db.query(Video).join(Unit).filter(Unit.level.isnot(None)).all()
        
        videos_to_process = []
        for video in all_videos:
            if not video.thumbnail_path or video.thumbnail_path == '':
                videos_to_process.append(video)
            else:
                # Check if file actually exists
                full_path = os.path.join(project_root, "uploads", video.thumbnail_path)
                if not os.path.exists(full_path):
                    print(f"[INFO] Video {video.id} has path but file missing: {video.thumbnail_path}")
                    videos_to_process.append(video)
        
        if not videos_to_process:
            print("[OK] All videos already have thumbnails!")
            return
        
        print(f"[INFO] Found {len(videos_to_process)} videos without thumbnails")
        print("[INFO] Generating thumbnails...\n")
        
        success_count = 0
        error_count = 0
        
        for video in videos_to_process:
            try:
                if not video.unit or not video.unit.level:
                    print(f"[WARN] Video {video.id} ({video.title[:50]}...): No unit or level found, skipping")
                    error_count += 1
                    continue
                
                # Generate thumbnail path (relative to uploads/)
                thumbnail_path = get_thumbnail_path(video.id, video.unit.level)
                # Full path includes uploads/ directory
                full_path = os.path.join(project_root, "uploads", thumbnail_path)
                
                # Generate the thumbnail
                generate_default_thumbnail(
                    level=video.unit.level,
                    output_path=full_path,
                    title=video.title
                )
                
                # Update video record
                video.thumbnail_path = thumbnail_path
                db.commit()
                
                print(f"[OK] Video {video.id} ({video.title[:50]}...): Generated {thumbnail_path}")
                success_count += 1
                
            except Exception as e:
                print(f"[ERROR] Video {video.id} ({video.title[:50]}...): Error - {str(e)}")
                error_count += 1
                db.rollback()
        
        print(f"\n[SUMMARY]")
        print(f"   Successfully generated: {success_count}")
        print(f"   Errors: {error_count}")
        print(f"   Thumbnails saved to: uploads/thumbnails/")
        
    except Exception as e:
        print(f"[FATAL ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    import io
    # Set UTF-8 encoding for Windows console
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    print("Video Thumbnail Generator")
    print("=" * 50)
    generate_thumbnails_for_existing_videos()
    print("=" * 50)
    print("Done!")
