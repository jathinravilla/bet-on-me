// Can we log in to the database? `npx tsx --env-file=.env.local scripts/check-db.ts`
import { MongoClient } from "mongodb";
const c = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
c.connect()
  .then(() => c.db("betonme").command({ ping: 1 }))
  .then(() => console.log("DATABASE OK"))
  .catch((e) => console.log("DATABASE FAILED:", String(e.message).replace(/mongodb\+srv:\/\/\S+/g, "<url>").slice(0, 120)))
  .finally(() => c.close());
