import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Validate IPv4, IPv6, and CIDR notation
function isValidIpOrCidr(value: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv4 CIDR pattern
  const ipv4CidrPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:3[0-2]|[12]?[0-9])$/;
  // IPv6 pattern (simplified - accepts standard formats)
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$/;
  // IPv6 CIDR pattern
  const ipv6CidrPattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$|^(?:[0-9a-fA-F:]+)\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;

  return ipv4Pattern.test(value) || ipv4CidrPattern.test(value) || ipv6Pattern.test(value) || ipv6CidrPattern.test(value);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { allowedIps } = body;

    // Validate that allowedIps is an array
    if (!Array.isArray(allowedIps)) {
      return NextResponse.json(
        { error: 'allowedIps must be an array' },
        { status: 400 }
      );
    }

    // Validate each IP address
    for (const ip of allowedIps) {
      if (typeof ip !== 'string' || !isValidIpOrCidr(ip.trim())) {
        return NextResponse.json(
          { error: `Invalid IP address or CIDR: ${ip}` },
          { status: 400 }
        );
      }
    }

    // Normalize IPs (trim whitespace)
    const normalizedIps = allowedIps.map((ip: string) => ip.trim());

    // Update the key's allowedIps in the backend
    const response = await fetch(`${API_URL}/api/internal/keys/${id}/ips`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ allowedIps: normalizedIps }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to update IP allowlist' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, allowedIps: normalizedIps });
  } catch (error) {
    console.error('Failed to update IP allowlist:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Get the key's allowedIps from the backend
    const response = await fetch(`${API_URL}/api/internal/keys/${id}/ips`, {
      headers: {
        'X-Internal-Secret': process.env.INTERNAL_SECRET || '',
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to get IP allowlist' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ allowedIps: data.allowedIps || [] });
  } catch (error) {
    console.error('Failed to get IP allowlist:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
