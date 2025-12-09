import http from 'k6/http';
import { check, sleep } from 'k6';

// Smoke test: Quick validation that the system is working
// Run before full load tests to catch obvious issues

export const options = {
  vus: 1,              // Single user
  duration: '30s',     // Short duration
  thresholds: {
    'http_req_duration': ['p(99)<1000'], // All requests under 1s
    'http_req_failed': ['rate<0.01'],     // Less than 1% failures
  },
};

const API_URL = __ENV.API_GATEWAY_URL || 'http://localhost:5000';

export default function() {
  // Test 1: Health check on public endpoint
  let response = http.get(`${API_URL}/api/Posts`);
  check(response, {
    'posts endpoint available': (r) => r.status === 200,
  });
  
  sleep(1);
  
  // Test 2: Get single post
  response = http.get(`${API_URL}/api/Posts/1`);
  check(response, {
    'single post endpoint works': (r) => r.status === 200 || r.status === 404,
  });
  
  sleep(1);
}
