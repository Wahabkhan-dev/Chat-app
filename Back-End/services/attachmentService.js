/**
 * Attachment Service
 * Handles file URL generation, expiry management, and automatic refresh
 */

const crypto = require('crypto');
const { r2 } = require('../config/r2');
require('dotenv').config();

class AttachmentService {
  constructor() {
    this.urlCache = new Map(); // Cache of generated presigned URLs
    this.fileExpiryWarnings = new Map(); // Track files approaching expiry
  }

  /**
   * Generate presigned R2 URL with extended expiry
   */
  async generatePresignedUrl(fileKey, expirySeconds = 7200) {
    try {
      // Check cache first
      if (this.urlCache.has(fileKey)) {
        const { url, expiryTime } = this.urlCache.get(fileKey);
        // Use cached URL if still valid for at least 5 minutes
        if (Date.now() < (expiryTime - 300000)) {
          return url;
        }
      }

      if (!r2 || !fileKey) {
        throw new Error('R2 not configured or invalid file key');
      }

      const command = new (require('@aws-sdk/client-s3').GetObjectCommand)({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
      });

      const url = await (require('@aws-sdk/s3-request-presigner').getSignedUrl)(r2, command, {
        expiresIn: expirySeconds,
      });

      // Cache the URL
      const expiryTime = Date.now() + (expirySeconds * 1000);
      this.urlCache.set(fileKey, { url, expiryTime });

      return url;
    } catch (err) {
      console.error('[AttachmentService] Failed to generate presigned URL:', err);
      throw err;
    }
  }

  /**
   * Get URL with automatic refresh if expiring soon
   */
  async getUrlWithRefresh(fileKey, expiryThresholdMs = 3600000) {
    try {
      const url = await this.generatePresignedUrl(fileKey);
      return url;
    } catch (err) {
      console.error('[AttachmentService] getUrlWithRefresh failed:', err);
      throw err;
    }
  }

  /**
   * Validate file exists in R2
   */
  async validateFileExists(fileKey) {
    try {
      if (!r2) return false;

      const command = new (require('@aws-sdk/client-s3').HeadObjectCommand)({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
      });

      await r2.send(command);
      return true;
    } catch (err) {
      if (err.name === 'NotFound') return false;
      console.error('[AttachmentService] File existence check failed:', err);
      return false;
    }
  }

  /**
   * Delete file from R2
   */
  async deleteFile(fileKey) {
    try {
      if (!r2 || !fileKey) return false;

      const command = new (require('@aws-sdk/client-s3').DeleteObjectCommand)({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
      });

      await r2.send(command);
      this.urlCache.delete(fileKey);
      this.fileExpiryWarnings.delete(fileKey);
      return true;
    } catch (err) {
      console.error('[AttachmentService] File deletion failed:', err);
      return false;
    }
  }

  /**
   * Get file metadata from R2
   */
  async getFileMetadata(fileKey) {
    try {
      if (!r2) return null;

      const command = new (require('@aws-sdk/client-s3').HeadObjectCommand)({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileKey,
      });

      const response = await r2.send(command);
      return {
        key: fileKey,
        size: response.ContentLength,
        lastModified: response.LastModified,
        contentType: response.ContentType,
        etag: response.ETag,
      };
    } catch (err) {
      console.error('[AttachmentService] Metadata retrieval failed:', err);
      return null;
    }
  }

  /**
   * Batch validate multiple files exist
   */
  async validateFilesExist(fileKeys = []) {
    const results = {};
    for (const key of fileKeys) {
      results[key] = await this.validateFileExists(key);
    }
    return results;
  }

  /**
   * Generate batch presigned URLs (prevents N+1)
   */
  async generateBatchPresignedUrls(fileKeys = []) {
    const urls = {};
    for (const key of fileKeys) {
      try {
        urls[key] = await this.generatePresignedUrl(key);
      } catch (err) {
        console.error(`[AttachmentService] Failed to generate URL for ${key}:`, err);
        urls[key] = null;
      }
    }
    return urls;
  }

  /**
   * Clear URL cache
   */
  clearCache() {
    this.urlCache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      cachedUrls: this.urlCache.size,
      expiryWarnings: this.fileExpiryWarnings.size,
    };
  }
}

const attachmentService = new AttachmentService();

// Cleanup stale cache entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, { expiryTime }] of attachmentService.urlCache.entries()) {
    if (now > expiryTime) {
      attachmentService.urlCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[AttachmentService] Cleaned ${cleaned} expired URLs from cache`);
  }
}, 600000); // Every 10 minutes

module.exports = attachmentService;
