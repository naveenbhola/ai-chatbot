# Docker Build Troubleshooting Guide

## 🚨 Current Issue
The frontend Docker build is failing with the error:
```
target frontend: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
```

## 🔧 Solutions (Try in Order)

### Solution 1: Use the Updated Dockerfile (Recommended)
The main `Dockerfile.frontend` has been updated with:
- Multi-stage build for better optimization
- Git installation to resolve dependency issues
- Better error handling and build process
- Nginx for production serving

```bash
# Clean up previous builds
docker system prune -f
docker volume prune -f

# Rebuild with updated Dockerfile
docker-compose up --build
```

### Solution 2: Use Simple Dockerfile (Fallback)
If the main Dockerfile still fails, use the simple version:

```bash
# Rename the simple Dockerfile
cd client
mv Dockerfile.frontend Dockerfile.frontend.original
mv Dockerfile.frontend.simple Dockerfile.frontend

# Go back and rebuild
cd ..
docker-compose up --build
```

### Solution 3: Local Build + Copy (Alternative)
Build the React app locally and copy the build folder:

```bash
# Build React app locally
cd client
npm install
npm run build

# Go back to root
cd ..

# Use a simple Dockerfile that just serves the built app
echo 'FROM nginx:alpine
COPY client/build /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]' > client/Dockerfile.frontend

# Rebuild
docker-compose up --build
```

## 🐛 Debugging Steps

### Step 1: Check Local Build
First, verify the React app builds locally:

```bash
cd client
npm install
npm run build
```

If this fails, the issue is with the React code, not Docker.

### Step 2: Check Docker Context
Ensure the Docker build context is correct:

```bash
# From the root directory
docker build -f client/Dockerfile.frontend client/
```

### Step 3: Check for Missing Dependencies
The build might be failing due to missing system dependencies:

```bash
# Check if all required packages are in package.json
cd client
npm list --depth=0
```

### Step 4: Check Build Logs
Get detailed build logs:

```bash
docker-compose build --no-cache --progress=plain frontend
```

## 🔍 Common Causes & Fixes

### 1. Git Not Found Warning
**Cause**: Some npm packages require git during installation
**Fix**: Already addressed in updated Dockerfile with `RUN apk add --no-cache git`

### 2. Memory Issues
**Cause**: Build process runs out of memory
**Fix**: Increase Docker memory limit in Docker Desktop settings

### 3. Node Version Mismatch
**Cause**: React version incompatible with Node version
**Fix**: Use Node 18 (already specified in Dockerfile)

### 4. Missing Build Dependencies
**Cause**: Alpine Linux missing required build tools
**Fix**: Added `python3 make g++` in simple Dockerfile

### 5. Network Issues
**Cause**: npm registry access problems
**Fix**: Use `npm ci` instead of `npm install` (already implemented)

## 🚀 Quick Fix Commands

### Clean Everything and Rebuild
```bash
# Stop all containers
docker-compose down

# Remove all images and containers
docker system prune -a -f

# Remove volumes
docker volume prune -f

# Rebuild from scratch
docker-compose up --build
```

### Check Service Status
```bash
# Check if services are running
docker-compose ps

# Check logs
docker-compose logs frontend
docker-compose logs backend
```

### Manual Build Test
```bash
# Test frontend build manually
cd client
docker build -t test-frontend .
docker run -p 3000:3000 test-frontend
```

## 📋 Environment Requirements

### Docker Desktop
- **Memory**: At least 4GB allocated
- **Disk**: At least 10GB free space
- **Version**: 4.0+ recommended

### System Requirements
- **RAM**: 8GB+ recommended
- **Storage**: 20GB+ free space
- **Network**: Stable internet connection

## 🔧 Alternative Approaches

### Approach 1: Development Mode
Skip production build for development:

```bash
# Modify docker-compose.yml frontend service
frontend:
  build:
    context: ./client
    dockerfile: Dockerfile.frontend.dev  # Create this for dev mode
  environment:
    - NODE_ENV=development
  volumes:
    - ./client:/app
    - /app/node_modules
  command: npm start
```

### Approach 2: Use Pre-built Image
Use a pre-built React image:

```yaml
# In docker-compose.yml
frontend:
  image: node:18-alpine
  working_dir: /app
  volumes:
    - ./client:/app
  ports:
    - "3000:3000"
  command: sh -c "npm install && npm start"
```

### Approach 3: Build in CI/CD
Build the React app in CI/CD and copy the build folder:

```yaml
# In docker-compose.yml
frontend:
  build:
    context: .
    dockerfile: Dockerfile.frontend.prod
  ports:
    - "3000:3000"
```

## 📞 Getting Help

If none of these solutions work:

1. **Check the full build logs** for specific error messages
2. **Verify local build** works without Docker
3. **Check system resources** (memory, disk space)
4. **Update Docker Desktop** to latest version
5. **Share error logs** for further assistance

## 🎯 Success Indicators

When the build succeeds, you should see:
- ✅ Frontend container starts successfully
- ✅ No build errors in logs
- ✅ Frontend accessible at http://localhost:3000
- ✅ All services running: `docker-compose ps`

---

**Next Steps**: Try Solution 1 first, then proceed through the alternatives if needed.
