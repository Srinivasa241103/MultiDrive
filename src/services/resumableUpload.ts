import {CONSTANTS} from '../config/constants';

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function initiateSession(
    accessToken: string,
    fileName: string,
    totalSize: number,
): Promise<string>{
    const response = await fetch(`${UPLOAD_BASE}/files?uploadType=resumable&fields=id,md5Checksum`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': 'application/octet-stream',
                'X-Upload-Content-Length': String(totalSize),
            },
            body: JSON.stringify({name: fileName, mimeType: 'application/octet-stream'}),
        },
    );

    if(!response.ok){
        throw new Error(`Failed to initiate resumable session: ${response.status}`);
    }

    const location = response.headers.get('location');
    if(!location){
        throw new Error('Google did not return a session URI (Location header missing)');
    }
    
    return location;
}

async function queryResumeOffset(
    sessionUri: string,
    totalSize: number,
): Promise<number>{
    const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Range': `bytes */${totalSize}`,
    },
  });

  if (response.status === 200 || response.status === 201){
    return totalSize;
  }

  if(response.status === 308){
    const range = response.headers.get('range');
    if(!range) return 0;
    const match = range.match(/bytes=0-(\d+)/);
    return match ? parseInt(match[1], 10) + 1 : 0;
  }

  throw new Error(`Unexpected status when querying resume offset: ${response.status}`);
}

export async function performResumableUpload(
  accessToken: string,
  data: Buffer,
  fileName: string,
): Promise<{ driveFileId: string; md5Checksum: string }> {
  const totalSize = data.length;
  const sessionUri = await initiateSession(accessToken, fileName, totalSize);
 
  let offset = 0;
 
  while (offset < totalSize) {
    const end = Math.min(offset + CONSTANTS.DRIVE_UPLOAD_PIECE_SIZE, totalSize);
    const piece = data.subarray(offset, end);
 
    const response = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        'Content-Length': String(piece.length),
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: Buffer.from(piece),
    });
 
    if (response.status === 308) {
      const range = response.headers.get('range');
      if (range) {
        const match = range.match(/bytes=0-(\d+)/);
        offset = match ? parseInt(match[1], 10) + 1 : 0;
      } else {
        offset = 0;
      }
      continue;
    }
 
    if (response.status === 200 || response.status === 201) {
      const fileData = (await response.json()) as { id: string; md5Checksum: string };
      return {
        driveFileId: fileData.id,
        md5Checksum: fileData.md5Checksum,
      };
    }
 
    if (response.status === 429 || response.status >= 500) {
      offset = await queryResumeOffset(sessionUri, totalSize);
      continue;
    }
 
    throw new Error(`Resumable upload failed at offset ${offset}, status ${response.status}`);
  }
 
  throw new Error('Upload loop exited without a completed response from Google');
}
 