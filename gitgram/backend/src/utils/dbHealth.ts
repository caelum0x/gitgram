import prisma from './prisma';
import logger from './logger';

export interface DatabaseHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  connectionCount?: number;
  error?: string;
}

const DB_HEALTH_WARN_MS = Number(process.env.DB_HEALTH_WARN_MS || 1000);
const DB_HEALTH_FAIL_MS = Number(process.env.DB_HEALTH_FAIL_MS || 5000);

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startTime = Date.now();
  
  try {
    // Simple query to check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    // Check connection pool status
    const connectionCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `.then((result) => Number(result[0]?.count || 0));

    const status = responseTime >= DB_HEALTH_FAIL_MS
      ? 'unhealthy'
      : responseTime >= DB_HEALTH_WARN_MS
        ? 'degraded'
        : 'healthy';

    return {
      status,
      responseTime,
      connectionCount,
    };
  } catch (error: any) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

export async function getDatabaseStats() {
  try {
    const [tableStats, connectionStats] = await Promise.all([
      prisma.$queryRaw<Array<{ 
        schemaname: string; 
        tablename: string; 
        n_tup_ins: bigint; 
        n_tup_upd: bigint; 
        n_tup_del: bigint;
      }>>`
        SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
        FROM pg_stat_user_tables
        ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC
        LIMIT 10
      `,
      prisma.$queryRaw<Array<{ 
        state: string; 
        count: bigint;
      }>>`
        SELECT state, count(*) as count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `,
    ]);

    return {
      tableStats: tableStats.map((stat) => ({
        schema: stat.schemaname,
        table: stat.tablename,
        inserts: Number(stat.n_tup_ins),
        updates: Number(stat.n_tup_upd),
        deletes: Number(stat.n_tup_del),
      })),
      connectionStats: connectionStats.map((stat) => ({
        state: stat.state,
        count: Number(stat.count),
      })),
    };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return null;
  }
}
