const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
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

module.exports = { r2, generateSignedUrl };
