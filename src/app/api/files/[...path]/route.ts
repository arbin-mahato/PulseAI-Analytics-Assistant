import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  try {
    // Serve from global folders:
    // /api/files/images/sessionId__file.png -> generated_files/images/sessionId__file.png
    // If real sessionId file doesn't exist, try temp_ version
    const filePath = path.join('/');
    let fullPath = join(process.cwd(), 'generated_files', filePath);
    
    if (!existsSync(fullPath)) {
      // Try temp_ version: replace sessionId with temp_* pattern
      const { readdirSync } = require('fs');
      const dir = join(process.cwd(), 'generated_files', path[0]);
      const filename = path.slice(1).join('/');
      const baseFilename = filename.replace(/^[^_]+__/, '');
      
      if (existsSync(dir)) {
        const files = readdirSync(dir);
        const tempFile = files.find((f: string) => f.startsWith('temp_') && f.endsWith('__' + baseFilename));
        if (tempFile) {
          fullPath = join(dir, tempFile);
          console.log(`🔄 Serving temp file: ${tempFile} for requested: ${filename}`);
        }
      }
      
      if (!existsSync(fullPath)) {
        return new NextResponse('File not found', { status: 404 });
      }
    }

    const fileBuffer = await readFile(fullPath);
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    let contentType = 'application/octet-stream';
    if (extension === 'pdf') contentType = 'application/pdf';
    else if (extension === 'png') contentType = 'image/png';
    else if (extension === 'jpg' || extension === 'jpeg') contentType = 'image/jpeg';
    else if (extension === 'svg') contentType = 'image/svg+xml';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}