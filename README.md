# Eazy Italian - Платформа для изучения итальянского языка

Современная веб-платформа для изучения итальянского языка с полной системой управления контентом и отслеживания прогресса.

## 🚀 Возможности

### Для студентов
- 📚 Интерактивные уроки с видео
- 📝 Задания с автоматической и ручной проверкой
- 🧪 Тесты с различными типами вопросов
- 📊 Отслеживание прогресса и сертификаты
- 📧 Уведомления о новых материалах и дедлайнах

### Для преподавателей
- 🎛️ Полная панель администратора
- 📹 Управление видео и контентом
- 📋 Создание заданий и тестов
- 📊 Аналитика успеваемости студентов
- 📧 Email-кампании и уведомления

## 🛠️ Технологический стек

### Backend
- **FastAPI** - современный веб-фреймворк
- **PostgreSQL** - основная база данных
- **Redis** - кэширование и очереди задач
- **SQLAlchemy** - ORM
- **Alembic** - миграции базы данных
- **Celery** - фоновые задачи (email, обработка файлов)
- **JWT** - аутентификация

### Frontend
- **React 18** с TypeScript
- **Vite** - сборщик
- **Tailwind CSS** - стилизация
- **React Router** - маршрутизация
- **React Query** - управление состоянием
- **React Hook Form** - формы
- **i18next** - интернационализация

### Инфраструктура
- **Docker** - контейнеризация
- **Nginx** - веб-сервер
- **MinIO** - объектное хранилище (S3-совместимое)

## 📦 Установка и запуск

### Предварительные требования
- Docker и Docker Compose
- Node.js 18+ (для разработки)
- Python 3.11+ (для разработки)

### Быстрый запуск с Docker

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd eazy-italian
```

2. Скопируйте файл окружения:
```bash
cp .env.example .env
```

3. Запустите приложение:
```bash
docker-compose up -d
```

4. Примените миграции и создайте демо-данные:
```bash
docker-compose exec backend python -m alembic upgrade head
docker-compose exec backend python -m scripts.seed_data
```

5. Откройте приложение: http://localhost:3000

### Демо-аккаунты

**Преподаватель (Admin):**
- Email: teacher@eazyitalian.com
- Пароль: password123

**Студент:**
- Email: student@eazyitalian.com
- Пароль: password123

## 🏗️ Структура проекта

```
eazy-italian/
├── backend/                 # FastAPI приложение
│   ├── app/
│   │   ├── api/            # API endpoints
│   │   ├── core/           # Конфигурация, middleware
│   │   ├── models/         # SQLAlchemy модели
│   │   ├── schemas/        # Pydantic схемы
│   │   ├── services/       # Бизнес-логика
│   │   └── utils/          # Утилиты
│   ├── alembic/            # Миграции БД
│   ├── tests/              # Тесты
│   └── requirements.txt
├── frontend/               # React приложение
│   ├── src/
│   │   ├── components/     # React компоненты
│   │   ├── pages/          # Страницы
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API клиенты
│   │   ├── store/          # Управление состоянием
│   │   └── utils/          # Утилиты
│   ├── public/             # Статические файлы
│   └── package.json
├── docker-compose.yml      # Docker конфигурация
├── .env.example           # Пример переменных окружения
└── README.md
```

## 🔧 Конфигурация

### Переменные окружения

Создайте файл `.env` на основе `.env.example`:

```bash
# База данных
DATABASE_URL=postgresql://user:password@localhost/eazy_italian
REDIS_URL=redis://localhost:6379

# JWT
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=180

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Файловое хранилище
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_BUCKET_NAME=eazy-italian

# Frontend
VITE_API_URL=http://localhost:8000
```

## 🧪 Тестирование

### Backend тесты
```bash
cd backend
pytest
```

### Frontend тесты
```bash
cd frontend
npm test
```

### E2E тесты
```bash
npm run test:e2e
```

## 📊 API Документация

После запуска приложения, API документация доступна по адресу:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🚀 Развертывание

### Production

1. Настройте production переменные окружения
2. Соберите Docker образы:
```bash
docker-compose -f docker-compose.prod.yml build
```

3. Запустите production версию:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 📝 Лицензия

MIT License

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📞 Поддержка

По вопросам и предложениям создавайте Issues в репозитории.
