from sqlalchemy import Column, Integer, DateTime, Float, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Progress(Base):
    __tablename__ = "progress"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completion_pct = Column(Float, default=0.0, nullable=False)
    total_points = Column(Float, default=0.0, nullable=False)
    earned_points = Column(Float, default=0.0, nullable=False)

    # Relationships
    student = relationship("User", back_populates="progress")
    unit = relationship("Unit", back_populates="progress")

    @property
    def is_completed(self) -> bool:
        return self.completed_at is not None

    @property
    def score_percentage(self) -> float:
        if self.total_points == 0:
            return 0.0
        return (self.earned_points / self.total_points) * 100

    @property
    def duration_hours(self) -> float:
        if not self.completed_at:
            return 0.0
        return (self.completed_at - self.started_at).total_seconds() / 3600
