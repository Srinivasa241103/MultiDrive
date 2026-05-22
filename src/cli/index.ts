import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createWriteStream, readFileSync } from 'fs';

const BASE_URL = 'http://localhost:3000';
const TOKEN = process.env.CLI_TOKEN ?? '';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
};

yargs(hideBin(process.argv))
  .command(
    'upload <file>',
    'Upload a file to MultiDrive',
    (y) => y.positional('file', { type: 'string', demandOption: true }),
    async (argv) => {
      const filePath = argv.file as string;
      const fileName = filePath.split('/').pop()!;

      const formData = new FormData();
      const fileBlob = new Blob([readFileSync(filePath)]);
      formData.append('file', fileBlob, fileName);

      const res = await fetch(`${BASE_URL}/files/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const body = await res.json() as any;
      if (!res.ok) {
        console.error('Upload failed:', body);
        process.exit(1);
      }

      console.log(`Upload initiated — fileId: ${body.fileId}, chunks: ${body.totalChunks}`);
      console.log('Polling status...');

      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`${BASE_URL}/files/${body.fileId}/status`, { headers });
        const status = await statusRes.json() as any;
        console.log(`  ${status.completedChunks}/${status.totalChunks} chunks — ${status.status}`);
        if (status.status === 'COMMITTED') {
          console.log('Upload complete.');
          break;
        }
        if (status.status === 'FAILED') {
          console.error('Upload failed.');
          process.exit(1);
        }
      }
    },
  )
  .command(
    'download <fileId> <output>',
    'Download a file from MultiDrive',
    (y) =>
      y
        .positional('fileId', { type: 'string', demandOption: true })
        .positional('output', { type: 'string', demandOption: true }),
    async (argv) => {
      const res = await fetch(`${BASE_URL}/files/${argv.fileId}/download`, { headers });
      if (!res.ok) {
        console.error('Download failed:', await res.text());
        process.exit(1);
      }

      const writer = createWriteStream(argv.output as string);
      const reader = res.body!.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(Buffer.from(value));
      }

      writer.end();
      console.log(`Downloaded to ${argv.output}`);
    },
  )
  .command(
    'list',
    'List all uploaded files',
    () => {},
    async () => {
      const res = await fetch(`${BASE_URL}/files`, { headers });
      const files = await res.json() as any[];
      if (!files.length) {
        console.log('No files found.');
        return;
      }
      files.forEach((f) => {
        console.log(`${f.id}  ${f.name}  ${f.status}  ${f.sizeBytes} bytes`);
      });
    },
  )
  .demandCommand(1)
  .parse();