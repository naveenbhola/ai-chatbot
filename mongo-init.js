// MongoDB initialization script
db = db.getSiblingDB('pdf-chat');

// Create collections
db.createCollection('documents');
db.createCollection('chats');

// Create indexes for better performance
db.documents.createIndex({ "documentId": 1 }, { unique: true });
db.documents.createIndex({ "uploadDate": -1 });

db.chats.createIndex({ "sessionId": 1 }, { unique: true });
db.chats.createIndex({ "documentId": 1 });
db.chats.createIndex({ "createdAt": -1 });

print('MongoDB initialized successfully');

