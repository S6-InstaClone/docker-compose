#!/bin/bash
# setup-test-users.sh
# Creates test users in Keycloak for load testing
# Run this after Keycloak is up and the realm is configured

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:18080}"
REALM="instaclone"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo "Getting admin token..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to get admin token. Is Keycloak running?"
  exit 1
fi

echo "Admin token obtained successfully"

# Create test users
for i in {1..5}; do
  USERNAME="testuser${i}"
  PASSWORD="testpass123"
  EMAIL="testuser${i}@test.com"
  
  echo "Creating user: ${USERNAME}"
  
  # Create user
  curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${USERNAME}\",
      \"email\": \"${EMAIL}\",
      \"enabled\": true,
      \"emailVerified\": true,
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"${PASSWORD}\",
        \"temporary\": false
      }]
    }"
  
  echo "User ${USERNAME} created"
done

echo ""
echo "Test users created successfully!"
echo "Users: testuser1 through testuser5"
echo "Password for all: testpass123"
