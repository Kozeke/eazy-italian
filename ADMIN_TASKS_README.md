# Admin Tasks Management System

## Overview

The Admin Tasks Management System provides comprehensive functionality for teachers to create, manage, and grade assignments in the Italian learning platform. The system supports both manual and auto-gradable tasks with various question types.

## Features Implemented

### 🎯 Core Functionality

#### 1. Task Management
- **Create Tasks**: Comprehensive form with all required fields
- **Edit Tasks**: Full editing capabilities with auto-save
- **List Tasks**: Advanced filtering, sorting, and search
- **Delete Tasks**: Safe deletion with validation
- **Bulk Operations**: Publish, unpublish, archive, duplicate multiple tasks

#### 2. Task Types
- **Manual Grading**: Open response, file upload, audio response
- **Auto-gradable**:
  - Single Choice Questions (SCQ)
  - Multiple Choice Questions (MCQ)
  - Matching exercises
  - Ordering exercises
  - Gap-fill exercises
  - Short answer questions
  - Numeric questions

#### 3. Assignment & Scheduling
- **Unit Assignment**: Attach tasks to specific units or keep standalone
- **Student Assignment**: Assign to all students, specific cohorts, or individual students
- **Due Dates**: Set deadlines with late submission penalties
- **Publishing**: Draft, scheduled, published, or archived status
- **Attempt Limits**: Set maximum attempts or unlimited

#### 4. Grading System
- **Manual Grading**: Rich text feedback with scoring
- **Auto-grading**: Automatic scoring based on configured answers
- **Late Penalties**: Configurable percentage penalties
- **Rubrics**: Support for detailed grading criteria
- **Feedback**: Rich text feedback with formatting options

#### 5. Analytics & Reporting
- **Submission Statistics**: Total, submitted, graded, pending counts
- **Score Distribution**: Visual representation of performance
- **Completion Rates**: Track student engagement
- **Time Analytics**: Average time spent on tasks

## Technical Implementation

### Backend API Endpoints

#### Task Management
```
GET    /admin/tasks                    # List tasks with filtering
POST   /admin/tasks                    # Create new task
GET    /admin/tasks/{id}               # Get task details
PUT    /admin/tasks/{id}               # Update task
DELETE /admin/tasks/{id}               # Delete task
POST   /admin/tasks/bulk-action        # Bulk operations
POST   /admin/tasks/bulk-assign        # Bulk assignment
```

#### Submissions Management
```
GET    /admin/tasks/{id}/submissions           # List submissions
GET    /admin/tasks/{id}/submissions/{sub_id}  # Get submission details
POST   /admin/tasks/{id}/submissions/{sub_id}/grade  # Grade submission
GET    /admin/tasks/{id}/statistics            # Task statistics
```

#### Student Endpoints
```
GET    /tasks                    # List available tasks
GET    /tasks/{id}               # Get task details
POST   /tasks/{id}/submit        # Submit task
```

### Frontend Components

#### Core Components
- `TaskForm.tsx`: Comprehensive task creation/editing form
- `RichTextEditor.tsx`: Rich text editor for instructions and feedback
- `AdminTasksPage.tsx`: Task listing with advanced filtering
- `AdminTaskDetailPage.tsx`: Task details with analytics
- `AdminTaskSubmissionsPage.tsx`: Submissions management
- `AdminTaskGradingPage.tsx`: Individual submission grading

#### Pages
- `/admin/tasks` - Task list
- `/admin/tasks/new` - Create task
- `/admin/tasks/:id` - Task details
- `/admin/tasks/:id/edit` - Edit task
- `/admin/tasks/:id/submissions` - View submissions
- `/admin/tasks/:id/submissions/:submissionId` - Grade submission

### Database Schema

#### Tasks Table
```sql
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    unit_id INTEGER REFERENCES units(id),
    title VARCHAR NOT NULL,
    description TEXT,
    instructions TEXT,
    type VARCHAR NOT NULL, -- 'manual', 'auto', 'practice', 'writing'
    auto_task_type VARCHAR, -- For auto-gradable tasks
    status VARCHAR NOT NULL DEFAULT 'draft',
    max_score FLOAT DEFAULT 100.0,
    due_at TIMESTAMP,
    allow_late_submissions BOOLEAN DEFAULT FALSE,
    late_penalty_percent FLOAT DEFAULT 0.0,
    max_attempts INTEGER,
    order_index INTEGER DEFAULT 0,
    attachments JSON DEFAULT '[]',
    rubric JSON DEFAULT '{}',
    auto_check_config JSON DEFAULT '{}',
    assign_to_all BOOLEAN DEFAULT FALSE,
    assigned_cohorts JSON DEFAULT '[]',
    assigned_students JSON DEFAULT '[]',
    send_assignment_email BOOLEAN DEFAULT FALSE,
    reminder_days_before INTEGER,
    send_results_email BOOLEAN DEFAULT FALSE,
    send_teacher_copy BOOLEAN DEFAULT FALSE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);
```

#### Task Submissions Table
```sql
CREATE TABLE task_submissions (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id),
    student_id INTEGER REFERENCES users(id),
    answers JSON DEFAULT '{}',
    attachments JSON DEFAULT '[]',
    submitted_at TIMESTAMP,
    graded_at TIMESTAMP,
    grader_id INTEGER REFERENCES users(id),
    score FLOAT,
    feedback_rich TEXT,
    status VARCHAR DEFAULT 'draft',
    attempt_number INTEGER DEFAULT 1,
    time_spent_minutes INTEGER
);
```

## User Experience Features

### 🎨 Modern UI/UX
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark/Light Mode**: Consistent with platform theme
- **Loading States**: Smooth loading indicators
- **Error Handling**: User-friendly error messages
- **Success Feedback**: Toast notifications for actions

### ⌨️ Keyboard Shortcuts
- `Ctrl+S`: Save task
- `Ctrl+P`: Publish task
- `Ctrl+Z`: Undo in rich text editor
- `Ctrl+Y`: Redo in rich text editor

### 🔄 Auto-save
- Automatic saving every 5 seconds
- Visual indicators for save status
- Unsaved changes protection

### 📊 Advanced Filtering
- Search by title, description, instructions
- Filter by unit, type, status, due date
- Sort by any column
- Bulk selection and actions

### 📈 Analytics Dashboard
- Real-time submission statistics
- Score distribution charts
- Completion rate tracking
- Time analytics

## Security & Validation

### 🔒 Security Features
- **RBAC**: Only teachers can access admin functions
- **CSRF Protection**: Built-in CSRF protection
- **Input Validation**: Server-side validation for all inputs
- **Rate Limiting**: Protection against abuse
- **Audit Logging**: All actions logged for compliance

### ✅ Validation Rules
- Required fields: title, type
- Auto-gradable validation: correct answers, options
- Due date validation: must be in future if scheduled
- Assignment validation: must assign to audience if published
- Score validation: within max_score range

## Auto-gradable Task Types

### 1. Single Choice Questions (SCQ)
- Multiple options with one correct answer
- Configurable shuffling
- Partial credit options

### 2. Multiple Choice Questions (MCQ)
- Multiple options with multiple correct answers
- Configurable shuffling
- Partial credit for correct selections

### 3. Matching Exercises
- Pairs of items to match
- All-or-nothing or per-pair scoring

### 4. Ordering Exercises
- Items to arrange in correct order
- Exact match or partial credit scoring

### 5. Gap-fill Exercises
- Text with gaps using `[[gap_id]]` syntax
- Multiple acceptable answers per gap
- Case sensitivity options

### 6. Short Answer Questions
- Text-based answers
- Multiple acceptable answers
- Case sensitivity and regex options

### 7. Numeric Questions
- Number-based answers
- Tolerance settings
- Multiple acceptable values

## File Management

### 📁 File Upload Support
- **Supported Formats**: PDF, JPG, PNG, audio files
- **Size Limits**: Configurable file size limits
- **Storage**: S3-compatible storage (MinIO)
- **Security**: Signed, expiring URLs for downloads

### 📎 Attachment Features
- Drag-and-drop upload
- Progress indicators
- File preview
- Secure download links

## Notification System

### 📧 Email Notifications
- **Assignment Notifications**: Email when task is assigned
- **Reminder Emails**: Configurable deadline reminders
- **Results Notifications**: Email results to students
- **Teacher Copies**: Copy of submissions to teachers

### ⏰ Scheduling
- **Publish Scheduling**: Schedule task publication
- **Reminder Scheduling**: Automated deadline reminders
- **Email Scheduling**: Queued email delivery

## Integration Points

### 🔗 Platform Integration
- **Units**: Tasks can be attached to learning units
- **Videos**: Reference video content in tasks
- **Tests**: Link to related assessments
- **Progress**: Track completion in student progress
- **Grades**: Integrate with gradebook system
- **Audit Log**: All actions logged for compliance

### 📊 Analytics Integration
- **Progress Tracking**: Monitor student progress
- **Performance Analytics**: Track task performance
- **Engagement Metrics**: Measure student engagement
- **Time Analytics**: Analyze time spent on tasks

## Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL
- Redis (for background tasks)

### Installation
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost/eazy_italian

# File Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

## Testing

### Backend Tests
```bash
cd backend
pytest tests/test_tasks.py
```

### Frontend Tests
```bash
cd frontend
npm test
```

## Deployment

### Docker Deployment
```bash
docker-compose up -d
```

### Production Considerations
- **Database**: Use production PostgreSQL
- **File Storage**: Configure S3 or MinIO
- **Email**: Set up production SMTP
- **Monitoring**: Add application monitoring
- **Backup**: Regular database backups

## Future Enhancements

### 🚀 Planned Features
- **Advanced Analytics**: More detailed performance metrics
- **Peer Review**: Student peer review system
- **Plagiarism Detection**: Built-in plagiarism checking
- **Mobile App**: Native mobile application
- **Offline Support**: Offline task completion
- **AI Grading**: AI-powered automatic grading
- **Video Responses**: Video submission support
- **Collaborative Tasks**: Group assignment support

### 🔧 Technical Improvements
- **Real-time Updates**: WebSocket integration
- **Advanced Search**: Full-text search capabilities
- **API Rate Limiting**: Enhanced rate limiting
- **Caching**: Redis caching for performance
- **CDN**: Content delivery network for files

## Support & Documentation

### 📚 Additional Resources
- [API Documentation](./api-docs.md)
- [Database Schema](./database-schema.md)
- [Deployment Guide](./deployment.md)
- [Troubleshooting](./troubleshooting.md)

### 🆘 Getting Help
- **Issues**: Create GitHub issues
- **Discussions**: Use GitHub discussions
- **Documentation**: Check inline code comments
- **Examples**: See example implementations

---

This Admin Tasks Management System provides a comprehensive solution for managing assignments in the Italian learning platform, with modern UI/UX, robust backend functionality, and extensive customization options.
