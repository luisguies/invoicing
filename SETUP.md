# Setup Instructions

## Quick Start

1. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

2. **Start the application**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api/health

## First Time Setup

### Prerequisites
- Docker Desktop installed and running
- OpenAI API key (get one at https://platform.openai.com/api-keys)

### Step-by-Step

1. **Clone or navigate to the project directory**

2. **Create environment file**:
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env
   
   # Linux/Mac
   cp .env.example .env
   ```

3. **Edit `.env` file** and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Build and start all services**:
   ```bash
   docker-compose up --build
   ```
   
   This will:
   - Build MongoDB container
   - Build Node.js container (backend + frontend)
   - Build Python container (OCR service)
   - Start all services

5. **Wait for services to be ready**:
   - MongoDB: Should start quickly
   - Python OCR Service: Should be available at http://localhost:8000
   - Node.js Backend: Should be available at http://localhost:5000
   - React Frontend: Should be available at http://localhost:3000

6. **Verify everything is working**:
   - Open http://localhost:3000 in your browser
   - You should see the Upload page
   - Check backend health: http://localhost:5000/api/health

## Troubleshooting

### Port Already in Use
If you get port conflicts:
- Stop other services using ports 3000, 5000, 8000, or 27017
- Or modify ports in `docker-compose.yml`

### MongoDB Won't Start
- Check if port 27017 is available
- Check Docker logs: `docker-compose logs mongodb`
- Try removing the `mongodb-data` folder and restarting

### Frontend Won't Load
- Check if Node.js container is running: `docker-compose ps`
- Check frontend logs: `docker-compose logs nodejs-app`
- Ensure port 3000 is not blocked by firewall

### OCR Service Errors
- Verify OpenAI API key is correct in `.env`
- Check Python service logs: `docker-compose logs python-scripts`
- Ensure you have credits in your OpenAI account

### Database Connection Issues
- Wait a few seconds after starting for MongoDB to initialize
- Check MongoDB logs: `docker-compose logs mongodb`
- Verify connection string in environment variables

## Development Mode

The application runs in development mode by default:
- Hot reloading enabled for frontend
- Backend restarts on file changes (if using nodemon)
- All volumes are mounted for live editing

## Stopping the Application

```bash
docker-compose down
```

To also remove volumes (deletes database data):
```bash
docker-compose down -v
```

## Viewing Logs

View all logs:
```bash
docker-compose logs -f
```

View specific service logs:
```bash
docker-compose logs -f nodejs-app
docker-compose logs -f python-scripts
docker-compose logs -f mongodb
```

## Rebuilding After Changes

If you modify dependencies or Dockerfiles:
```bash
docker-compose up --build
```

## Accessing Containers

### Node.js Container
```bash
docker-compose exec nodejs-app sh
```

### Python Container
```bash
docker-compose exec python-scripts bash
```

### MongoDB Shell
```bash
docker-compose exec mongodb mongosh invoicing
```

## Data Persistence

- MongoDB data: Stored in `./mongodb-data/` (created automatically)
- Uploaded PDFs: Stored in `./uploads/` (created automatically)
- Generated invoices: Stored in `./invoices/` (created automatically)

These directories are mounted as volumes and persist between container restarts.

