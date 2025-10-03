# Email & Scheduling System

This document describes the comprehensive email and scheduling system implemented for the Eazy Italian platform.

## Overview

The system provides automated email notifications for task assignments, reminders, submissions, and grades, along with scheduling capabilities for future publications and reminders.

## Features

### 📧 Email Notifications

1. **Task Assignment Notifications**
   - Sent to students when tasks are assigned
   - Includes task details, due dates, and instructions
   - Personalized with student names

2. **Task Reminders**
   - Configurable reminder timing (e.g., "2 days before due")
   - Sent to assigned students
   - Includes task information and due date

3. **Submission Notifications**
   - Sent to teachers when students submit work
   - Includes student information and submission details
   - Links to grading interface

4. **Grade Notifications**
   - Sent to students when work is graded
   - Includes score, feedback, and rubric details
   - Personalized with student performance

### ⏰ Scheduling System

1. **Task Scheduling**
   - Schedule tasks for future publication
   - Automatic publication at specified time
   - Email notifications sent upon publication

2. **Reminder Scheduling**
   - Schedule reminders relative to due dates
   - Support for days and hours offsets
   - Automatic reminder delivery

3. **Email Campaign Scheduling**
   - Schedule bulk email campaigns
   - Support for complex audience targeting
   - Campaign status tracking

### 📊 Audit Logging

1. **Comprehensive Logging**
   - All email activities logged
   - Task and submission actions tracked
   - User activity monitoring

2. **Audit Trail**
   - IP address and user agent tracking
   - Request metadata capture
   - Detailed action history

## API Endpoints

### Email & Scheduling

```
POST /api/v1/tasks/admin/tasks/{task_id}/notify-assignment
POST /api/v1/tasks/admin/tasks/{task_id}/schedule-reminder
POST /api/v1/submissions/{submission_id}/email-result
POST /api/v1/tasks/admin/tasks/{task_id}/assign
POST /api/v1/tasks/admin/tasks/{task_id}/unassign
POST /api/v1/tasks/admin/tasks/{task_id}/publish
POST /api/v1/tasks/admin/tasks/{task_id}/schedule
POST /api/v1/submissions/{submission_id}/allow-retake
```

### Audit

```
GET /api/v1/audit/
GET /api/v1/audit/task/{task_id}
GET /api/v1/audit/user/{user_id}
GET /api/v1/audit/actions
GET /api/v1/audit/entity-types
```

## Configuration

### SMTP Settings

Configure in `.env` file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_TLS=true
SMTP_SSL=false
```

### Email Templates

The system uses HTML email templates with Russian language support:

- **Assignment Template**: Task details, instructions, due dates
- **Reminder Template**: Task information, urgency messaging
- **Submission Template**: Student details, submission metadata
- **Grade Template**: Score, feedback, rubric breakdown

## Usage Examples

### Send Assignment Notification

```python
from app.services.email_service import EmailService

email_service = EmailService(db)
success = email_service.send_task_assignment_notification(task, student_ids)
```

### Schedule Task Reminder

```python
from app.services.scheduler_service import scheduler_service

success = scheduler_service.schedule_task_reminder(task, "2 days")
```

### Log Audit Action

```python
from app.services.audit_service import AuditService

audit_service = AuditService(db)
audit_service.log_task_action(
    action="task_published",
    task_id=task.id,
    user_id=current_user.id,
    details={"status": "published"}
)
```

## Database Schema

### Email Campaigns

```sql
CREATE TABLE email_campaigns (
    id SERIAL PRIMARY KEY,
    title VARCHAR NOT NULL,
    template_type VARCHAR,
    subject VARCHAR NOT NULL,
    body_rich TEXT NOT NULL,
    audience_filter JSONB DEFAULT '{}',
    schedule_at TIMESTAMPTZ,
    status VARCHAR NOT NULL DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
```

### Email Logs

```sql
CREATE TABLE email_logs (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES email_campaigns(id),
    recipient_id INTEGER REFERENCES users(id),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR NOT NULL DEFAULT 'pending',
    error_msg TEXT
);
```

### Audit Logs

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR NOT NULL,
    entity_type VARCHAR NOT NULL,
    entity_id INTEGER,
    user_id INTEGER REFERENCES users(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address VARCHAR,
    user_agent VARCHAR,
    details JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);
```

## Task Model Extensions

The Task model includes email-related fields:

```python
class Task(Base):
    # ... existing fields ...
    
    # Email settings
    send_assignment_email: bool = False
    reminder_days_before: Optional[int] = None
    notify_teacher_on_submit: bool = True
    notify_student_on_grade: bool = True
```

## Background Processing

The system uses APScheduler for background task processing:

- **AsyncIOScheduler**: Handles scheduled jobs
- **DateTrigger**: For one-time scheduled events
- **CronTrigger**: For recurring tasks (future enhancement)

## Testing

Run the comprehensive test suite:

```bash
cd backend
python test_email_system.py
```

This will test:
- Email service functionality
- Audit logging
- Scheduling system
- API endpoints
- Database operations

## Monitoring

### Email Status Tracking

- **PENDING**: Email queued for sending
- **SENT**: Email successfully delivered
- **FAILED**: Email delivery failed
- **BOUNCED**: Email bounced back

### Campaign Status

- **DRAFT**: Campaign created but not scheduled
- **SCHEDULED**: Campaign scheduled for future sending
- **SENT**: Campaign completed
- **CANCELLED**: Campaign cancelled

## Security Considerations

1. **SMTP Authentication**: Secure SMTP credentials
2. **Rate Limiting**: Prevent email spam
3. **Audit Trail**: Complete action logging
4. **Input Validation**: Sanitize email content
5. **Error Handling**: Graceful failure handling

## Future Enhancements

1. **Email Templates**: Visual template editor
2. **Advanced Scheduling**: Cron-based recurring reminders
3. **Email Analytics**: Open/click tracking
4. **Bulk Operations**: Mass email campaigns
5. **Template Variables**: Dynamic content insertion
6. **Email Preferences**: User notification settings

## Troubleshooting

### Common Issues

1. **SMTP Connection Failed**
   - Check SMTP credentials
   - Verify network connectivity
   - Check firewall settings

2. **Emails Not Sending**
   - Check email service logs
   - Verify recipient email addresses
   - Check SMTP configuration

3. **Scheduled Jobs Not Running**
   - Check scheduler service status
   - Verify job scheduling
   - Check system timezone

### Logs

Monitor these log files:
- Application logs: `app.log`
- Email service logs: `email.log`
- Scheduler logs: `scheduler.log`
- Audit logs: Database table `audit_logs`

## Support

For issues or questions:
1. Check the audit logs for detailed error information
2. Review email service logs for SMTP issues
3. Verify configuration settings
4. Test with the provided test script

