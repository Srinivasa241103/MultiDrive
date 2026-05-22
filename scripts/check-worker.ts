import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { execSync } from 'child_process';
import { config } from '../src/config/env';

const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('chunk-upload', { connection: redis });

async function main() {
  // 1. Process check
  let processRunning = false;
  try {
    const out = execSync('pgrep -f "uploadWorker"').toString().trim();
    processRunning = out.length > 0;
  } catch {
    processRunning = false;
  }
  console.log(`Process running : ${processRunning ? '✓ yes' : '✗ no'}`);

  // 2. Active BullMQ workers registered in Redis
  const workers = await queue.getWorkers();
  console.log(`Active workers  : ${workers.length > 0 ? `✓ ${workers.length}` : '✗ 0'}`);
  workers.forEach(w => console.log(`  - ${w.name} (addr: ${w.addr})`));

  // 3. Queue stats
  const [waiting, active, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);
  console.log(`\nQueue stats (chunk-upload):`);
  console.log(`  waiting   : ${waiting}`);
  console.log(`  active    : ${active}`);
  console.log(`  completed : ${completed}`);
  console.log(`  failed    : ${failed}`);

  await queue.close();
  await redis.quit();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
