import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Stress test: Find the breaking point of your system
// Gradually increase load until the system starts failing

const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp to 50 users
    { duration: '2m', target: 100 },   // Ramp to 100 users
    { duration: '2m', target: 150 },   // Ramp to 150 users
    { duration: '2m', target: 200 },   // Ramp to 200 users (stress)
    { duration: '2m', target: 250 },   // Push beyond expected capacity
    { duration: '2m', target: 0 },     // Recovery
  ],
  thresholds: {
    // During stress test, we expect some failures
    // The goal is to identify WHERE it breaks
    'http_req_duration': ['p(95)<2000'], // More lenient
    'errors': ['rate<0.10'],              // Accept up to 10% errors
  },
};

const API_URL = __ENV.API_GATEWAY_URL || 'http://localhost:5000';

export default function() {
  group('Stress - Browse Feed', function() {
    const response = http.get(`${API_URL}/api/Posts`);
    
    responseTime.add(response.timings.duration);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
    });
    
    errorRate.add(!success);
  });
  
  sleep(0.5 + Math.random()); // Shorter sleep for higher load
}

export function handleSummary(data) {
    const metrics = data.metrics;

    // Max VUs
    let maxVUs = 'Unknown';
    if (data.options && data.options.stages) {
        maxVUs = data.options.stages.reduce((max, s) => Math.max(max, s.target), 0);
    }

    // Total requests
    const totalRequests = metrics.http_reqs && metrics.http_reqs.values
        ? metrics.http_reqs.values.count
        : 0;

    // Error rate
    const errorRateValue = metrics.errors && metrics.errors.values
        ? metrics.errors.values.rate
        : 0;

    // p95 duration
    const p95 = metrics.http_req_duration && metrics.http_req_duration.values
        ? metrics.http_req_duration.values['p(95)']
        : 0;

    // Max duration
    const maxDuration = metrics.http_req_duration && metrics.http_req_duration.values
        ? metrics.http_req_duration.values.max
        : 0;

    let output = '\n========== STRESS TEST RESULTS ==========\n\n';
    output += '--- Breaking Point Analysis ---\n';
    output += `Max VUs reached: ${maxVUs}\n`;
    output += `Total requests: ${totalRequests}\n`;
    output += `Error rate: ${(errorRateValue * 100).toFixed(2)}%\n`;
    output += `P95 response time: ${p95.toFixed(2)}ms\n`;
    output += `Max response time: ${maxDuration.toFixed(2)}ms\n\n`;

    output += '--- Recommendations ---\n';

    if (errorRateValue > 0.05) {
        output += '⚠️  Error rate exceeded 5% - system is under stress\n';
    }
    if (p95 > 1000) {
        output += '⚠️  P95 latency exceeded 1s - consider scaling or optimization\n';
    }
    if (errorRateValue < 0.01 && p95 < 500) {
        output += '✓  System handled stress well - capacity may be higher than tested\n';
    }

    output += '\n==========================================\n';

    return { stdout: output };
}

