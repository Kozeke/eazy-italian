#!/usr/bin/env python3
"""
Script to generate thumbnails for existing courses that don't have thumbnails
Run this script to create default thumbnails for all existing courses based on their level
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.course import Course
from app.utils.thumbnail_generator import generate_course_thumbnail, get_course_thumbnail_path

def generate_thumbnails_for_existing_courses():
    """Generate thumbnails for all courses that don't have one or have missing files"""
    db: Session = SessionLocal()
    
    try:
        # Get project root (parent of backend directory)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Get all courses
        all_courses = db.query(Course).all()
        
        courses_to_process = []
        for course in all_courses:
            if not course.thumbnail_path or course.thumbnail_path == '':
                courses_to_process.append(course)
            else:
                # Check if file actually exists
                full_path = os.path.join(project_root, "uploads", course.thumbnail_path)
                if not os.path.exists(full_path):
                    print(f"[INFO] Course {course.id} has path but file missing: {course.thumbnail_path}")
                    courses_to_process.append(course)
        
        if not courses_to_process:
            print("[OK] All courses already have thumbnails!")
            return
        
        print(f"[INFO] Found {len(courses_to_process)} courses without thumbnails")
        print("[INFO] Generating thumbnails...\n")
        
        success_count = 0
        error_count = 0
        
        for course in courses_to_process:
            try:
                if not course.level:
                    print(f"[WARN] Course {course.id} ({course.title[:50]}...): No level found, skipping")
                    error_count += 1
                    continue
                
                # Get level - handle mixed level
                level = course.level.value if hasattr(course.level, 'value') else str(course.level)
                if level == 'mixed':
                    level = 'A1'  # Default for mixed
                
                # Generate thumbnail path (relative to uploads/)
                thumbnail_path = get_course_thumbnail_path(course.id, level)
                # Full path includes uploads/ directory
                full_path = os.path.join(project_root, "uploads", thumbnail_path)
                
                # Generate subtitle from description if available
                subtitle = course.description[:50] if course.description else ""
                
                # Generate the thumbnail
                generate_course_thumbnail(
                    level=level,
                    output_path=full_path,
                    title=course.title,
                    subtitle=subtitle
                )
                
                # Update course record
                course.thumbnail_path = thumbnail_path
                db.commit()
                
                print(f"[OK] Course {course.id} ({course.title[:50]}...): Generated {thumbnail_path}")
                success_count += 1
                
            except Exception as e:
                print(f"[ERROR] Course {course.id} ({course.title[:50]}...): Error - {str(e)}")
                error_count += 1
                db.rollback()
                import traceback
                traceback.print_exc()
        
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
    print("Course Thumbnail Generator")
    print("=" * 50)
    generate_thumbnails_for_existing_courses()
    print("=" * 50)
    print("Done!")
