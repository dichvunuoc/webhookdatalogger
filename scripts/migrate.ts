import { readFile, readdir } from "fs/promises";
import path from "path";
import pg from "pg";

function migrationsDir(): string {
  return path.join(process.cwd(), "src/db/migrations");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const dir = migrationsDir();
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), "utf8");
      console.log(`Running migration ${file}...`);
      await client.query(sql);
    }
    console.log("Migrations finished.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
