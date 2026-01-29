# Create this file as: backend/app/models/video_progress.py

from sqlalchemy import Column, Integer, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class VideoProgress(Base):
    """
    Track user progress on videos.
    Only tracks uploaded videos (source_type='file'), not external URLs.
    """
    __tablename__ = "video_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    
    # Progress tracking
    watched_percentage = Column(Float, default=0.0, nullable=False)  # 0-100
    progress_percent = Column(Float, default=0.0, nullable=False)  # 0-100 (duplicate of watched_percentage for compatibility)
    last_position_sec = Column(Float, default=0.0, nullable=False)  # Last watched position in seconds
    watch_time_sec = Column(Float, default=0.0, nullable=False)  # Total watch time in seconds (cumulative)
    completed = Column(Boolean, default=False, nullable=False)  # Marked complete when 90%+ watched
    is_completed = Column(Boolean, default=False, nullable=False)  # Duplicate of completed for compatibility
    
    # Timestamps
    first_watched_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_watched_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)  # When video was marked as completed
    
    # Relationships
    user = relationship("User", back_populates="video_progress")
    video = relationship("Video", back_populates="user_progress")
    
    # Ensure one progress record per user per video
    __table_args__ = (
        UniqueConstraint('user_id', 'video_id', name='unique_user_video_progress'),
    )
    
    def __repr__(self):
        return f"<VideoProgress user_id={self.user_id} video_id={self.video_id} progress={self.watched_percentage}%>"