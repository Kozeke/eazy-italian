"""
Course schemas for API requests and responses
"""
from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.course import CourseLevel, CourseStatus

class CourseBase(BaseModel):
    """Base course schema with common fields"""
    title: str
    description: Optional[str] = None
    level: CourseLevel
    status: CourseStatus = CourseStatus.DRAFT
    publish_at: Optional[datetime] = None
    order_index: int = 0
    thumbnail_url: Optional[str] = None
    thumbnail_path: Optional[str] = None
    duration_hours: Optional[int] = None
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    is_visible_to_students: bool = False
    settings: Optional[Dict[str, Any]] = None

class CourseCreate(CourseBase):
    """Schema for creating a new course"""
    @validator('publish_at')
    def validate_publish_at(cls, v, values):
        """Validate publish date for scheduled courses"""
        if values.get('status') == CourseStatus.SCHEDULED and not v:
            raise ValueError('Publish date is required when status is scheduled')
        if v:
            # Make both datetimes timezone-naive for comparison
            now = datetime.utcnow()
            v_naive = v.replace(tzinfo=None) if v.tzinfo else v
            if v_naive <= now:
                raise ValueError('Publish date must be in the future')
        return v

class CourseUpdate(BaseModel):
    """Schema for updating a course"""
    title: Optional[str] = None
    description: Optional[str] = None
    level: Optional[CourseLevel] = None
    status: Optional[CourseStatus] = None
    publish_at: Optional[datetime] = None
    order_index: Optional[int] = None
    thumbnail_url: Optional[str] = None
    thumbnail_path: Optional[str] = None
    duration_hours: Optional[int] = None
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    is_visible_to_students: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None

class CourseSummary(BaseModel):
    """Summary of course content"""
    units: int
    published_units: int
    videos: int
    published_videos: int
    tasks: int
    published_tasks: int
    tests: int
    published_tests: int

class CourseResponse(CourseBase):
    """Full course response schema"""
    id: int
    slug: Optional[str] = None
    thumbnail_path: Optional[str] = None
    created_by: int
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    units_count: int = 0
    published_units_count: int = 0
    content_summary: Optional[CourseSummary] = None

    class Config:
        from_attributes = True

class CourseListResponse(BaseModel):
    """Simplified course response for list views"""
    id: int
    title: str
    description: Optional[str] = None
    level: CourseLevel
    status: CourseStatus
    publish_at: Optional[datetime] = None
    order_index: int
    thumbnail_url: Optional[str] = None
    thumbnail_path: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    units_count: int = 0
    published_units_count: int = 0
    content_summary: Optional[CourseSummary] = None
    enrolled_students_count: Optional[int] = 0  # Number of students enrolled in this course
    is_enrolled: Optional[bool] = False  # Whether the current user is enrolled
    user_subscription: Optional[str] = None  # User's subscription type: 'free', 'premium', 'pro'
    enrolled_courses_count: Optional[int] = 0  # Total courses the user is enrolled in

    class Config:
        from_attributes = True

class CourseDetailResponse(CourseResponse):
    """Detailed course response with units"""
    units: List[Dict[str, Any]] = []  # Will contain unit summaries
    instructor_name: Optional[str] = None  # Name of the course instructor
    is_enrolled: Optional[bool] = False  # Whether the current user is enrolled
    user_subscription: Optional[str] = None  # User's subscription type: 'free', 'premium', 'pro'
    enrolled_courses_count: Optional[int] = 0  # Total courses the user is enrolled in
    learning_outcomes: Optional[List[str]] = None  # Learning outcomes (from settings or unit goals)

    class Config:
        from_attributes = True

class CourseReorderRequest(BaseModel):
    """Request schema for reordering courses"""
    course_ids: List[int]

class CoursePublishRequest(BaseModel):
    """Request schema for publishing a course"""
    publish_at: Optional[datetime] = None

class CourseBulkAction(BaseModel):
    """Schema for bulk actions on courses"""
    course_ids: List[int]
    action: str  # 'publish', 'archive', 'delete', etc.

class DashboardStatistics(BaseModel):
    """Dashboard statistics for admin panel - Course-level overview"""
    courses_count: int
    units_count: int
    videos_count: int
    tests_count: int
    students_count: int
    courses_this_month: int
    units_this_month: int
    videos_this_month: int
    tests_this_month: int
    students_this_month: int
    course_progress: List[Dict[str, Any]]  # Course-level aggregated progress
    students_progress: List[Dict[str, Any]]  # Student-level aggregated progress (overview)
    at_risk_students: List[Dict[str, Any]]  # Students with low completion or scores
    drop_off_points: List[Dict[str, Any]]  # Units/tests where students drop off
    recent_activity: List[Dict[str, Any]]  # Recent activity data

class StudentDashboardStats(BaseModel):
    """Dashboard statistics for student panel"""
    my_courses_count: int
    completed_units: int
    average_score: float
    time_spent_hours: float
    recent_activity: List[Dict[str, Any]]
    upcoming_deadlines: List[Dict[str, Any]]
    recommended_courses: List[Dict[str, Any]]
    last_activity: Optional[Dict[str, Any]] = None
    latest_video_watched: Optional[Dict[str, Any]] = None  # Latest video watched with unit and course info
    active_course_progress: Optional[Dict[str, Any]] = None  # Progress on the most recently accessed course

class EnrolledCourseResponse(BaseModel):
    """Enrolled course with progress information"""
    id: int
    title: str
    description: Optional[str] = None
    level: CourseLevel
    thumbnail_url: Optional[str] = None
    thumbnail_path: Optional[str] = None
    units_count: int = 0
    published_units_count: int = 0
    progress_percent: float = 0.0  # Overall course progress percentage
    completed_units: int = 0  # Number of completed units
    last_accessed_at: Optional[datetime] = None  # Last time student accessed this course
