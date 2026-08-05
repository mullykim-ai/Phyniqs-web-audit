import{PutObjectCommand,S3Client}from"@aws-sdk/client-s3";import{config}from"./config.js";
const s3=new S3Client({endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:config.S3_ACCESS_KEY_ID,secretAccessKey:config.S3_SECRET_ACCESS_KEY}});
export async function upload(key:string,body:Uint8Array|string,contentType:string){await s3.send(new PutObjectCommand({Bucket:config.S3_BUCKET,Key:key,Body:body,ContentType:contentType}));return config.S3_PUBLIC_BASE_URL?`${config.S3_PUBLIC_BASE_URL.replace(/\/$/,"")}/${key}`:`s3://${config.S3_BUCKET}/${key}`}
