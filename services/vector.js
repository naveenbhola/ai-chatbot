// Vector service: handles embeddings generation via Ollama and vector operations via Qdrant
// Provides RAG functionality by storing and retrieving document chunks as vectors
const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'pdf_chunks';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'mxbai-embed-large';

let client;

/**
 * @swagger
 * components:
 *   schemas:
 *     VectorChunk:
 *       type: object
 *       properties:
 *         text:
 *           type: array
 *           items:
 *             type: string
 *           description: Text content of the chunk (stored as array)
 *         page:
 *           type: integer
 *           nullable: true
 *           description: Page number if available
 *         chunkIndex:
 *           type: integer
 *           description: Sequential index of the chunk
 *     
 *     VectorSearchResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the vector point
 *         score:
 *           type: number
 *           format: float
 *           description: Similarity score (higher = more similar)
 *         payload:
 *           type: object
 *           properties:
 *             documentId:
 *               type: string
 *               format: uuid
 *               description: ID of the source document
 *             text:
 *               type: array
 *               items:
 *                 type: string
 *               description: Text content of the chunk
 *             page:
 *               type: integer
 *               nullable: true
 *             chunkIndex:
 *               type: integer
 *             filename:
 *               type: string
 *               description: Original filename
 *             sourceUrl:
 *               type: string
 *               format: uri
 *               description: Source URL if downloaded
 */

/**
 * Gets or creates a singleton Qdrant client instance
 * @returns {QdrantClient} Configured Qdrant client
 */
function getClient() {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  }
  return client;
}

/**
 * Generates embeddings for text using Ollama's embedding API
 * 
 * @swagger
 * /api/embed:
 *   post:
 *     summary: Generate text embeddings via Ollama
 *     description: |
 *       Converts text input into high-dimensional vector representations
 *       using the configured Ollama embedding model (default: mxbai-embed-large).
 *       
 *       **Fallback Support:** Handles multiple Ollama API response formats
 *       **Timeout:** 120 seconds for large text inputs
 *       
 *     tags: [Vector]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - input
 *             properties:
 *               model:
 *                 type: string
 *                 description: Ollama model name for embeddings
 *                 example: "mxbai-embed-large"
 *               input:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *                 description: Text or array of texts to embed
 *                 example: ["Sample text for embedding"]
 *     responses:
 *       200:
 *         description: Embeddings generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     embedding:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Single embedding vector
 *                 - type: object
 *                   properties:
 *                     embeddings:
 *                       type: array
 *                       items:
 *                         type: array
 *                         items:
 *                           type: number
 *                       description: Array of embedding vectors
 *       500:
 *         description: Embedding generation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid embedding response from Ollama"
 * 
 * @param {string|string[]} text - Text or array of texts to embed
 * @returns {Promise<number[]>} Embedding vector as array of numbers
 * @throws {Error} When Ollama API fails or returns invalid response
 */
async function getEmbedding(text) {
  // /api/embed expects { input: string[] }
  const inputArray = Array.isArray(text) ? text : [String(text || '')];
  try {
    console.log('====inside getEmbedding==========', inputArray);
    const resp = await axios.post(
      `${OLLAMA_BASE_URL}/api/embed`,
      { model: EMBEDDING_MODEL, input: inputArray },
      { timeout: 120000 }
    );
    console.log(JSON.stringify(resp, null, 2));
    // Shapes:
    // { embedding: number[] }
    if (Array.isArray(resp.data?.embedding)) return resp.data.embedding;
    // { embeddings: number[][] }
    if (Array.isArray(resp.data?.embeddings)) return resp.data.embeddings[0];
    // { data: { embeddings: number[][] } }
    if (Array.isArray(resp.data?.data?.embeddings)) return resp.data.data.embeddings[0];
  } catch (e) {
    // Try legacy /api/embeddings { prompt }
    try {
      const resp2 = await axios.post(
        `${OLLAMA_BASE_URL}/api/embeddings`,
        { model: EMBEDDING_MODEL, prompt: String(text || '') },
        { timeout: 120000 }
      );
      if (Array.isArray(resp2.data?.embedding)) return resp2.data.embedding;
      if (Array.isArray(resp2.data?.embeddings)) return resp2.data.embeddings[0];
      if (Array.isArray(resp2.data?.data?.embeddings)) return resp2.data.data.embeddings[0];
    } catch (_) {}
  }
  throw new Error('Invalid embedding response from Ollama');
}

/**
 * Ensures the Qdrant collection exists with proper vector configuration
 * 
 * @param {number} vectorSize - Dimension of the embedding vectors
 * @returns {Promise<void>}
 */
async function ensureCollection(vectorSize) {
  const c = getClient();
  const collections = await c.getCollections();
  const exists = collections?.collections?.some(col => col.name === QDRANT_COLLECTION);
  if (!exists) {
    await c.createCollection(QDRANT_COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
  }
}

/**
 * Stores document chunks as vectors in Qdrant for RAG retrieval
 * 
 * @swagger
 * /api/vector/upsert:
 *   post:
 *     summary: Store document chunks as vectors
 *     description: |
 *       Converts text chunks to embeddings and stores them in Qdrant
 *       with metadata for later retrieval and similarity search.
 *       
 *       **Process:** Generates embeddings → Creates collection if needed → Upserts vectors
 *       **Metadata:** Includes document ID, text content, page info, and chunk index
 *       
 *     tags: [Vector]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *               - chunks
 *             properties:
 *               documentId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the source document
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               chunks:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/VectorChunk'
 *                 description: Array of text chunks to vectorize
 *               baseMetadata:
 *                 type: object
 *                 properties:
 *                   filename:
 *                     type: string
 *                     description: Original filename
 *                   sourceUrl:
 *                     type: string
 *                     format: uri
 *                     description: Source URL if applicable
 *     responses:
 *       200:
 *         description: Chunks successfully stored as vectors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 upserted:
 *                   type: integer
 *                   description: Number of chunks successfully stored
 *                   example: 25
 *       500:
 *         description: Vector storage failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to store vectors"
 * 
 * @param {string} documentId - Unique identifier for the document
 * @param {Array<VectorChunk>} chunks - Array of text chunks to vectorize
 * @param {Object} baseMetadata - Additional metadata to store with each chunk
 * @returns {Promise<{upserted: number}>} Number of chunks successfully stored
 */
async function upsertChunks(documentId, chunks, baseMetadata = {}) {
  if (!chunks || chunks.length === 0) return { upserted: 0 };
  // Get first embedding to infer dimension and ensure collection
  const firstEmbedding = await getEmbedding(chunks[0].text);

  await ensureCollection(firstEmbedding.length);

  const c = getClient();
  const points = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const vector = i === 0 ? firstEmbedding : await getEmbedding(chunk.text);
    points.push({
      id: uuidv4(),
      vector,
      payload: {
        documentId,
        text: chunk.text,
        page: chunk.page || null,
        chunkIndex: chunk.chunkIndex,
        ...baseMetadata,
      },
    });
  }

  await c.upsert(QDRANT_COLLECTION, {
    wait: true,
    points,
  });

  return { upserted: points.length };
}

/**
 * Searches for similar document chunks using vector similarity
 * 
 * @swagger
 * /api/vector/search:
 *   post:
 *     summary: Search for similar document chunks
 *     description: |
 *       Performs vector similarity search to find the most relevant
 *       document chunks for a given query text.
 *       
 *       **Algorithm:** Cosine similarity on embedding vectors
 *       **Filtering:** Results limited to specific document ID
 *       **Ranking:** Results sorted by similarity score (descending)
 *       
 *     tags: [Vector]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *               - queryText
 *             properties:
 *               documentId:
 *                 type: string
 *                 format: uuid
 *                 description: Document to search within
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               queryText:
 *                 type: string
 *                 description: Text query to find similar chunks
 *                 example: "What are the main findings?"
 *               topK:
 *                 type: integer
 *                 default: 6
 *                 description: Maximum number of results to return
 *                 example: 6
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/VectorSearchResult'
 *       500:
 *         description: Search failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to perform vector search"
 * 
 * @param {string} documentId - Document ID to search within
 * @param {string} queryText - Query text to find similar chunks
 * @param {number} topK - Maximum number of results (default: 6)
 * @returns {Promise<Array<VectorSearchResult>>} Array of search results with scores
 */
async function search(documentId, queryText, topK = 6) {
  const queryEmbedding = await getEmbedding(queryText);
  await ensureCollection(queryEmbedding.length);
  const c = getClient();
  const res = await c.search(QDRANT_COLLECTION, {
    vector: queryEmbedding,
    limit: topK,
    filter: {
      must: [
        { key: 'documentId', match: { value: documentId } }
      ]
    }
  });
  return res; // array of { id, score, payload }
}

module.exports = {
  upsertChunks,
  search,
  ensureCollection,
  getEmbedding,
};


