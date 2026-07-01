#!/bin/bash
set -e

echo "=== Kanban Workflow Builder — Deployment Verification ==="
echo ""

PORT=${PORT:-8080}
BASE_URL="http://localhost:${PORT}"

# Check health endpoint
echo "1. Checking health endpoint..."
if curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "   ✅ Health check passed"
else
  echo "   ❌ Health check failed"
  exit 1
fi

# Check Swagger docs
echo "2. Checking Swagger docs..."
if curl -sf "${BASE_URL}/api/docs" > /dev/null 2>&1; then
  echo "   ✅ Swagger docs available"
else
  echo "   ⚠️  Swagger docs not available (non-critical)"
fi

# Check workflows endpoint
echo "3. Checking workflows endpoint..."
if curl -sf "${BASE_URL}/api/workflows" > /dev/null 2>&1; then
  echo "   ✅ Workflows endpoint working"
else
  echo "   ❌ Workflows endpoint failed"
  exit 1
fi

# Check dashboard endpoint
echo "4. Checking dashboard endpoint..."
if curl -sf "${BASE_URL}/api/dashboard" > /dev/null 2>&1; then
  echo "   ✅ Dashboard endpoint working"
else
  echo "   ⚠️  Dashboard endpoint failed (non-critical)"
fi

echo ""
echo "=== Deployment verification complete ==="
