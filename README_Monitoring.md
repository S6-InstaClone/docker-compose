# InstaClone Monitoring & Load Testing Setup

## Quick Start

### 1. Extract the monitoring files
Unzip `instaclone-monitoring.zip` into your project root as a `monitoring/` folder.

### 2. Add metrics to your ASP.NET services

**Add NuGet packages** to each service (AccountService, PostService, APIGateway):
```bash
dotnet add package OpenTelemetry.Exporter.Prometheus.AspNetCore --version 1.7.0-rc.1
dotnet add package OpenTelemetry.Extensions.Hosting --version 1.7.0
dotnet add package OpenTelemetry.Instrumentation.AspNetCore --version 1.7.0
dotnet add package OpenTelemetry.Instrumentation.Http --version 1.7.0
```

**Update Program.cs** in each service (see METRICS_SETUP.md for full code):
```csharp
// Add after builder creation
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("YourServiceName"))
    .WithMetrics(metrics => {
        metrics.AddAspNetCoreInstrumentation()
               .AddHttpClientInstrumentation()
               .AddPrometheusExporter();
    });

// Add after app creation
app.UseOpenTelemetryPrometheusScrapingEndpoint();
```

### 3. Start the monitoring stack
```bash
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### 4. Access the tools
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **RabbitMQ**: http://localhost:15672 (admin/admin)

## Running Load Tests

### Setup test users in Keycloak
```bash
chmod +x monitoring/k6/setup-test-users.sh
./monitoring/k6/setup-test-users.sh
```

### Run tests
```bash
# Smoke test (quick health check)
docker-compose exec k6 k6 run /scripts/smoke-test.js

# Load test (NFR validation)
docker-compose exec k6 k6 run /scripts/load-test.js

# Stress test (find breaking point)
docker-compose exec k6 k6 run /scripts/stress-test.js
```

## Non-Functional Requirements

| ID | Requirement | Target | Pass Criteria |
|----|-------------|--------|---------------|
| NFR-01 | Concurrent Users | 50 | No degradation |
| NFR-02 | P95 Response Time | < 500ms | 95th percentile |
| NFR-03 | Error Rate | < 1% | HTTP 5xx errors |
| NFR-04 | Throughput | > 100 req/s | Sustained load |
| NFR-05 | Feed Load Time | < 300ms | P95 |
| NFR-06 | Post Creation | < 800ms | P95 |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Grafana   │────▶│ Prometheus  │────▶│  Services   │
│  :3001      │     │   :9090     │     │  /metrics   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Postgres   │
                    │  Exporters  │
                    └─────────────┘
```

## Keycloak + k6 Authentication

The load tests authenticate against Keycloak using the password grant type:

1. Test users (testuser1-5) are created in Keycloak
2. k6 obtains JWT tokens during the setup phase
3. Tokens are reused across all virtual users
4. Authenticated and public endpoints are tested

## Troubleshooting

**Prometheus can't scrape services:**
- Ensure `/metrics` endpoint is exposed
- Check firewall/network settings
- Verify service names in docker-compose

**k6 can't authenticate:**
- Verify Keycloak is running and realm exists
- Check test user credentials
- Ensure public-client is configured correctly

**High error rates:**
- Check database connections
- Review service logs
- Verify RabbitMQ is healthy
