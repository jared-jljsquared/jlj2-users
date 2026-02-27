# ScyllaDB Local Development Setup

This project uses ScyllaDB for data storage. For local development, ScyllaDB runs in a Docker container.

## Quick Start

### Start ScyllaDB

```bash
docker-compose up -d
```

This will start ScyllaDB in detached mode. The container will be named `jlj2-users-scylla`.

### Check Status

```bash
docker-compose ps
```

### View Logs

```bash
docker-compose logs -f scylla
```

### Stop ScyllaDB

```bash
docker-compose down
```

To also remove volumes (⚠️ **this will delete all data**):

```bash
docker-compose down -v
```

## Connection Details

- **CQL Native Protocol**: `localhost:9042`
- **REST API**: `http://localhost:10000`
- **Thrift API** (legacy): `localhost:9160`

## Using cqlsh (CQL Shell)

Connect to the ScyllaDB instance:

```bash
docker-compose exec scylla cqlsh
```

Or if you have `cqlsh` installed locally:

```bash
cqlsh localhost 9042
```

## Development Mode

The configuration uses `SCYLLA_DEVELOPER_MODE=1` which:
- Reduces resource requirements
- Disables some production optimizations
- Makes it suitable for local development

For even lighter resource usage, you can use the dev override:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

This uses 512MB of memory instead of 1GB.

## Data Persistence

Data is persisted in Docker volumes:
- `scylla-data`: Contains the actual database data
- `scylla-config`: Contains configuration files

These volumes persist even when containers are stopped. To start fresh:

```bash
docker-compose down -v
docker-compose up -d
```

## Health Check

The container includes a health check that verifies ScyllaDB is ready. You can check the health status:

```bash
docker-compose ps
```

The status should show as "healthy" when ready.

## Troubleshooting

### Container won't start

Check the logs:
```bash
docker-compose logs scylla
```

### Port already in use

If port 9042 (or other ports) are already in use, you can modify the port mappings in `docker-compose.yml`:

```yaml
ports:
  - '19042:9042'  # Use 19042 on host instead
```

### Out of memory

If you're running low on memory, use the dev override which uses less memory:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Reset everything

To completely reset ScyllaDB (removes all data):

```bash
docker-compose down -v
docker-compose up -d
```

## Environment Variables

You can override environment variables by creating a `.env` file or setting them in your shell:

```bash
SCYLLA_CLUSTER_NAME=my-custom-cluster docker-compose up -d
```

## Next Steps

Once ScyllaDB is running, you'll need to:
1. Create a keyspace for your application
2. Create tables as needed
3. Configure your application to connect to `localhost:9042`

Example CQL to create a keyspace:

```cql
CREATE KEYSPACE jlj2_users
WITH REPLICATION = {
  'class': 'SimpleStrategy',
  'replication_factor': 1
};

USE jlj2_users;
```

