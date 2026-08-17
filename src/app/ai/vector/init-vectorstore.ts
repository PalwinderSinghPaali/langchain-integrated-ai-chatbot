import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import fs from 'fs';
import path from 'path';

export async function initVectorStore() {
  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "app", "ai", "memory", "schema.json"), "utf8"));
  // const rules = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "app", "ai", "memory", "rules.json"), "utf8"));
  const examples = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "app", "ai", "memory", "predefined-sql.json"), "utf8"));
  const docs: string[] = [];

  docs.push("=== DATABASE SCHEMA ===\n" + JSON.stringify(schema, null, 2));
  docs.push("=== SQL EXAMPLES ===\n" + JSON.stringify(examples, null, 2));

  const vectorStore = await MemoryVectorStore.fromTexts(
    docs,
    [{ type: "schema" }, { type: "rules" }, { type: "examples" }],
    new OpenAIEmbeddings()
  );

  return vectorStore;
}
