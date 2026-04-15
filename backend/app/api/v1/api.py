from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, units, videos, tasks, tests, progress, email_campaigns, grades, admin_students, courses, test_constructor, notifications, ingest, rag
from app.api.v1.endpoints import admin_videos, admin_tasks, admin_tests, segments
from app.api.v1.endpoints.student import tests as student_tests
from app.api.v1.endpoints.student import classroom as student_classroom
from app.api.v1.endpoints.student import grades as student_grades
from app.api.v1.endpoints.generate_test import router as generate_test_router
from app.api.v1.endpoints.generate_task import router as generate_task_router
from app.api.v1.endpoints import analytics
from app.api.v1.endpoints import exercise_generation, exercise_from_file
from app.api.v1.endpoints import course_generation
from app.api.v1.endpoints import slide_generation
from app.api.v1.endpoints.presentations import router as presentations_router
from app.api.v1.endpoints import classrooms
from app.api.v1.endpoints import websocket
from app.api.v1.endpoints.homework import router as homework_router
from app.api.v1.endpoints import unit_generation
from app.api.v1.endpoints import presence, live   # add live
from app.api.v1.endpoints import presence_rest


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
api_router.include_router(admin_videos.router, prefix="/admin", tags=["admin-videos"])
api_router.include_router(admin_tasks.router, prefix="/admin", tags=["admin-tasks"])
api_router.include_router(admin_tests.router, prefix="/admin", tags=["admin-tests"])
api_router.include_router(segments.router, prefix="", tags=["segments"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["RAG · Ingestion"])
api_router.include_router(rag.router, prefix="/rag", tags=["RAG · Q&A"])
api_router.include_router(generate_test_router, tags=["AI Test Generation"])
api_router.include_router(generate_task_router, tags=["AI Task Generation"])
api_router.include_router(course_generation.router, prefix="/course-builder", tags=["Course Builder"])
api_router.include_router(slide_generation.router, prefix="/ai", tags=["AI Slide Generation"])
api_router.include_router(presentations_router, tags=["Presentations"])
api_router.include_router(classrooms.router, prefix="", tags=["Classrooms"])
api_router.include_router(websocket.router, tags=["WebSocket"])
#student routes
api_router.include_router(student_tests.router, prefix="/student/tests", tags=["Student Tests"])
api_router.include_router(student_classroom.router, prefix="/student", tags=["Student"])
api_router.include_router(student_grades.router, prefix="/student", tags=["Student"])
api_router.include_router(analytics.router)
api_router.include_router(exercise_generation.router, tags=["exercise-generation"])
api_router.include_router(homework_router, prefix="", tags=["Homework"])
api_router.include_router(unit_generation.router, prefix="/units", tags=["AI Unit Generation"])
api_router.include_router(presence_rest.router, prefix="", tags=["Presence"])
api_router.include_router(presence.router, tags=["Presence"])           # ← ADD
api_router.include_router(live.router, tags=["live"])  # ← ADD THIS
