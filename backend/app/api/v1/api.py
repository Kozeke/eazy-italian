from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, units, videos, tasks, tests, progress, email_campaigns, grades, admin_students, courses, test_constructor, notifications
from app.api.v1.endpoints.student import tests as student_tests
api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(courses.router, prefix="", tags=["courses"])
api_router.include_router(units.router, prefix="/units", tags=["units"])
api_router.include_router(videos.router, prefix="/videos", tags=["videos"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(tests.router, prefix="/tests", tags=["tests"])
api_router.include_router(test_constructor.router, tags=["test-constructor"])
api_router.include_router(progress.router, prefix="/progress", tags=["progress"])
api_router.include_router(grades.router, prefix="/grades", tags=["grades"])
api_router.include_router(email_campaigns.router, prefix="/email-campaigns", tags=["email-campaigns"])
api_router.include_router(admin_students.router, prefix="/admin/students", tags=["students"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])

#student routes
api_router.include_router(student_tests.router, prefix="/student/tests", tags=["Student Tests"])
