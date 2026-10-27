const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // ← fixes presigned URL format for Cloudflare R2
});

/**
 * Generate a presigned GET URL for a private R2 object.
 * @param {string} key   - R2 object key (e.g. "chats/dm_1_2/1234-abc.jpg")
 * @param {number} expiresIn - Seconds until the URL expires (default 300)
 */
async function generateSignedUrl(key, expiresIn = 300) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Generate a presigned PUT URL so the client can upload a file directly to R2, bypassing
 * the server entirely for the actual bytes (no multer buffering, no Node event-loop blocking
 * on a big file — see routes/upload.js's /presign and /complete routes).
 * @param {string} key    - R2 object key to write to
 * @param {string} contentType - must match the Content-Type header the client sends with the PUT
 * @param {number} expiresIn - seconds until the URL expires (default 900 = 15 min)
 */
async function generateUploadUrl(key, contentType, expiresIn = 900) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

module.exports = { r2, generateSignedUrl, generateUploadUrl };