#!/usr/bin/env python3
"""
Script to fix thumbnail paths in the database
Removes 'uploads/' prefix from thumbnail_path since static files are served from uploads/ directory
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.video import Video

def fix_thumbnail_paths():
    """Fix thumbnail paths by removing 'uploads/' prefix"""
    db: Session = SessionLocal()
    
    try:
        # Get all videos with thumbnails that start with 'uploads/'
        videos = db.query(Video).filter(
            Video.thumbnail_path.isnot(None),
            Video.thumbnail_path != '',
            Video.thumbnail_path.like('uploads/%')
        ).all()
        
        if not videos:
            print("✅ No videos with incorrect thumbnail paths found!")
            return
        
        print(f"🔧 Found {len(videos)} videos with paths to fix")
        print("🔄 Fixing thumbnail paths...\n")
        
        fixed_count = 0
        
        for video in videos:
            try:
                # Remove 'uploads/' prefix
                old_path = video.thumbnail_path
                new_path = video.thumbnail_path.replace('uploads/', '', 1) if video.thumbnail_path.startswith('uploads/') else video.thumbnail_path
                
                video.thumbnail_path = new_path
                db.commit()
                
                print(f"✅ Video {video.id}: {old_path} → {new_path}")
                fixed_count += 1
                
            except Exception as e:
                print(f"❌ Video {video.id}: Error - {str(e)}")
                db.rollback()
        
        print(f"\n📊 Summary:")
        print(f"   ✅ Fixed: {fixed_count}")
        print(f"   📁 Paths are now relative to uploads/ directory")
        
    except Exception as e:
        print(f"❌ Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("🔧 Thumbnail Path Fixer")
    print("=" * 50)
    fix_thumbnail_paths()
    print("=" * 50)
    print("✨ Done!")
