# Full-Stack Application

A full-stack application with Node.js backend and frontend, plus a Python FHE (Fully Homomorphic Encryption) service.

## Prerequisites

* **Node.js** (version 16 or higher)
* **npm** (comes with Node.js)
* **Python 3.10** (for FHE service)

## Quick Start

### 1. Install Dependencies

Install dependencies for the root, backend, and frontend:

```bash
# Install root dependencies (if a package.json exists in the root)
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies  
cd frontend
npm install
cd ..
```

### 2. Start the Servers

You'll need **3 terminal windows** to run all services:

#### Terminal 1 - Backend Server

```bash
cd backend
npm start
```

Backend will run at: **[http://localhost:5000](http://localhost:5000)**

#### Terminal 2 - Frontend Server

```bash
cd frontend
npm start
```

Frontend will run at: **[http://localhost:3000](http://localhost:3000)**

#### Terminal 3 - FHE Service (Optional)

```bash
cd fhe_service
pip install fastapi uvicorn tenseal pydantic
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

FHE service will run at: **[http://localhost:8000](http://localhost:8000)**

## Usage

1. Open your browser and go to **[http://localhost:3000](http://localhost:3000)**
2. The frontend will communicate with the backend at port 5000
3. If using FHE features, the backend will communicate with the FHE service at port 8000

## Project Structure

```
project/
├── backend/          # Node.js backend server (port 5000)
├── frontend/         # Frontend application (port 3000)
├── fhe_service/      # Python FHE service (port 8000)
└── README.md         # This file
```

## Troubleshooting

**Port already in use:**

```bash
# Kill processes on specific ports
# macOS/Linux:
lsof -ti:3000 | xargs kill -9
lsof -ti:5000 | xargs kill -9

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

**Node.js version issues:**

```bash
# Check your Node.js version
node --version

# Should be 16.x.x or higher
```

**npm install fails:**

```bash
# Clear npm cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Development

* Backend and frontend support hot reload (changes will auto-refresh)
* FHE service uses `--reload` flag for development
* No build step required for development

## Production

For production deployment, you may need to build the frontend:

```bash
cd frontend
npm run build
```

Check your `package.json` files for available scripts.
