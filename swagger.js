/**
 * Swagger/OpenAPI configuration for PDF Chat API
 * This file defines the main API specification that can be used with
 * swagger-ui-express or other OpenAPI tools to generate interactive documentation.
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PDF Chat API',
      version: '1.0.0',
      description: `
# PDF Chat API

A MERN stack REST API for conversational interaction with PDF documents using Retrieval Augmented Generation (RAG).

## Features

- **PDF Upload & Processing**: Upload PDF files for document ingestion
- **Intelligent Chat Interface**: Ask questions about uploaded documents with AI-powered responses
- **Source Citations**: Get answers with relevant page references and text excerpts
- **Vector Database**: Uses Qdrant for semantic search and RAG
- **AI Integration**: Supports Groq (OpenAI-compatible) and Ollama for LLM and embeddings

## Architecture

- **Backend**: Node.js + Express.js
- **Database**: MongoDB for document metadata, Qdrant for vector storage
- **AI**: Groq for LLM, Ollama for embeddings
- **Chunking**: Fixed 2000-token chunks with 200-token overlap
- **RAG**: Vector similarity search to retrieve relevant context

## Environment Variables

\`\`\`bash
# AI Configuration
AI_PROVIDER=openai                    # openai (Groq) or ollama
OPENAI_API_KEY=gsk_...               # Groq API key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
MODEL_NAME=llama3.2:3b
EMBEDDING_MODEL=mxbai-embed-large

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=pdf_chunks

# Database
MONGODB_URI=mongodb://localhost:27017/pdf-chat

# Prompt Sizing (to avoid 413 errors)
MAX_CONTEXT_CHUNKS=3
CONTEXT_CHARS_PER_CHUNK=1200
HISTORY_MESSAGES=4
\`\`\`

## Quick Start

1. **Start Services**: \`docker-compose up -d\`
2. **Upload PDF**: \`POST /api/upload\`
3. **Chat**: \`POST /api/chat\` with documentId and question
4. **View History**: \`GET /api/chat/{sessionId}\`

## API Response Format

All successful responses include:
- \`success: true\`
- Relevant data fields
- Timestamps in ISO format
- Error responses include \`error\` field with description

## Rate Limits & Constraints

- **File Upload**: 10MB max, PDF only
- **Context Size**: Capped at 3 chunks × 1200 chars to prevent LLM token limits
- **Embedding Timeout**: 120 seconds for large documents
- **Chat History**: Limited to last 4 messages for context
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.example.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Upload',
        description: 'PDF document upload and processing operations'
      },
      {
        name: 'Chat',
        description: 'AI-powered chat interactions with documents'
      },
      {
        name: 'Vector',
        description: 'Vector database operations for RAG functionality'
      },
      {
        name: 'System',
        description: 'System health and status endpoints'
      }
    ],
    components: {
      securitySchemes: {
        // Future: Add authentication if needed
        // apiKey: {
        //   type: 'apiKey',
        //   in: 'header',
        //   name: 'X-API-Key'
        // }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            message: {
              type: 'string',
              description: 'Additional error details'
            }
          },
          required: ['error']
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            }
          },
          required: ['success']
        }
      }
    },
    security: [
      // Future: Add security requirements
      // { apiKey: [] }
    ]
  },
  apis: [
    './routes/*.js',     // Route files with @swagger annotations
    './services/*.js',   // Service files with @swagger annotations
    './server.js'        // Main server file with @swagger annotations
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;
