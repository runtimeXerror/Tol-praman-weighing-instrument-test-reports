import { createApp } from "./app";
import { config } from "./config";
import { connectDb, disconnectDb } from "./db";
import { ensureBuiltInPacks } from "./lib/packs";
import { Report, User } from "./models";
import { seed } from "./seed";

async function main() {
  await connectDb();
  await ensureBuiltInPacks();
  // One case can now have several reports (revisions): drop the old one-report-per-case index.
  await Report.syncIndexes();
  if ((await User.countDocuments()) === 0) {
    console.log("Empty database: seeding demo data...");
    await seed();
  }
  const server = createApp().listen(config.port, () => {
    console.log(`TOLPRAMAN backend on http://localhost:${config.port}/api  (web: ${config.publicWebUrl})`);
  });
  // Clean shutdown: flush and stop the (embedded) database so no writes are lost.
  const stop = async () => {
    server.close();
    await disconnectDb().catch(() => {});
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
