/**
 * Shared S3 utility module
 *
 * Extracts the lazy S3 client pattern used by export.ts and data-pipeline.ts
 * into a single reusable module.
 *
 * Environment variables:
 *   AWS_REGION       — AWS region (default: us-east-1)
 *   KB_S3_BUCKET     — S3 bucket for knowledge base storage
 *   KB_S3_PREFIX     — Key prefix inside the bucket (default: knowledge-base)
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Lazy singleton
let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return client;
}

/**
 * Upload data to S3. Returns the bucket, key, and s3:// URL.
 */
export async function uploadToS3(
  data: string | Buffer,
  options: { bucket: string; key: string; contentType?: string }
): Promise<{ bucket: string; key: string; url: string }> {
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: options.key,
      Body: data,
      ContentType: options.contentType || "application/octet-stream",
    })
  );

  return {
    bucket: options.bucket,
    key: options.key,
    url: `s3://${options.bucket}/${options.key}`,
  };
}

/**
 * Check whether an object exists in S3 (used for content-addressed dedup).
 * Returns true if the object exists, false otherwise.
 */
export async function headS3Object(bucket: string, key: string): Promise<boolean> {
  const s3 = getS3Client();
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

export async function headS3ObjectSize(bucket: string, key: string): Promise<number | null> {
  const s3 = getS3Client();
  try {
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return typeof result.ContentLength === "number" ? result.ContentLength : null;
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function downloadS3ObjectText(options: {
  bucket: string;
  key: string;
  maxBytes?: number;
}): Promise<string | null> {
  const s3 = getS3Client();
  const size = await headS3ObjectSize(options.bucket, options.key);
  if (size === null) return null;
  if (options.maxBytes && size > options.maxBytes) {
    return null;
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: options.bucket,
      Key: options.key,
    })
  );

  const body = response.Body;
  if (!body || !(body instanceof Readable)) {
    return null;
  }

  return streamToString(body);
}
