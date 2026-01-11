#!/bin/bash
# Script to switch between staging and production environments for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

cd "$PROJECT_ROOT"

if [ "$1" == "staging" ] || [ "$1" == "stage" ] || [ "$1" == "" ]; then
  echo "🔄 Switching to STAGING environment (safe for development)..."
  cp "$PROJECT_ROOT/.env.staging" "$ENV_FILE"
  echo "✅ Now using STAGING database: fdb09c88-e5eb-4d54-a09c-dd8cc5cef020"
  echo "   Your changes won't affect production data."
elif [ "$1" == "production" ] || [ "$1" == "prod" ]; then
  echo "⚠️  Switching to PRODUCTION environment..."
  echo "   WARNING: You will be working with production data!"
  read -p "   Are you sure? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled. Staying on staging."
    exit 0
  fi
  cp "$PROJECT_ROOT/.env.production" "$ENV_FILE"
  echo "✅ Now using PRODUCTION database: f5937544-d918-4dc7-bb05-5f4a8cae65b3"
  echo "   ⚠️  Be careful - changes will affect real users!"
else
  echo "Usage: ./scripts/switch-env.sh [staging|production]"
  echo ""
  echo "  staging (default)  - Use staging database (safe for development)"
  echo "  production         - Use production database (⚠️  affects real data)"
  echo ""
  echo "Current environment:"
  if [ -f "$ENV_FILE" ]; then
    APP_ID=$(grep VITE_INSTANTDB_APP_ID "$ENV_FILE" | cut -d '=' -f2)
    if [ "$APP_ID" == "fdb09c88-e5eb-4d54-a09c-dd8cc5cef020" ]; then
      echo "  ✅ STAGING"
    elif [ "$APP_ID" == "f5937544-d918-4dc7-bb05-5f4a8cae65b3" ]; then
      echo "  ⚠️  PRODUCTION"
    else
      echo "  ❓ UNKNOWN"
    fi
  else
    echo "  ❌ No .env file found"
  fi
  exit 1
fi

echo ""
echo "💡 Remember to restart your dev server after switching environments!"
