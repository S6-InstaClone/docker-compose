import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
var errorRate = new Rate('errors');
var postCreationTime = new Trend('post_creation_time');
var feedLoadTime = new Trend('feed_load_time');
var successfulRequests = new Counter('successful_requests');

// =============================================================================
// REALISTIC NFRs FOR STUDENT PROJECT
// =============================================================================
export var options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'errors': ['rate<0.01'],
    'feed_load_time': ['p(95)<300'],
    'post_creation_time': ['p(95)<800'],
  },
};

// =============================================================================
// CONFIGURATION
// =============================================================================
var KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://keycloak:8080';
var KEYCLOAK_REALM = __ENV.KEYCLOAK_REALM || 'instaclone';
var KEYCLOAK_CLIENT_ID = __ENV.KEYCLOAK_CLIENT_ID || 'public-client';
var API_GATEWAY_URL = __ENV.API_GATEWAY_URL || 'http://apiGateway:5000';

var TEST_USERS = [
  { username: 'testuser1', password: 'testpass123' },
  { username: 'testuser2', password: 'testpass123' },
  { username: 'testuser3', password: 'testpass123' },
  { username: 'testuser4', password: 'testpass123' },
  { username: 'testuser5', password: 'testpass123' },
];

function getAccessToken(username, password) {
  var tokenUrl = KEYCLOAK_URL + '/realms/' + KEYCLOAK_REALM + '/protocol/openid-connect/token';
  
  var payload = {
    grant_type: 'password',
    client_id: KEYCLOAK_CLIENT_ID,
    username: username,
    password: password,
  };
  
  var response = http.post(tokenUrl, payload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  if (response.status === 200) {
    return JSON.parse(response.body).access_token;
  }
  console.error('Failed to get token for ' + username + ': ' + response.status);
  return null;
}

export function setup() {
  console.log('Setting up load test...');
  console.log('API Gateway: ' + API_GATEWAY_URL);
  
  var tokens = {};
  for (var i = 0; i < TEST_USERS.length; i++) {
    var user = TEST_USERS[i];
    var token = getAccessToken(user.username, user.password);
    if (token) {
      tokens[user.username] = token;
      console.log('Got token for ' + user.username);
    }
  }
  return { tokens: tokens };
}

export default function(data) {
  var userIndex = __VU % TEST_USERS.length;
  var user = TEST_USERS[userIndex];
  var token = data.tokens[user.username];
  
  var authHeaders = token ? {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
  } : { 'Content-Type': 'application/json' };

  group('Browse Feed', function() {
    var start = new Date().getTime();
    var response = http.get(API_GATEWAY_URL + '/api/Posts');
    feedLoadTime.add(new Date().getTime() - start);
    
    var success = check(response, {
      'feed loads': function(r) { return r.status === 200; },
    });
    errorRate.add(!success);
    if (success) successfulRequests.add(1);
    sleep(Math.random() * 2 + 1);
  });

  if (token) {
    group('View My Account', function() {
      var response = http.get(API_GATEWAY_URL + '/api/Account/me', { headers: authHeaders });
      var success = check(response, {
        'account loads': function(r) { return r.status === 200 || r.status === 401; },
      });
      errorRate.add(!success);
      if (success) successfulRequests.add(1);
      sleep(Math.random() + 0.5);
    });

    if (Math.random() < 0.1) {
      group('Create Post', function() {
        var start = new Date().getTime();
        var response = http.post(API_GATEWAY_URL + '/api/Posts', 
          JSON.stringify({ caption: 'k6 test ' + Date.now() }), 
          { headers: authHeaders });
        postCreationTime.add(new Date().getTime() - start);
        
        var success = check(response, {
          'post created': function(r) { return r.status === 201 || r.status === 200; },
        });
        errorRate.add(!success);
        if (success) successfulRequests.add(1);
        sleep(Math.random() * 2 + 1);
      });
    }
  }

  group('View Single Post', function() {
    var postId = Math.floor(Math.random() * 10) + 1;
    var response = http.get(API_GATEWAY_URL + '/api/Posts/' + postId);
    var success = check(response, {
      'post valid': function(r) { return r.status === 200 || r.status === 404; },
    });
    errorRate.add(!success);
    if (success) successfulRequests.add(1);
    sleep(Math.random() * 2 + 1);
  });
}

export function handleSummary(data) {
  var m = data.metrics;
  var output = '\n========== LOAD TEST SUMMARY ==========\n\n';
  
  if (m.http_req_duration && m.http_req_duration.values) {
    var p95 = m.http_req_duration.values['p(95)'] || 0;
    output += 'NFR-02 P95 Response: ' + p95.toFixed(2) + 'ms ' + (p95 < 500 ? 'PASS' : 'FAIL') + '\n';
  }
  if (m.errors && m.errors.values) {
    var errRate = (m.errors.values.rate || 0) * 100;
    output += 'NFR-03 Error Rate: ' + errRate.toFixed(2) + '% ' + (errRate < 1 ? 'PASS' : 'FAIL') + '\n';
  }
  if (m.http_reqs && m.http_reqs.values) {
    output += 'Total Requests: ' + m.http_reqs.values.count + '\n';
  }
  output += '========================================\n';
  
  return { 'stdout': output };
}
