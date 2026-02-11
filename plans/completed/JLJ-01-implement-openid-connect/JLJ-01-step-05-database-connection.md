# Step 5: Database Connection Setup

## Overview
Set up ScyllaDB connection, connection pooling, and database client initialization. Configure connection settings, retry logic, and health checks. This step establishes the foundation for all database operations in the application.

## Sub-steps

### 5.1 Install Database Driver
Install the ScyllaDB-compatible driver for Node.js:
- Use `cassandra-driver` (official DataStax driver, recommended by ScyllaDB)
- Install TypeScript types if available (the driver includes its own types)
- Add to package.json dependencies

### 5.2 Database Configuration
Create database configuration module:
- Connection settings (host, port, keyspace, datacenter)
- Connection pool settings
- Retry policy configuration
- Load balancing policy
- Authentication settings (if needed)
- Environment variable support

### 5.3 Database Client Initialization
Implement database client initialization:
- Create singleton database client instance
- Connection lifecycle management
- Connection health checks
- Error handling for connection failures
- Graceful shutdown handling

### 5.4 Connection Pooling
Configure connection pooling:
- Set appropriate pool size for development/production
- Configure connection timeout settings
- Implement connection retry logic
- Handle connection failures gracefully

### 5.5 Health Check Integration
Integrate database health checks:
- Create health check endpoint or function
- Verify database connectivity
- Check keyspace existence
- Monitor connection pool status

### 5.6 Application Startup Integration
Integrate database connection into application startup:
- Initialize database connection on app startup
- Handle connection errors during startup
- Ensure database is ready before accepting requests
- Log connection status

## Code Samples

### Example: Database Configuration
```typescript
// src/database/config.ts
export interface DatabaseConfig {
  hosts: string[]
  port: number
  keyspace: string
  datacenter?: string
  localDataCenter?: string
  username?: string
  password?: string
  ssl?: boolean
  connectTimeout?: number
  poolSize?: number
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const hosts = (process.env.SCYLLA_HOSTS || 'localhost').split(',')
  const port = Number(process.env.SCYLLA_PORT) || 9042
  const keyspace = process.env.SCYLLA_KEYSPACE || 'jlj2_users'
  
  return {
    hosts,
    port,
    keyspace,
    localDataCenter: process.env.SCYLLA_DATACENTER || 'datacenter1',
    username: process.env.SCYLLA_USERNAME,
    password: process.env.SCYLLA_PASSWORD,
    ssl: process.env.SCYLLA_SSL === 'true',
    connectTimeout: Number(process.env.SCYLLA_CONNECT_TIMEOUT) || 10000,
    poolSize: Number(process.env.SCYLLA_POOL_SIZE) || 4,
  }
}
```

### Example: Database Client Initialization
```typescript
// src/database/client.ts
import { Client } from 'cassandra-driver'
import { getDatabaseConfig } from './config.ts'
import { log } from '../plumbing/logger.ts'

let client: Client | null = null

export const getDatabaseClient = (): Client => {
  if (!client) {
    throw new Error('Database client not initialized. Call initializeDatabase() first.')
  }
  return client
}

export const initializeDatabase = async (): Promise<void> => {
  if (client) {
    log('Database client already initialized')
    return
  }

  const config = getDatabaseConfig()
  
  client = new Client({
    contactPoints: config.hosts,
    localDataCenter: config.localDataCenter || 'datacenter1',
    keyspace: config.keyspace,
    credentials: config.username && config.password
      ? {
          username: config.username,
          password: config.password,
        }
      : undefined,
    sslOptions: config.ssl ? {} : undefined,
    socketOptions: {
      connectTimeout: config.connectTimeout,
    },
    pooling: {
      coreConnectionsPerHost: {
        [client.hosts.coreConnectionsPerHost.DEFAULT]: config.poolSize || 2,
      },
    },
  })

  try {
    await client.connect()
    log({
      message: 'Database connection established',
      keyspace: config.keyspace,
      hosts: config.hosts,
    })
  } catch (error) {
    log({
      message: 'Failed to connect to database',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const shutdownDatabase = async (): Promise<void> => {
  if (client) {
    await client.shutdown()
    client = null
    log('Database connection closed')
  }
}
```

### Example: Health Check
```typescript
// src/database/health.ts
import { getDatabaseClient } from './client.ts'

export const checkDatabaseHealth = async (): Promise<{
  isHealthy: boolean
  message: string
}> => {
  try {
    const client = getDatabaseClient()
    // Execute a simple query to verify connectivity
    await client.execute('SELECT now() FROM system.local')
    return {
      isHealthy: true,
      message: 'Database connection is healthy',
    }
  } catch (error) {
    return {
      isHealthy: false,
      message: error instanceof Error ? error.message : 'Database health check failed',
    }
  }
}
```

### Example: Application Startup Integration
```typescript
// src/app.ts
import { initializeDatabase, shutdownDatabase } from './database/client.ts'

// Initialize database on startup
try {
  await initializeDatabase()
} catch (error) {
  log({
    message: 'Failed to initialize database',
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownDatabase()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await shutdownDatabase()
  process.exit(0)
})
```

## Testing

### Unit Tests (Vitest)
- **Configuration**: Test database configuration loading from environment variables
  - Test default values
  - Test environment variable overrides
  - Test multiple hosts configuration
  - Test SSL configuration
  
- **Client Initialization**: Test database client initialization
  - Test successful connection
  - Test connection failure handling
  - Test singleton pattern (client reuse)
  - Test connection retry logic
  
- **Health Checks**: Test database health check functionality
  - Test healthy database connection
  - Test unhealthy database connection
  - Test health check with connection errors

### Integration Tests
- **Connection**: Test actual connection to ScyllaDB (requires running instance)
  - Test connection establishment
  - Test query execution
  - Test connection pooling
  - Test graceful shutdown

### Test Examples
```typescript
// src/database/__tests__/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initializeDatabase, shutdownDatabase, getDatabaseClient } from '../client.ts'

describe('Database Client', () => {
  beforeEach(async () => {
    // Ensure clean state
    await shutdownDatabase()
  })

  afterEach(async () => {
    await shutdownDatabase()
  })

  it('should initialize database client', async () => {
    await initializeDatabase()
    const client = getDatabaseClient()
    expect(client).toBeDefined()
  })

  it('should throw error if client not initialized', () => {
    expect(() => {
      getDatabaseClient()
    }).toThrow('Database client not initialized')
  })

  it('should reuse existing client instance', async () => {
    await initializeDatabase()
    const client1 = getDatabaseClient()
    const client2 = getDatabaseClient()
    expect(client1).toBe(client2)
  })
})
```

## Success Criteria
- [ ] Database driver installed and configured
- [ ] Database configuration loads from environment variables
- [ ] Database client initializes successfully on application startup
- [ ] Connection pooling is configured appropriately
- [ ] Health check functionality works correctly
- [ ] Graceful shutdown closes database connections
- [ ] Error handling for connection failures is robust
- [ ] All unit tests for database connection pass (>95% coverage)
- [ ] Integration tests verify actual database connectivity

