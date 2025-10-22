#!/bin/bash

# Create a sample PDF file for testing
# This script creates a simple PDF file using basic tools

set -e

SAMPLE_DIR="samples"
SAMPLE_FILE="$SAMPLE_DIR/sample-evidence.pdf"

echo "Creating sample PDF file..."

# Create samples directory if it doesn't exist
mkdir -p "$SAMPLE_DIR"

# Create a simple PDF file using echo and basic formatting
# This creates a minimal PDF that can be used for testing
cat > "$SAMPLE_FILE" << 'EOF'
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Sample Evidence Document) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000368 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
465
%%EOF
EOF

echo "✓ Sample PDF created: $SAMPLE_FILE"
echo "File size: $(wc -c < "$SAMPLE_FILE") bytes"

# Also create a JSON sample file
cat > "$SAMPLE_DIR/sample-evidence.json" << 'EOF'
{
  "documentType": "carbon-credit-evidence",
  "projectId": "demo-project-123",
  "issuanceId": "demo-issuance-456",
  "createdAt": "2024-01-01T00:00:00Z",
  "metadata": {
    "title": "Sample Carbon Credit Evidence",
    "description": "Test document for Evidence Locker service",
    "version": "1.0",
    "author": "Demo System"
  },
  "content": {
    "emissionReduction": {
      "baseline": 1000,
      "actual": 800,
      "reduction": 200,
      "unit": "tCO2e"
    },
    "verification": {
      "methodology": "ISO 14064-2",
      "verifier": "Demo Verifier",
      "date": "2024-01-01"
    }
  }
}
EOF

echo "✓ Sample JSON created: $SAMPLE_DIR/sample-evidence.json"
echo "File size: $(wc -c < "$SAMPLE_DIR/sample-evidence.json") bytes"

echo ""
echo "Sample files created successfully!"
echo "You can now run the demo script: ./scripts/demo-upload.sh"
