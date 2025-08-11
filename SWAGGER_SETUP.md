# Swagger Integration Setup Guide

## ✅ What's Already Done

1. **Swagger packages added** to `package.json`:
   - `swagger-jsdoc` - Generates OpenAPI spec from JSDoc comments
   - `swagger-ui-express` - Serves interactive Swagger UI

2. **Server.js updated** with Swagger integration:
   - Swagger UI mounted at `/api-docs`
   - OpenAPI JSON available at `/api-docs.json`
   - Custom styling and configuration applied

3. **Swagger configuration** in `swagger.js`:
   - API metadata and server configuration
   - Tag organization (Upload, Chat, Vector, System)
   - Schema definitions for responses

## 🚀 How to Start

### Option 1: Local Development
```bash
# Install dependencies (including new Swagger packages)
npm install

# Start the server
npm run server
```

### Option 2: Docker Compose
```bash
# Build and start all services
docker-compose up --build
```

## 🌐 Access Swagger

Once the server is running:

- **Swagger UI**: http://localhost:5000/api-docs
- **OpenAPI JSON**: http://localhost:5000/api-docs.json
- **Health Check**: http://localhost:5000/api/health

## 🧪 Test the Integration

Run the test script to verify everything works:
```bash
node test-swagger.js
```

## 📚 What You'll See

### Swagger UI Features:
- **Interactive Testing**: Test any endpoint directly from the browser
- **Request/Response Examples**: See actual data formats
- **Code Samples**: cURL and JavaScript examples
- **Schema Validation**: Automatic request/response validation
- **Filtering**: Search endpoints by tags or keywords
- **Export**: Download OpenAPI specification

### Available Endpoints:
- **Upload**: PDF file and URL processing
- **Chat**: AI-powered document Q&A
- **Vector**: Embedding and RAG operations
- **System**: Health checks and status

## 🔧 Customization

### Modify Swagger UI Appearance:
Edit the `swaggerUi.setup()` options in `server.js`:
```javascript
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Documentation for Chat with PDF Documents',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true
  }
}));
```

### Add New Endpoints:
1. Add JSDoc comments with `@swagger` annotations
2. The endpoint will automatically appear in Swagger UI
3. Follow the existing pattern in `routes/upload.js` and `routes/chat.js`

## 🐛 Troubleshooting

### Common Issues:

1. **"Cannot find module 'swagger-jsdoc'"**
   - Run `npm install` to install dependencies

2. **Port 5000 already in use**
   - Change `PORT` in `.env` or kill existing process

3. **Swagger UI shows empty page**
   - Check browser console for JavaScript errors
   - Verify `swagger.js` file exists and is valid

4. **Endpoints not showing**
   - Ensure JSDoc comments use `@swagger` annotation
   - Check file paths in `swagger.js` apis array

### Debug Commands:
```bash
# Check if packages are installed
npm list swagger-jsdoc swagger-ui-express

# Test server health
curl http://localhost:5000/api/health

# Test Swagger endpoints
curl http://localhost:5000/api-docs
curl http://localhost:5000/api-docs.json
```

## 📖 Next Steps

1. **Test the API**: Use Swagger UI to test all endpoints
2. **Add Authentication**: Implement API key security if needed
3. **Custom Schemas**: Add more detailed response schemas
4. **Examples**: Add more request/response examples
5. **Documentation**: Expand JSDoc comments for better coverage

## 🎯 Benefits

- **Developer Experience**: Interactive API testing
- **Documentation**: Always up-to-date with code
- **Testing**: Easy endpoint validation
- **Integration**: Ready for CI/CD and external tools
- **Professional**: Industry-standard API documentation
