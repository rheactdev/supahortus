# Ente - End-to-End Encrypted Cloud Platform

Ente is a fully open source, end-to-end encrypted platform for storing data in the cloud without trusting the service provider. The platform uses zero-knowledge encryption architecture where all data is encrypted client-side before upload, ensuring the server cannot decrypt user content. Built on a Go-based API server (Museum) with PostgreSQL storage and S3-compatible object storage, Ente provides the foundation for multiple applications including Ente Photos (alternative to Google Photos) and Ente Auth (open-source 2FA authenticator).

The monorepo contains client applications for iOS, Android, Web, Desktop (Linux/macOS/Windows), a Go-based CLI tool, and the server infrastructure. Authentication uses Secure Remote Password (SRP) protocol with support for 2FA (TOTP and passkeys via WebAuthn). The encryption hierarchy flows from master password → Key Encryption Key (KEK) via Argon2 → Master Key → individual file/collection keys. The platform has been externally audited by Cure53, Symbolic Software, and Fallible.

## Authentication APIs

### SRP Login Flow

Complete authentication sequence using Secure Remote Password protocol with optional two-factor authentication.

```bash
# Step 1: Get SRP attributes for user
curl -X GET "https://api.ente.io/users/srp/attributes?email=user@example.com"

# Response:
# {
#   "srpUserID": "550e8400-e29b-41d4-a716-446655440000",
#   "srpSalt": "base64_encoded_salt_string",
#   "memLimit": 1073741824,
#   "opsLimit": 4,
#   "kekSalt": "base64_encoded_kek_salt",
#   "isEmailMFAEnabled": false
# }

# Step 2: Create SRP session
curl -X POST "https://api.ente.io/users/srp/create-session" \
  -H "Content-Type: application/json" \
  -d '{
    "srpUserID": "550e8400-e29b-41d4-a716-446655440000",
    "srpA": "base64_encoded_srp_a_value"
  }'

# Response:
# {
#   "sessionID": "660e8400-e29b-41d4-a716-446655440001",
#   "srpB": "base64_encoded_srp_b_value"
# }

# Step 3: Verify session with M1
curl -X POST "https://api.ente.io/users/srp/verify-session" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionID": "660e8400-e29b-41d4-a716-446655440001",
    "srpUserID": "550e8400-e29b-41d4-a716-446655440000",
    "srpM1": "base64_encoded_m1_proof"
  }'

# Response (without 2FA):
# {
#   "id": 12345,
#   "keyAttributes": {
#     "kekSalt": "...",
#     "encryptedKey": "...",
#     "keyDecryptionNonce": "...",
#     "publicKey": "...",
#     "encryptedSecretKey": "...",
#     "secretKeyDecryptionNonce": "...",
#     "memLimit": 1073741824,
#     "opsLimit": 4
#   },
#   "encryptedToken": "base64_encrypted_auth_token",
#   "token": "jwt_auth_token"
# }

# Response (with 2FA enabled):
# {
#   "id": 12345,
#   "keyAttributes": {...},
#   "twoFactorSessionID": "770e8400-e29b-41d4-a716-446655440002"
# }

# Step 4: Verify 2FA (if required)
curl -X POST "https://api.ente.io/users/two-factor/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionID": "770e8400-e29b-41d4-a716-446655440002",
    "code": "123456"
  }'

# Response:
# {
#   "id": 12345,
#   "keyAttributes": {...},
#   "encryptedToken": "base64_encrypted_auth_token",
#   "token": "jwt_auth_token"
# }
```

### Email-Based Authentication

Simple email verification flow for signup and account recovery without SRP setup.

```bash
# Step 1: Request one-time token
curl -X POST "https://api.ente.io/users/ott" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "purpose": "signup",
    "mobile": false
  }'

# Response: 200 OK (OTT sent to email)

# Step 2: Verify email with OTT
curl -X POST "https://api.ente.io/users/verify-email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "ott": "123456",
    "source": "web"
  }'

# Response:
# {
#   "id": 12346,
#   "token": "jwt_auth_token",
#   "keyAttributes": null,
#   "subscription": {
#     "productID": "free",
#     "storage": 10737418240,
#     "expiryTime": 1735516800
#   }
# }
```

### Two-Factor Authentication Setup

Enable TOTP-based two-factor authentication for enhanced account security.

```bash
# Step 1: Generate 2FA secret
curl -X POST "https://api.ente.io/users/two-factor/setup" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "secretCode": "JBSWY3DPEHPK3PXP",
#   "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
# }

# Step 2: Enable 2FA with verification code
curl -X POST "https://api.ente.io/users/two-factor/enable" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456",
    "encryptedTwoFactorSecret": "base64_encrypted_secret",
    "twoFactorSecretDecryptionNonce": "base64_nonce"
  }'

# Response: 200 OK

# Check 2FA status
curl -X GET "https://api.ente.io/users/two-factor/status" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "status": "enabled"
# }
```

### Passkey Authentication (WebAuthn)

Modern passwordless authentication using FIDO2/WebAuthn passkeys.

```bash
# Step 1: Begin passkey registration
curl -X POST "https://api.ente.io/passkeys/registration/begin" \
  -H "X-Auth-Token: your_accounts_jwt"

# Response:
# {
#   "publicKey": {
#     "challenge": "base64_challenge",
#     "rp": {
#       "name": "Ente",
#       "id": "accounts.ente.io"
#     },
#     "user": {
#       "id": "base64_user_id",
#       "name": "user@example.com",
#       "displayName": "user@example.com"
#     },
#     "pubKeyCredParams": [...],
#     "timeout": 60000,
#     "attestation": "none"
#   },
#   "ceremonySessionID": "ceremony_session_uuid"
# }

# Step 2: Complete registration (after WebAuthn ceremony)
curl -X POST "https://api.ente.io/passkeys/registration/finish" \
  -H "X-Auth-Token: your_accounts_jwt" \
  -H "Content-Type: application/json" \
  -d '{
    "ceremonySessionID": "ceremony_session_uuid",
    "response": {
      "id": "credential_id",
      "rawId": "base64_raw_id",
      "response": {
        "attestationObject": "base64_attestation",
        "clientDataJSON": "base64_client_data"
      },
      "type": "public-key"
    }
  }'

# Response: 200 OK

# List user's passkeys
curl -X GET "https://api.ente.io/passkeys" \
  -H "X-Auth-Token: your_accounts_jwt"

# Response:
# [
#   {
#     "id": "passkey_uuid",
#     "credentialID": "base64_credential_id",
#     "friendlyName": "MacBook Pro",
#     "createdAt": 1702857600
#   }
# ]

# Delete a passkey
curl -X DELETE "https://api.ente.io/passkeys/passkey_uuid" \
  -H "X-Auth-Token: your_accounts_jwt"

# Response: 200 OK
```

## File Management APIs

### File Upload

Upload files to encrypted cloud storage with multipart support for large files.

```bash
# Single file upload - Step 1: Get upload URL
curl -X POST "https://api.ente.io/files/upload-url" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "contentLength": 1048576,
    "contentMD5": "base64_md5_hash"
  }'

# Response:
# {
#   "objectKey": "encrypted_object_key_uuid",
#   "url": "https://s3.eu-central-003.backblazeb2.com/ente-bucket/path?signature=..."
# }

# Step 2: Upload to S3 URL
curl -X PUT "https://s3.eu-central-003.backblazeb2.com/ente-bucket/path?signature=..." \
  -H "Content-Type: application/octet-stream" \
  -H "Content-MD5: base64_md5_hash" \
  --data-binary @encrypted_file.bin

# Response: 200 OK (from S3)

# Step 3: Create file metadata
curl -X POST "https://api.ente.io/files" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 0,
    "collectionID": 123,
    "encryptedKey": "base64_encrypted_file_key",
    "keyDecryptionNonce": "base64_nonce",
    "file": {
      "objectKey": "encrypted_object_key_uuid",
      "encryptedData": "base64_encrypted_filename_metadata",
      "decryptionHeader": "base64_header",
      "size": 1048576
    },
    "thumbnail": {
      "objectKey": "thumb_object_key_uuid",
      "encryptedData": "base64_encrypted_thumb_metadata",
      "decryptionHeader": "base64_header",
      "size": 51200
    },
    "metadata": {
      "encryptedData": "base64_encrypted_exif_metadata",
      "decryptionHeader": "base64_header"
    }
  }'

# Response:
# {
#   "id": 98765,
#   "ownerID": 12345,
#   "collectionID": 123,
#   "encryptedKey": "base64_encrypted_file_key",
#   "keyDecryptionNonce": "base64_nonce",
#   "file": {...},
#   "thumbnail": {...},
#   "metadata": {...},
#   "isDeleted": false,
#   "updationTime": 1702857600000000
# }

# Multipart upload for large files (>100MB)
curl -X POST "https://api.ente.io/files/multipart-upload-url" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "contentLength": 524288000,
    "partLength": 10485760,
    "partMd5s": ["md5_part1", "md5_part2", "..."]
  }'

# Response:
# {
#   "objectKey": "encrypted_object_key_uuid",
#   "partURLs": [
#     "https://s3.../part1?signature=...",
#     "https://s3.../part2?signature=...",
#     "..."
#   ],
#   "completeURL": "https://s3.../complete?uploadId=..."
# }

# Upload each part to its URL, then complete multipart upload
curl -X POST "https://s3.../complete?uploadId=..." \
  -H "Content-Type: application/xml" \
  -d '<CompleteMultipartUpload>
    <Part><PartNumber>1</PartNumber><ETag>"etag1"</ETag></Part>
    <Part><PartNumber>2</PartNumber><ETag>"etag2"</ETag></Part>
  </CompleteMultipartUpload>'
```

### File Download and Preview

Download encrypted files and thumbnails with automatic S3 redirect.

```bash
# Download file (redirects to S3)
curl -X GET "https://api.ente.io/files/download/98765" \
  -H "X-Auth-Token: your_auth_token" \
  -L -o encrypted_file.bin

# Download thumbnail (redirects to S3)
curl -X GET "https://api.ente.io/files/preview/98765" \
  -H "X-Auth-Token: your_auth_token" \
  -L -o encrypted_thumbnail.bin

# Get file information including sizes
curl -X POST "https://api.ente.io/files/info" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "fileIDs": [98765, 98766, 98767]
  }'

# Response:
# {
#   "filesInfo": [
#     {
#       "id": 98765,
#       "fileInfo": {
#         "fileSize": 1048576,
#         "thumbSize": 51200
#       }
#     },
#     {
#       "id": 98766,
#       "fileInfo": {
#         "fileSize": 2097152,
#         "thumbSize": 61440
#       }
#     }
#   ]
# }
```

### File Operations

Copy, move, trash, and restore files across collections.

```bash
# Copy files between collections
curl -X POST "https://api.ente.io/files/copy" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "srcCollectionID": 123,
    "dstCollectionID": 456,
    "files": [
      {
        "id": 98765,
        "encryptedKey": "base64_reencrypted_key_for_dst_collection",
        "keyDecryptionNonce": "base64_nonce"
      }
    ]
  }'

# Response:
# {
#   "oldToNewFileIDMap": {
#     "98765": 98800
#   }
# }

# Move files to trash
curl -X POST "https://api.ente.io/files/trash" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "fileID": 98765,
        "collectionID": 123
      },
      {
        "fileID": 98766,
        "collectionID": 123
      }
    ]
  }'

# Response: 200 OK

# Update file magic metadata (for client-side features)
curl -X PUT "https://api.ente.io/files/magic-metadata" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "metadataList": [
      {
        "id": 98765,
        "magicMetadata": {
          "version": 1,
          "count": 3,
          "data": "base64_encrypted_magic_metadata",
          "header": "base64_header"
        }
      }
    ]
  }'

# Response: 200 OK

# Get duplicate files for deduplication
curl -X GET "https://api.ente.io/files/duplicates" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "duplicates": [
#     {
#       "fileIDs": [98765, 98801],
#       "size": 1048576
#     },
#     {
#       "fileIDs": [98766, 98802, 98803],
#       "size": 2097152
#     }
#   ]
# }
```

### File Machine Learning Data

Store and retrieve ML embeddings and preview images for advanced features.

```bash
# Upload ML data (face embeddings, CLIP vectors, etc.)
curl -X PUT "https://api.ente.io/files/data" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mldata",
    "objectKey": "ml_object_key_uuid",
    "encryptedData": "base64_encrypted_ml_embeddings",
    "decryptionHeader": "base64_header",
    "fileID": 98765
  }'

# Response: 200 OK

# Fetch ML data for multiple files
curl -X POST "https://api.ente.io/files/data/fetch" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [98765, 98766, 98767],
    "dataType": "mldata"
  }'

# Response:
# [
#   {
#     "fileID": 98765,
#     "objectKey": "ml_object_key_uuid",
#     "encryptedData": "base64_encrypted_ml_embeddings",
#     "decryptionHeader": "base64_header",
#     "size": 16384,
#     "replicaIndex": 0
#   }
# ]

# Get file data status diff (for syncing)
curl -X POST "https://api.ente.io/files/data/status-diff" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "sinceTime": 0,
    "limit": 500
  }'

# Response:
# {
#   "diff": [
#     {
#       "fileID": 98765,
#       "previewStatus": "ready",
#       "mlDataStatus": "ready"
#     }
#   ],
#   "timestamp": 1702857600000000
# }
```

## Collection Management APIs

### Collection Operations

Create and manage albums, folders, and shared collections.

```bash
# Create collection
curl -X POST "https://api.ente.io/collections" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedKey": "base64_encrypted_collection_key",
    "keyDecryptionNonce": "base64_nonce",
    "encryptedName": "base64_encrypted_collection_name",
    "nameDecryptionNonce": "base64_nonce",
    "type": "album",
    "attributes": {
      "encryptedPath": "",
      "pathDecryptionNonce": "",
      "version": 1
    }
  }'

# Response:
# {
#   "id": 456,
#   "owner": {
#     "id": 12345,
#     "email": "user@example.com",
#     "role": "owner"
#   },
#   "encryptedKey": "base64_encrypted_collection_key",
#   "keyDecryptionNonce": "base64_nonce",
#   "encryptedName": "base64_encrypted_collection_name",
#   "nameDecryptionNonce": "base64_nonce",
#   "type": "album",
#   "attributes": {...},
#   "sharees": [],
#   "updationTime": 1702857600000000,
#   "isDeleted": false
# }

# List all collections with pagination
curl -X GET "https://api.ente.io/collections/v3?sinceTime=0&limit=1000" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "owned": [
#     {
#       "id": 456,
#       "owner": {...},
#       "encryptedKey": "...",
#       "type": "album",
#       "sharees": []
#     }
#   ],
#   "shared": [
#     {
#       "id": 789,
#       "owner": {"id": 67890, "email": "friend@example.com"},
#       "encryptedKey": "...",
#       "type": "album",
#       "sharees": [{"id": 12345, "role": "viewer"}]
#     }
#   ]
# }

# Get collection diff (files added/removed)
curl -X GET "https://api.ente.io/collections/v2/diff?collectionID=456&sinceTime=0" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "diff": [
#     {
#       "id": 98765,
#       "ownerID": 12345,
#       "collectionID": 456,
#       "encryptedKey": "...",
#       "file": {...},
#       "thumbnail": {...},
#       "metadata": {...},
#       "isDeleted": false,
#       "updationTime": 1702857600000000
#     }
#   ],
#   "hasMore": false
# }

# Add files to collection
curl -X POST "https://api.ente.io/collections/add-files" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionID": 456,
    "files": [
      {
        "id": 98765,
        "encryptedKey": "base64_file_key_encrypted_with_collection_key",
        "keyDecryptionNonce": "base64_nonce"
      }
    ]
  }'

# Response: 200 OK

# Rename collection
curl -X POST "https://api.ente.io/collections/rename" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionID": 456,
    "encryptedName": "base64_encrypted_new_name",
    "nameDecryptionNonce": "base64_nonce"
  }'

# Response: 200 OK

# Trash collection
curl -X DELETE "https://api.ente.io/collections/v3/456" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK
```

### Collection Sharing

Share collections privately with specific users or publicly via URLs.

```bash
# Share collection with user
curl -X POST "https://api.ente.io/collections/share" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionID": 456,
    "email": "friend@example.com",
    "encryptedKey": "base64_collection_key_encrypted_with_recipient_public_key",
    "role": "viewer"
  }'

# Response: 200 OK

# Get sharees list
curl -X GET "https://api.ente.io/collections/sharees?collectionID=456" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# [
#   {
#     "id": 67890,
#     "email": "friend@example.com",
#     "role": "viewer"
#   },
#   {
#     "id": 11111,
#     "email": "collaborator@example.com",
#     "role": "collaborator"
#   }
# ]

# Unshare collection
curl -X POST "https://api.ente.io/collections/unshare" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionID": 456,
    "email": "friend@example.com"
  }'

# Response: 200 OK

# Create public share URL
curl -X POST "https://api.ente.io/collections/share-url" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "collectionID": 456,
    "passHash": "optional_password_hash_for_protection",
    "validTill": 1735516800,
    "enableDownload": true,
    "enableCollect": false,
    "deviceLimit": 0
  }'

# Response:
# {
#   "url": "https://albums.ente.io/#shareable_token_uuid",
#   "deviceLimit": 0,
#   "validTill": 1735516800,
#   "enableDownload": true,
#   "enableCollect": false,
#   "passwordEnabled": true
# }

# Access public collection (no auth required, but needs access token)
curl -X GET "https://api.ente.io/public-collection/info" \
  -H "X-Auth-Access-Token: shareable_token_uuid" \
  -H "X-Auth-Access-Token-JWT: password_verification_jwt"

# Response:
# {
#   "collection": {
#     "id": 456,
#     "owner": {"id": 12345, "email": "user@example.com"},
#     "encryptedKey": "...",
#     "encryptedName": "...",
#     "publicURLs": [...]
#   },
#   "isOwner": false
# }
```

## Authenticator APIs

### TOTP Management

Store and sync encrypted 2FA authenticator codes in the cloud.

```bash
# Create encryption key for authenticator data
curl -X POST "https://api.ente.io/authenticator/key" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedKey": "base64_encrypted_authenticator_key",
    "header": "base64_encryption_header"
  }'

# Response: 200 OK

# Get encryption key
curl -X GET "https://api.ente.io/authenticator/key" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "encryptedKey": "base64_encrypted_authenticator_key",
#   "header": "base64_encryption_header"
# }

# Create TOTP entity
curl -X POST "https://api.ente.io/authenticator/entity" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "encryptedData": "base64_encrypted_totp_secret_and_metadata",
    "header": "base64_encryption_header"
  }'

# Response:
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "userID": 12345,
#   "encryptedData": "base64_encrypted_totp_secret_and_metadata",
#   "header": "base64_encryption_header",
#   "isDeleted": false,
#   "createdAt": 1702857600000000,
#   "updatedAt": 1702857600000000
# }

# Update TOTP entity
curl -X PUT "https://api.ente.io/authenticator/entity" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "encryptedData": "base64_encrypted_updated_data",
    "header": "base64_encryption_header"
  }'

# Response: 200 OK

# Delete TOTP entity
curl -X DELETE "https://api.ente.io/authenticator/entity?id=550e8400-e29b-41d4-a716-446655440000" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK

# Get entity diff for syncing
curl -X GET "https://api.ente.io/authenticator/entity/diff?sinceTime=0&limit=500" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "diff": [
#     {
#       "id": "550e8400-e29b-41d4-a716-446655440000",
#       "userID": 12345,
#       "encryptedData": "...",
#       "header": "...",
#       "isDeleted": false,
#       "createdAt": 1702857600000000,
#       "updatedAt": 1702857600000000
#     }
#   ],
#   "timestamp": 1702857700000000
# }
```

## Billing and Subscription APIs

### Plan Management

Manage subscriptions, payments, and storage plans across multiple providers.

```bash
# Get available plans
curl -X GET "https://api.ente.io/billing/plans/v2"

# Response:
# {
#   "plans": [
#     {
#       "id": "lite",
#       "storage": 21474836480,
#       "price": "$2.99",
#       "period": "month",
#       "stripeID": "price_stripe_id"
#     },
#     {
#       "id": "standard",
#       "storage": 107374182400,
#       "price": "$5.99",
#       "period": "month",
#       "stripeID": "price_stripe_id"
#     },
#     {
#       "id": "pro",
#       "storage": 1099511627776,
#       "price": "$15.99",
#       "period": "month",
#       "stripeID": "price_stripe_id"
#     }
#   ],
#   "freePlan": {
#     "storage": 10737418240,
#     "duration": 100,
#     "period": "days"
#   }
# }

# Get current subscription
curl -X GET "https://api.ente.io/billing/subscription" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "id": 1001,
#   "userID": 12345,
#   "productID": "lite",
#   "storage": 21474836480,
#   "originalTransactionID": "sub_1234567890",
#   "expiryTime": 1735516800,
#   "paymentProvider": "stripe",
#   "attributes": {
#     "isCancelled": false,
#     "customerID": "cus_1234567890"
#   },
#   "price": "$2.99",
#   "period": "month"
# }

# Create Stripe checkout session (requires payment JWT)
curl -X GET "https://api.ente.io/billing/stripe/checkout-session?productID=lite" \
  -H "X-Auth-Token: your_payment_jwt"

# Response:
# {
#   "sessionID": "cs_test_1234567890",
#   "checkoutURL": "https://checkout.stripe.com/c/pay/cs_test_1234567890"
# }

# Cancel subscription
curl -X POST "https://api.ente.io/billing/stripe/cancel-subscription" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK

# Reactivate cancelled subscription
curl -X POST "https://api.ente.io/billing/stripe/activate-subscription" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK

# Get customer portal URL
curl -X GET "https://api.ente.io/billing/stripe/customer-portal" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "url": "https://billing.stripe.com/p/session/test_1234567890"
# }

# Verify mobile subscription (Play Store)
curl -X POST "https://api.ente.io/billing/verify-subscription" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentProvider": "playstore",
    "productID": "lite_monthly",
    "verificationData": "purchase_token_from_google"
  }'

# Response: 200 OK

# Verify mobile subscription (App Store)
curl -X POST "https://api.ente.io/billing/verify-subscription" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentProvider": "appstore",
    "productID": "lite_monthly",
    "verificationData": "base64_receipt_from_apple"
  }'

# Response: 200 OK
```

### Storage Bonus and Referrals

Manage referral codes and earn storage bonuses for inviting users.

```bash
# Get storage bonus details
curl -X GET "https://api.ente.io/storage-bonus/details" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "referralCode": "USER2024",
#   "referralCount": 3,
#   "bonusStorage": 3221225472,
#   "totalBonus": 3221225472
# }

# Change referral code
curl -X POST "https://api.ente.io/storage-bonus/change-code" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "MYCODE"
  }'

# Response: 200 OK

# Claim referral bonus (during signup)
curl -X POST "https://api.ente.io/storage-bonus/referral-claim" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "referralCode": "FRIEND2024"
  }'

# Response:
# {
#   "bonusStorage": 1073741824,
#   "message": "Successfully claimed 1GB bonus storage!"
# }
```

## Trash Management APIs

### Trash Operations

Manage deleted files in trash with recovery and permanent deletion options.

```bash
# Get trash diff
curl -X GET "https://api.ente.io/trash/v2/diff?sinceTime=0" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "diff": [
#     {
#       "id": 98765,
#       "ownerID": 12345,
#       "collectionID": 456,
#       "encryptedKey": "...",
#       "file": {...},
#       "thumbnail": {...},
#       "metadata": {...},
#       "isDeleted": true,
#       "updationTime": 1702857600000000,
#       "deleteBy": 1703462400
#     }
#   ],
#   "hasMore": false
# }

# Restore files from trash
curl -X POST "https://api.ente.io/collections/restore-files" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "fileID": 98765,
        "collectionID": 456
      }
    ]
  }'

# Response: 200 OK

# Permanently delete specific files
curl -X POST "https://api.ente.io/trash/delete" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "fileIDs": [98765, 98766]
  }'

# Response: 200 OK

# Empty entire trash
curl -X POST "https://api.ente.io/trash/empty" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK
```

## Cast APIs

### Device Pairing

Pair and cast photos to Chromecast devices or browser-based receivers.

```bash
# Register cast device (on TV/receiver)
curl -X POST "https://api.ente.io/cast/device-info" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceCode": "123456"
  }'

# Response:
# {
#   "id": "device_uuid",
#   "deviceCode": "123456"
# }

# Send cast data (from phone/computer)
curl -X POST "https://api.ente.io/cast/cast-data" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceCode": "123456",
    "castToken": "encrypted_cast_authentication_token",
    "collectionID": 456,
    "collectionKey": "base64_encrypted_collection_key"
  }'

# Response: 200 OK

# Get cast data (on receiver device)
curl -X GET "https://api.ente.io/cast/cast-data/123456"

# Response:
# {
#   "castToken": "encrypted_cast_authentication_token",
#   "collectionID": 456,
#   "collectionKey": "base64_encrypted_collection_key"
# }

# Access collection via cast token
curl -X GET "https://api.ente.io/cast/diff?collectionID=456&sinceTime=0" \
  -H "X-Cast-Access-Token: cast_authentication_token"

# Response: (collection diff similar to regular diff)

# Download cast file
curl -X GET "https://api.ente.io/cast/files/download/98765" \
  -H "X-Cast-Access-Token: cast_authentication_token" \
  -L -o encrypted_file.bin

# Revoke all cast tokens
curl -X DELETE "https://api.ente.io/cast/revoke-all-tokens" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK
```

## User Management APIs

### Account Operations

Manage user account settings, email, recovery keys, and account deletion.

```bash
# Get user details
curl -X GET "https://api.ente.io/users/details/v2?memoryCount=true" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "id": 12345,
#   "email": "user@example.com",
#   "subscription": {
#     "productID": "lite",
#     "storage": 21474836480,
#     "expiryTime": 1735516800
#   },
#   "usage": {
#     "photos": 10737418240,
#     "auth": 1048576,
#     "total": 10738466816
#   },
#   "familyData": null,
#   "profileData": {
#     "canDisableEmailMFA": true
#   },
#   "memoryCount": 42
# }

# Set recovery key
curl -X PUT "https://api.ente.io/users/recovery-key" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "masterKeyEncryptedWithRecoveryKey": "base64_encrypted_master_key",
    "masterKeyDecryptionNonce": "base64_nonce",
    "recoveryKeyEncryptedWithMasterKey": "base64_encrypted_recovery_key",
    "recoveryKeyDecryptionNonce": "base64_nonce"
  }'

# Response: 200 OK

# Change email address
curl -X POST "https://api.ente.io/users/change-email" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "ott": "123456"
  }'

# Response: 200 OK

# Get active sessions
curl -X GET "https://api.ente.io/users/sessions" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# [
#   {
#     "token": "session_token_1",
#     "creationTime": 1702857600,
#     "ip": "192.168.1.1",
#     "ua": "Mozilla/5.0...",
#     "lastUsedTime": 1702900000,
#     "isCurrent": true
#   },
#   {
#     "token": "session_token_2",
#     "creationTime": 1702800000,
#     "ip": "10.0.0.1",
#     "ua": "Ente/iOS 1.0",
#     "lastUsedTime": 1702850000,
#     "isCurrent": false
#   }
# ]

# Terminate specific session
curl -X DELETE "https://api.ente.io/users/session?token=session_token_2" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK

# Logout current session
curl -X POST "https://api.ente.io/users/logout" \
  -H "X-Auth-Token: your_auth_token"

# Response: 200 OK

# Get account deletion challenge
curl -X GET "https://api.ente.io/users/delete-challenge" \
  -H "X-Auth-Token: your_auth_token"

# Response:
# {
#   "allowDelete": true,
#   "encryptedChallenge": "base64_encrypted_challenge_to_decrypt",
#   "apps": ["photos", "auth"]
# }

# Delete account (decrypt challenge first)
curl -X DELETE "https://api.ente.io/users/delete" \
  -H "X-Auth-Token: your_auth_token" \
  -H "Content-Type: application/json" \
  -d '{
    "challenge": "decrypted_challenge_value",
    "feedback": "Found a better alternative",
    "reasonCategory": "switching_service"
  }'

# Response: 200 OK
```

## CLI Usage

### Command Line Tool

Go-based CLI for data export and account management from terminal.

```bash
# Install CLI
go install github.com/ente-io/ente/cli@latest

# Or download pre-built binary
curl -L https://github.com/ente-io/ente/releases/latest/download/ente-cli-linux -o ente
chmod +x ente

# Add account (login)
ente account add
# Prompts for email and OTT

# List configured accounts
ente account list
# Output:
# 1. user@example.com (photos)
# 2. user@example.com (auth)

# Export all data
ente export --account 1 --output ~/ente-backup
# Downloads all photos, albums, and metadata to ~/ente-backup

# Export specific album
ente export --account 1 --album "Vacation 2024" --output ~/vacation

# Export authenticator codes
ente export --account 2 --output ~/auth-backup

# Get authentication token (for API access)
ente account get-token --account 1
# Output: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Show version
ente version
# Output: ente-cli v0.1.0

# Configuration stored at ~/.ente/config.yaml
cat ~/.ente/config.yaml
# accounts:
#   - user: 12345
#     email: user@example.com
#     app: photos
#     token: encrypted_token
```

Ente provides a comprehensive end-to-end encrypted cloud platform suitable for building privacy-focused applications. The primary use cases include replacing Google Photos with self-hosted or cloud-hosted photo storage, backing up 2FA authenticator codes with cloud sync, and storing sensitive documents in encrypted lockers. All data is encrypted on the client before upload using a key hierarchy derived from the user's master password, ensuring zero-knowledge architecture where even server administrators cannot access user content.

Integration patterns include mobile apps using Flutter SDK with encrypted local storage, web applications using TypeScript/React with IndexedDB caching, desktop applications using Electron wrappers, and server-side integrations using the Go-based API server. The platform supports multiple authentication methods (SRP, 2FA, passkeys), multiple storage backends (B2, Wasabi, Scaleway), and multiple payment providers (Stripe, Play Store, App Store). The modular architecture allows developers to build additional applications on the platform (beyond Photos and Auth) while leveraging the existing encryption, storage, and authentication infrastructure. Family sharing, public album sharing, and Chromecast support demonstrate the flexibility of the platform for collaborative use cases while maintaining end-to-end encryption guarantees.
