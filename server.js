// Express server entrypoint for the Chat with PDF DOcuments
// Responsibilities:
// - Initialize Express middleware (CORS, JSON body parsing)
// - Set up upload directory path used by routes
// - Connect to MongoDB
// - Mount feature routes: /api/upload, /api/chat
// - Provide health-check and error handling
// - Serve Swagger/OpenAPI documentation
//
// Notes:
// - Business logic for upload/chat lives in routes; keep server slim
// - Avoid adding heavy logic here to ease testing and maintenance
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Swagger/OpenAPI documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Allow cross-origin requests (frontend <-> backend during development)
app.use(cors());
// JSON + URL-encoded body parsing for API inputs
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
// Declared here to ensure the folder exists at boot. Actual upload handling is in routes.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// MongoDB Connection
// Use local connection by default, allow override via MONGODB_URI
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pdf-chat', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Import routes
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');

// Routes
// Namespaced under /api to avoid collisions with any static or client routes
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);

// Swagger/OpenAPI Documentation
// Serve interactive API documentation at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Documentation for Chat with PDF Documents',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    showCommonExtensions: true
  }
}));

// Serve OpenAPI specification as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpecs);
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: |
 *       Simple health check to verify the API is running and responsive.
 *       Returns basic status information about the service.
 *       
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy and running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 message:
 *                   type: string
 *                   example: "Chat with PDF Documents is running"
 *     x-code-samples:
 *       - lang: curl
 *         source: |
 *           curl http://localhost:5000/api/health
 *       - lang: JavaScript
 *         source: |
 *           const response = await fetch('/api/health');
 *           const data = await response.json();
 */
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Chat with PDF Documents is running' });
});

// Error handling middleware
// Centralized error handler to avoid leaking stack traces to clients
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: error.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
  console.log(`OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
});

