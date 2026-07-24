import { Storage } from '@google-cloud/storage';
import logger from './logger';

// Lazy initialization - only create storage when actually needed
function getStorage() {
  if (!process.env.GCS_BUCKET_NAME || !process.env.GCS_PROJECT_ID) {
    logger.error('GCS configuration missing. Please set up environment variables.');
    throw new Error('GCS is not configured.');
  }

  const storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
   logger.debug('Google Cloud Storage initialized successfully');
  return storage;
}

function getBucket() {
  const storage = getStorage();
  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
  logger.debug({ bucketName: bucket.name }, 'Using GCS bucket');
  return bucket;
}

export interface UploadOptions {
  isPublic: boolean;
}

/**
 * Upload file to GCS with public or private access
 */
export async function uploadToGCS(
  file: Buffer,
  filename: string,
  mimetype: string,
  options: UploadOptions
): Promise<string> {
  const bucket = getBucket();
  
  // Create path based on visibility
  const folder = options.isPublic ? 'public' : 'private';
  const timestamp = Date.now();
  const path = `uploads/${folder}/${timestamp}-${filename}`;
  
  const blob = bucket.file(path);
  logger.info({ path, isPublic: options.isPublic }, 'Starting GCS upload');

  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: {
      contentType: mimetype,
    },
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', (err) => {
      logger.error({ err, path }, 'GCS upload failed');
      reject(err);
    });

    blobStream.on('finish', async () => {
      try {
        if (options.isPublic) {
          // Make file publicly readable
          await blob.makePublic();
          logger.info({ path }, 'File made public');
        }
        
        // Return public URL for both (private will use signed URLs later)
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
        logger.info({ publicUrl }, 'File uploaded successfully');
        resolve(publicUrl);
      } catch (error) {
        logger.error({ error, path }, 'Error finalizing upload');
        reject(error);
      }
    });

    blobStream.end(file);
  });
}

/**
 * Generate a signed URL for private file access (valid for 15 minutes)
 */
export async function generateSignedUrl(fileUrl: string): Promise<string> {
  const bucket = getBucket();
  
  // Extract path from URL
  const bucketName = process.env.GCS_BUCKET_NAME!;
  const path = fileUrl.replace(`https://storage.googleapis.com/${bucketName}/`, '');
  
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  });
  logger.info({ path }, 'Generated signed URL');
  return url;
}