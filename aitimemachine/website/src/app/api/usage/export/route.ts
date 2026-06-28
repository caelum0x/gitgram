import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateCSV, type CSVColumn, type ExportType } from '@/lib/csvExport';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiUsageRow {
  date: string;
  requests: number;
  endpoint: string;
  status: string;
  [key: string]: unknown;
}

interface StorageRow {
  project: string;
  size: string;
  percentage: string;
  lastUpdated: string;
  [key: string]: unknown;
}

interface EndpointRow {
  endpoint: string;
  count: number;
  percentage: string;
  avgResponseTime: string;
  [key: string]: unknown;
}

// Column definitions for each export type
const apiUsageColumns: CSVColumn<ApiUsageRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'requests', header: 'Requests' },
  { key: 'endpoint', header: 'Endpoint' },
  { key: 'status', header: 'Status' },
];

const storageColumns: CSVColumn<StorageRow>[] = [
  { key: 'project', header: 'Project' },
  { key: 'size', header: 'Size (MB)' },
  { key: 'percentage', header: 'Percentage' },
  { key: 'lastUpdated', header: 'Last Updated' },
];

const endpointColumns: CSVColumn<EndpointRow>[] = [
  { key: 'endpoint', header: 'Endpoint' },
  { key: 'count', header: 'Count' },
  { key: 'percentage', header: 'Percentage' },
  { key: 'avgResponseTime', header: 'Avg Response Time (ms)' },
];

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') as ExportType | null;

  if (!type || !['api_usage', 'storage', 'endpoints'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid export type. Must be one of: api_usage, storage, endpoints' },
      { status: 400 }
    );
  }

  try {
    // Try to fetch real data from the API
    const response = await fetch(`${API_URL}/api/internal/usage?userId=${userId}`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET || '' },
      cache: 'no-store',
    });

    let usageData;
    if (response.ok) {
      usageData = await response.json();
    } else {
      // Return empty data when API is unreachable
      usageData = getEmptyUsageData();
    }

    let csvContent: string;
    let filename: string;
    const dateStr = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'api_usage':
        csvContent = generateApiUsageCSV(usageData);
        filename = `api-usage-${dateStr}.csv`;
        break;
      case 'storage':
        csvContent = generateStorageCSV(usageData);
        filename = `storage-breakdown-${dateStr}.csv`;
        break;
      case 'endpoints':
        csvContent = generateEndpointsCSV(usageData);
        filename = `endpoint-stats-${dateStr}.csv`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
    }

    // Return CSV file with proper headers
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Failed to generate CSV export:', error);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }
}

function generateApiUsageCSV(data: UsageData): string {
  // Transform chart data into API usage rows
  const rows: ApiUsageRow[] = (data.chartData || []).map((item) => ({
    date: item.date,
    requests: item.requests,
    endpoint: 'All Endpoints',
    status: 'Success',
  }));

  // Add endpoint breakdown as additional rows
  (data.endpointBreakdown || []).forEach((ep) => {
    rows.push({
      date: new Date().toISOString().split('T')[0],
      requests: ep.count,
      endpoint: ep.endpoint,
      status: 'Aggregated',
    });
  });

  return generateCSV(rows, apiUsageColumns);
}

function generateStorageCSV(data: UsageData): string {
  const rows: StorageRow[] = (data.storageByProject || []).map((project) => ({
    project: project.project,
    size: typeof project.size === 'number' ? project.size.toFixed(2) : String(project.size),
    percentage: `${project.percentage.toFixed(1)}%`,
    lastUpdated: new Date().toISOString().split('T')[0],
  }));

  return generateCSV(rows, storageColumns);
}

function generateEndpointsCSV(data: UsageData): string {
  const rows: EndpointRow[] = (data.endpointBreakdown || []).map((ep) => ({
    endpoint: ep.endpoint,
    count: ep.count,
    percentage: `${ep.percentage.toFixed(1)}%`,
    // Only emit a latency value when the backend actually measured one. Never
    // fabricate a number — an absent metric is reported as "N/A".
    avgResponseTime:
      typeof ep.avgResponseTimeMs === 'number'
        ? ep.avgResponseTimeMs.toFixed(0)
        : 'N/A',
  }));

  return generateCSV(rows, endpointColumns);
}

interface UsageData {
  chartData?: Array<{ date: string; requests: number }>;
  endpointBreakdown?: Array<{
    endpoint: string;
    count: number;
    percentage: number;
    avgResponseTimeMs?: number;
  }>;
  storageByProject?: Array<{ project: string; size: number; percentage: number }>;
}

function getEmptyUsageData(): UsageData {
  return {
    chartData: [],
    endpointBreakdown: [],
    storageByProject: [],
  };
}
