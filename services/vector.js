const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'pdf_chunks';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'mxbai-embed-large';

let client;

function getClient() {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  }
  return client;
}

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


