import { pgPool } from './db';

export interface ColumnMetadata {
  name: string;
  type: string;
  description?: string;
  is_primary?: boolean;
  is_foreign?: boolean;
  foreign_table?: string;
}

export interface TableMetadata {
  name: string;
  description?: string;
  columns: ColumnMetadata[];
  sample_data?: Record<string, any>[];
}

export async function dbMetadata(): Promise<TableMetadata[]> {
  const client = await pgPool.connect();
  try {
    // Get tables with descriptions from pg_description if available
    const tablesRes = await client.query(`
      SELECT 
        t.table_name,
        obj_description(('public.' || t.table_name)::regclass, 'pg_class') as description
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
    `);

    const metadata: TableMetadata[] = [];
    
    for (const table of tablesRes.rows) {
      // Get columns with extended metadata
      const columnsRes = await client.query(`
        SELECT 
          c.column_name,
          c.data_type,
          c.column_default,
          c.is_nullable,
          kcu.constraint_type,
          kcu2.table_name as foreign_table
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_name = kcu.table_name 
          AND c.column_name = kcu.column_name
          AND kcu.constraint_name IN (
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
          )
        LEFT JOIN information_schema.referential_constraints rc
          ON kcu.constraint_name = rc.constraint_name
        LEFT JOIN information_schema.key_column_usage kcu2
          ON rc.unique_constraint_name = kcu2.constraint_name
          AND kcu.position_in_unique_constraint = kcu2.ordinal_position
        WHERE c.table_name = $1
      `, [table.table_name]);

      // Get sample data (first 3 rows) for better understanding
      const sampleRes = await client.query(`
        SELECT * FROM "${table.table_name}" LIMIT 3
      `);

      metadata.push({
        name: table.table_name,
        description: table.description || undefined,
        columns: columnsRes.rows.map(row => ({
          name: row.column_name,
          type: row.data_type,
          is_primary: row.constraint_type === 'PRIMARY KEY',
          is_foreign: row.constraint_type === 'FOREIGN KEY',
          foreign_table: row.foreign_table
        })),
        sample_data: sampleRes.rows
      });
    }

    return metadata;
  } finally {
    client.release();
  }
}