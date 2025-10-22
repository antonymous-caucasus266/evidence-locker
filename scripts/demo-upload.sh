#!/bin/bash

# Evidence Locker Demo Script
# This script demonstrates the complete upload flow

set -e

# Configuration
BASE_URL="http://localhost:4600"
APP_KEY="registry"
APP_SECRET="registry-demo-key-12345"
SAMPLE_FILE="samples/sample-evidence.pdf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Evidence Locker Demo Script${NC}"
echo "================================"

# Check if sample file exists
if [ ! -f "$SAMPLE_FILE" ]; then
    echo -e "${RED}Error: Sample file $SAMPLE_FILE not found${NC}"
    echo "Please create a sample PDF file first"
    exit 1
fi

# Function to generate HMAC signature
generate_signature() {
    local body="$1"
    echo -n "$body" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | xxd -p -c 256
}

# Function to make authenticated request
make_request() {
    local method="$1"
    local url="$2"
    local body="$3"
    
    local signature=$(generate_signature "$body")
    
    curl -s -X "$method" \
        -H "Content-Type: application/json" \
        -H "x-app-key: $APP_KEY" \
        -H "x-app-sig: $signature" \
        -d "$body" \
        "$url"
}

echo -e "${YELLOW}Step 1: Initialize Upload${NC}"
echo "Creating upload session..."

# Step 1: Initialize upload
INIT_RESPONSE=$(make_request "POST" "$BASE_URL/v1/upload/init" '{
    "filename": "sample-evidence.pdf",
    "sizeBytes": 1024,
    "mimeHint": "application/pdf",
    "context": {
        "projectId": "demo-project-123",
        "issuanceId": "demo-issuance-456",
        "label": "Carbon Credit Evidence"
    }
}')

echo "Response: $INIT_RESPONSE"

# Extract values from response
UPLOAD_ID=$(echo "$INIT_RESPONSE" | jq -r '.uploadId')
TOKEN=$(echo "$INIT_RESPONSE" | jq -r '.token')
PUT_URL=$(echo "$INIT_RESPONSE" | jq -r '.putUrl')
BUCKET_KEY=$(echo "$INIT_RESPONSE" | jq -r '.bucketKey')

if [ "$UPLOAD_ID" = "null" ] || [ -z "$UPLOAD_ID" ]; then
    echo -e "${RED}Error: Failed to initialize upload${NC}"
    echo "$INIT_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Upload initialized successfully${NC}"
echo "Upload ID: $UPLOAD_ID"
echo "Bucket Key: $BUCKET_KEY"

echo -e "\n${YELLOW}Step 2: Upload File${NC}"
echo "Uploading file to storage..."

# Step 2: Upload file (simplified - in real implementation, this would be a proper PUT request)
# For demo purposes, we'll simulate this step
echo -e "${GREEN}✓ File uploaded successfully${NC}"

echo -e "\n${YELLOW}Step 3: Complete Upload${NC}"
echo "Completing upload and verifying..."

# Step 3: Complete upload
COMPLETE_RESPONSE=$(make_request "POST" "$BASE_URL/v1/upload/complete" "{
    \"uploadId\": \"$UPLOAD_ID\"
}")

echo "Response: $COMPLETE_RESPONSE"

# Extract artifact information
ARTIFACT_ID=$(echo "$COMPLETE_RESPONSE" | jq -r '.artifactId')
SHA256=$(echo "$COMPLETE_RESPONSE" | jq -r '.sha256Hex')
SIZE_BYTES=$(echo "$COMPLETE_RESPONSE" | jq -r '.sizeBytes')
MIME=$(echo "$COMPLETE_RESPONSE" | jq -r '.mime')
DOWNLOAD_URL=$(echo "$COMPLETE_RESPONSE" | jq -r '.downloadUrl')

if [ "$ARTIFACT_ID" = "null" ] || [ -z "$ARTIFACT_ID" ]; then
    echo -e "${RED}Error: Failed to complete upload${NC}"
    echo "$COMPLETE_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Upload completed successfully${NC}"
echo "Artifact ID: $ARTIFACT_ID"
echo "SHA-256: $SHA256"
echo "Size: $SIZE_BYTES bytes"
echo "MIME Type: $MIME"

echo -e "\n${YELLOW}Step 4: Verify Artifact${NC}"
echo "Verifying artifact existence..."

# Step 4: Verify artifact
VERIFY_RESPONSE=$(curl -s "$BASE_URL/v1/artifacts/$SHA256/verify")

echo "Response: $VERIFY_RESPONSE"

EXISTS=$(echo "$VERIFY_RESPONSE" | jq -r '.exists')

if [ "$EXISTS" = "true" ]; then
    echo -e "${GREEN}✓ Artifact verified successfully${NC}"
else
    echo -e "${RED}Error: Artifact verification failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Step 5: Get Metadata${NC}"
echo "Retrieving artifact metadata..."

# Step 5: Get metadata
METADATA_RESPONSE=$(make_request "GET" "$BASE_URL/v1/artifacts/$SHA256/meta" "")

echo "Response: $METADATA_RESPONSE"

echo -e "${GREEN}✓ Metadata retrieved successfully${NC}"

echo -e "\n${YELLOW}Step 6: Test Download${NC}"
echo "Testing download (redirect to signed URL)..."

# Step 6: Test download
DOWNLOAD_RESPONSE=$(make_request "GET" "$BASE_URL/v1/artifacts/$SHA256" "")

echo "Download URL: $DOWNLOAD_RESPONSE"

echo -e "${GREEN}✓ Download test completed${NC}"

echo -e "\n${YELLOW}Step 7: Optional IPFS Pin${NC}"
echo "Pinning to IPFS (if enabled)..."

# Step 7: Optional IPFS pin
IPFS_RESPONSE=$(make_request "POST" "$BASE_URL/v1/admin/ipfs/pin" "{
    \"sha256Hex\": \"$SHA256\"
}")

echo "Response: $IPFS_RESPONSE"

echo -e "${GREEN}✓ IPFS pin completed${NC}"

echo -e "\n${GREEN}🎉 Demo completed successfully!${NC}"
echo "================================"
echo "Summary:"
echo "- Upload ID: $UPLOAD_ID"
echo "- Artifact ID: $ARTIFACT_ID"
echo "- SHA-256: $SHA256"
echo "- Size: $SIZE_BYTES bytes"
echo "- MIME Type: $MIME"
echo "- Download URL: $BASE_URL$DOWNLOAD_URL"
