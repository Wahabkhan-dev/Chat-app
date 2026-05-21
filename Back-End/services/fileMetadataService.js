const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * File Metadata Service - Track uploaded files and link them to conversations
 */

/**
 * Create file metadata record
 */
async function createFileMetadata(r2Key, conversationId, userId, originalName, fileType, mimeType, fileSize, originMessageId = null) {
  try {
    const fileId = uuidv4();

    const [result] = await pool.query(
      `INSERT INTO file_metadata (id, r2_key, conversation_id, user_id, original_name, file_type, mime_type, file_size, uploaded_at, origin_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [fileId, r2Key, conversationId, userId, originalName, fileType, mimeType, fileSize, originMessageId]
    );

    return {
      id: fileId,
      r2Key,
      conversationId,
      userId,
      originalName,
      fileType,
      mimeType,
      fileSize,
      uploadedAt: new Date().toISOString(),
      originMessageId: originMessageId,
    };
  } catch (error) {
    console.error('Error creating file metadata:', error.message);
    // Fallback for older schemas without origin_message_id column
    if (error && error.message && error.message.includes('Unknown column') && String(error.message).includes('origin_message_id')) {
      try {
        const fileId = uuidv4();
        const [result2] = await pool.query(
          `INSERT INTO file_metadata (id, r2_key, conversation_id, user_id, original_name, file_type, mime_type, file_size, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [fileId, r2Key, conversationId, userId, originalName, fileType, mimeType, fileSize]
        );
        console.log('Fallback insert succeeded for r2Key=', r2Key);
        return {
          id: fileId,
          r2Key,
          conversationId,
          userId,
          originalName,
          fileType,
          mimeType,
          fileSize,
          uploadedAt: new Date().toISOString(),
          originMessageId: null,
        };
      } catch (e2) {
        console.error('Fallback insert also failed:', e2.message);
        throw e2;
      }
    }
    throw error;
  }
}

/**
 * Get file metadata by R2 key
 */
async function getFileMetadata(r2Key) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata WHERE r2_key = ?`,
      [r2Key]
    );

    if (rows.length === 0) return null;

    return formatFileMetadata(rows[0]);
  } catch (error) {
    console.error('Error getting file metadata:', error.message);
    throw error;
  }
}

/**
 * Get all files in a conversation
 */
async function getConversationFiles(conversationId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata WHERE conversation_id = ? ORDER BY uploaded_at DESC`,
      [conversationId]
    );

    return rows.map(row => formatFileMetadata(row));
  } catch (error) {
    console.error('Error getting conversation files:', error.message);
    throw error;
  }
}

/**
 * Get all files uploaded by a user
 */
async function getUserFiles(userId, limit = 100) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT ?`,
      [userId, limit]
    );

    return rows.map(row => formatFileMetadata(row));
  } catch (error) {
    console.error('Error getting user files:', error.message);
    throw error;
  }
}

/**
 * Delete file metadata (when file is deleted or conversation is cleared)
 */
async function deleteFileMetadata(r2Key) {
  try {
    const [result] = await pool.query(
      `DELETE FROM file_metadata WHERE r2_key = ?`,
      [r2Key]
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error deleting file metadata:', error.message);
    throw error;
  }
}

/**
 * Get file metadata by ID
 */
async function getFileMetadataById(fileId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata WHERE id = ?`,
      [fileId]
    );

    if (rows.length === 0) return null;

    return formatFileMetadata(rows[0]);
  } catch (error) {
    console.error('Error getting file metadata by ID:', error.message);
    throw error;
  }
}

/**
 * Search files in a conversation
 */
async function searchConversationFiles(conversationId, searchQuery) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata
       WHERE conversation_id = ? AND (original_name LIKE ? OR file_type LIKE ?)
       ORDER BY uploaded_at DESC`,
      [conversationId, `%${searchQuery}%`, `%${searchQuery}%`]
    );

    return rows.map(row => formatFileMetadata(row));
  } catch (error) {
    console.error('Error searching files:', error.message);
    throw error;
  }
}

/**
 * Get files by type in a conversation (images, videos, documents, etc.)
 */
async function getConversationFilesByType(conversationId, fileType) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM file_metadata WHERE conversation_id = ? AND file_type = ? ORDER BY uploaded_at DESC`,
      [conversationId, fileType]
    );

    return rows.map(row => formatFileMetadata(row));
  } catch (error) {
    console.error('Error getting files by type:', error.message);
    throw error;
  }
}

/**
 * Format file metadata row from database
 */
function formatFileMetadata(row) {
  return {
    id: row.id,
    r2Key: row.r2_key,
    conversationId: row.conversation_id,
    userId: row.user_id,
    originalName: row.original_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    uploadedAt: row.uploaded_at?.toISOString(),
    originMessageId: row.origin_message_id || null,
  };
}

module.exports = {
  createFileMetadata,
  getFileMetadata,
  getFileMetadataById,
  getConversationFiles,
  getUserFiles,
  deleteFileMetadata,
  searchConversationFiles,
  getConversationFilesByType,
};
