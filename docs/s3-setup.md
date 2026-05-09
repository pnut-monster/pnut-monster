# S3 + CloudFront Setup for PNUT MONSTER

## Step 1: Create S3 Bucket

```bash
# Install AWS CLI if not already installed
brew install awscli

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (ap-south-1), Output (json)

# Create the bucket
aws s3 mb s3://pnut-monster-assets --region ap-south-1

# Enable versioning (optional but recommended)
aws s3api put-bucket-versioning \
  --bucket pnut-monster-assets \
  --versioning-configuration Status=Enabled
```

## Step 2: Set Bucket Policy (Public Read for CDN)

```bash
aws s3api put-bucket-policy --bucket pnut-monster-assets --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::pnut-monster-assets/*"
    }
  ]
}'
```

## Step 3: Configure CORS on S3

```bash
aws s3api put-bucket-cors --bucket pnut-monster-assets --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": [
        "http://localhost:3000",
        "http://192.168.1.206:3000",
        "https://pnutmonster.com",
        "https://*.pnutmonster.com"
      ],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}'
```

## Step 4: Create CloudFront Distribution

1. Go to AWS Console → CloudFront → Create Distribution
2. Origin Domain: `pnut-monster-assets.s3.ap-south-1.amazonaws.com`
3. Origin Access: Public (since bucket is public)
4. Viewer Protocol Policy: Redirect HTTP to HTTPS
5. Cache Policy: CachingOptimized
6. Alternate Domain: `cdn.pnutmonster.com` (if you have the domain)
7. SSL Certificate: Request one via ACM for `cdn.pnutmonster.com`

Or via CLI:

```bash
aws cloudfront create-distribution \
  --origin-domain-name pnut-monster-assets.s3.ap-south-1.amazonaws.com \
  --default-root-object index.html
```

Note the CloudFront distribution domain (e.g., `d1234abcdef.cloudfront.net`)

## Step 5: Create IAM User for App

```bash
# Create IAM user
aws iam create-user --user-name pnut-monster-app

# Create access key
aws iam create-access-key --user-name pnut-monster-app
# Save the AccessKeyId and SecretAccessKey!

# Attach S3 policy
aws iam put-user-policy --user-name pnut-monster-app --policy-name PnutMonsterS3 --policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::pnut-monster-assets",
        "arn:aws:s3:::pnut-monster-assets/*"
      ]
    }
  ]
}'
```

## Step 6: Update .env.local

```env
AWS_S3_BUCKET=pnut-monster-assets
AWS_S3_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<from step 5>
AWS_SECRET_ACCESS_KEY=<from step 5>
NEXT_PUBLIC_CDN_URL=https://d1234abcdef.cloudfront.net
```

## Step 7: Create Folder Structure in S3

```bash
# Create folders
for folder in menu categories outlets avatars banners campaigns brand; do
  aws s3api put-object --bucket pnut-monster-assets --key "$folder/"
done
```

## S3 Folder Structure

```
pnut-monster-assets/
├── menu/            → Menu item images
├── categories/      → Category images
├── outlets/         → Outlet photos
├── avatars/         → User profile pictures
├── banners/         → Homepage banners
├── campaigns/       → Campaign images
└── brand/           → Logo, assets
```

## How It Works in the App

1. Admin/user selects an image file
2. Frontend calls `POST /api/upload` with folder + filename
3. API returns a presigned S3 PUT URL + CDN URL
4. Frontend uploads directly to S3 via presigned URL (no server bandwidth)
5. CDN URL is stored in the database
6. All `<img>` tags use the CDN URL for fast delivery
