import fs from "node:fs";
import mongoose from "mongoose";
import type { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "./config";

let mem: MongoMemoryServer | null = null;

/**
 * Connect to MONGO_URI, or (dev/test) start an embedded MongoDB.
 * In dev the embedded database is persisted in storage/mongo so data survives restarts.
 */
export async function connectDb(opts: { ephemeral?: boolean } = {}): Promise<void> {
  let uri = config.mongoUri;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    if (opts.ephemeral) {
      mem = await MongoMemoryServer.create();
    } else {
      fs.mkdirSync(config.mongoDataDir, { recursive: true });
      mem = await MongoMemoryServer.create({ instance: { dbPath: config.mongoDataDir, storageEngine: "wiredTiger", port: 27027 } });
      // If the embedded mongod dies, stop the backend loudly instead of leaving every request hanging.
      mem.instanceInfo?.instance.once("instanceClosed" as any, () => {
        if (!mem) return; // normal shutdown via disconnectDb()
        console.error("Embedded MongoDB stopped unexpectedly. Restart the backend (npm run dev).");
        process.exit(1);
      });
    }
    uri = mem.getUri("tolpraman");
  }
  // Fail fast (503) instead of queueing queries forever when the database is unreachable.
  await mongoose.connect(uri, { dbName: "tolpraman", serverSelectionTimeoutMS: 5000 });
}

/** True when the database connection is up. */
export const dbReady = () => mongoose.connection.readyState === 1;

export async function disconnectDb(): Promise<void> {
  // Flush to disk before stopping an embedded server, otherwise the last writes can be lost.
  if (mem) await mongoose.connection.db?.admin().command({ fsync: 1 }).catch(() => {});
  await mongoose.disconnect();
  const m = mem;
  mem = null; // clear first so the instanceClosed handler sees a normal shutdown
  if (m) await m.stop();
}
