import { initVectorStore } from "./init-vectorstore";

let store: any = null;

export async function getVectorStore() {
  if (!store) store = await initVectorStore();
  return store;
}
