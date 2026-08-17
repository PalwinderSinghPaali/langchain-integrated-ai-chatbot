import { initVectorStore } from "./vector/init-vectorstore";

async function run() {
  await initVectorStore();
  console.log("AI memory trained successfully.");
}

run();