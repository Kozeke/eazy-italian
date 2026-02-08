# Notifications System

## Overview

The notifications system provides real-time notifications to teachers/admins when students perform important actions in the platform.

## Features

- **Course Enrollment Notifications**: Get notified when students enroll in courses
- **Test Completion Notifications**: Get notified when students complete tests
- **Test Pass/Fail Status**: Notifications indicate whether students passed or failed
- **Real-time Updates**: Unread count updates every 30 seconds
- **Mark as Read**: Individual or bulk mark as read functionality
- **Navigation Links**: Click notifications to navigate to relevant pages
- **Responsive UI**: Beautiful dropdown interface with unread count badge

## Architecture

### Backend Components

1. **Model**: `backend/app/models/notification.py`
   - `Notification` model with fields for type, title, message, student info, and related entities
   - `NotificationType` enum for different event types

2. **API Endpoints**: `backend/app/api/v1/endpoints/notifications.py`
   - `GET /api/v1/notifications/admin/notifications` - Get notifications list
   - `GET /api/v1/notifications/admin/notifications/unread-count` - Get unread count
   - `POST /api/v1/notifications/admin/notifications/{id}/read` - Mark notification as read
   - `POST /api/v1/notifications/admin/notifications/read-all` - Mark all as read

3. **Service Layer**: `backend/app/services/notification_service.py`
   - Helper functions for creating notifications
   - `notify_course_enrollment()` - Create course enrollment notification
   - `notify_test_completed()` - Create test completion notification

4. **Integrations**:
   - Course enrollment flow (`courses.py`)
   - Test submission flow (`tests.py`)

### Frontend Components

1. **Notification Center**: `frontend/src/components/admin/NotificationCenter.tsx`
   - Dropdown component with notifications list
   - Unread count badge
   - Auto-refresh every 30 seconds
   - Click to navigate to related pages
   - Time ago formatting in Russian

2. **API Methods**: `frontend/src/services/api.ts`
   - `notificationsApi.getNotifications()`
   - `notificationsApi.getUnreadCount()`
   - `notificationsApi.markAsRead(notificationId)`
   - `notificationsApi.markAllAsRead()`

3. **Layout Integration**: `frontend/src/components/admin/AdminLayout.tsx`
   - Notification bell icon in header
   - Integrated into admin layout

### Database

**Table**: `notifications`

```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    type notificationtype NOT NULL,  -- enum: course_enrollment, test_passed, test_failed, etc.
    title VARCHAR NOT NULL,
    message TEXT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    related_id INTEGER,              -- ID of course, test, etc.
    related_type VARCHAR,            -- 'course', 'test', 'task'
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Indexes**:
- `idx_notifications_student_id` - Fast lookup by student
- `idx_notifications_is_read` - Fast filtering of unread notifications
- `idx_notifications_created_at` - Fast sorting by date

## Setup

### 1. Run Database Migration

```bash
# From project root
docker-compose exec backend python migrate_notifications_table.py
```

This will:
- Create the `notificationtype` enum
- Create the `notifications` table
- Add necessary indexes

### 2. Restart Backend

The notification endpoints are automatically registered when the backend starts.

```bash
docker-compose restart backend
```

### 3. Frontend (No Changes Needed)

The frontend will automatically pick up the new notification center component.

## Usage

### For Teachers/Admins

1. **View Notifications**:
   - Click the bell icon in the top header
   - Dropdown shows all notifications
   - Unread notifications have a blue background and blue dot

2. **Mark as Read**:
   - Click on any notification to mark it as read and navigate to the related page
   - Or click "Отметить все" to mark all as read

3. **Navigation**:
   - Course enrollment → Course detail page
   - Test completion → Test detail page
   - Fallback → Student profile page

### Adding New Notification Types

1. **Add to enum** in `backend/app/models/notification.py`:
   ```python
   class NotificationType(str, enum.Enum):
       # ... existing types
       NEW_TYPE = "new_type"
   ```

2. **Update migration** to include new type (if needed)

3. **Create service function** in `backend/app/services/notification_service.py`:
   ```python
   def notify_new_event(db: Session, student_id: int, ...):
       return create_notification(
           db=db,
           notification_type=NotificationType.NEW_TYPE,
           title="Event Title",
           message="Event description",
           student_id=student_id,
           related_id=...,
           related_type="..."
       )
   ```

4. **Integrate** into the relevant API endpoint:
   ```python
   from app.services.notification_service import notify_new_event
   
   # ... in your endpoint
   try:
       notify_new_event(db, student_id, ...)
   except Exception as e:
       print(f"Failed to create notification: {e}")
   ```

5. **Update frontend icon** (optional) in `NotificationCenter.tsx`:
   ```typescript
   const getNotificationIcon = (type: string) => {
       switch (type) {
           case 'new_type':
               return '🆕';
           // ... existing cases
       }
   };
   ```

## API Examples

### Get All Notifications

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/notifications/admin/notifications
```

### Get Unread Count

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/notifications/admin/notifications/unread-count
```

### Mark Notification as Read

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/notifications/admin/notifications/1/read
```

### Mark All as Read

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/notifications/admin/notifications/read-all
```

## Future Enhancements

- [ ] Add email notifications for important events
- [ ] Add push notifications (web push API)
- [ ] Add notification preferences/settings
- [ ] Add notification filtering by type
- [ ] Add notification search
- [ ] Add notification archiving
- [ ] Add student-facing notifications (currently admin-only)
- [ ] Add real-time WebSocket updates instead of polling

## Troubleshooting

**Notifications not appearing?**
- Check backend logs for errors
- Verify the migration ran successfully
- Check if notifications are being created in the database
- Verify API endpoints are accessible

**Unread count not updating?**
- The count refreshes every 30 seconds automatically
- Click the bell icon to force a refresh

**Navigation not working?**
- Check if the related_id and related_type are set correctly
- Verify the routes exist in the frontend router
