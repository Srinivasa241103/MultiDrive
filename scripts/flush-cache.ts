import IORedis from 'ioredis';
const r = new IORedis('redis://localhost:6379', { maxRetriesPerRequest: null });
const keys = await r.keys('chunk:*');
if (keys.length) {
  await r.del(...keys);
  console.log(`Deleted ${keys.length} cached chunks`);
} else {
  console.log('No chunk cache entries found');
}
await r.quit();
