/**
 * Meta Data Deletion Status Endpoint
 * Meta polls this URL to check if deletion was completed.
 *
 * GET /api/auth/instagram/delete-data/status?id=<confirmation_code>
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get('id');

  return NextResponse.json({
    id,
    status: 'complete'
  });
}
