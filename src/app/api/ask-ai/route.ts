import { NextRequest, NextResponse } from 'next/server';
// import { pgPool } from '../../lib/db';
import { ChatOpenAI } from '@langchain/openai';

import { SqlDatabase } from "@langchain/classic/sql_db";
import { DataSource } from "typeorm";
import { tool } from "langchain";
import { z } from "zod";
import { AIMessage, ToolMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import { retrieveRelevantKnowledge } from '@/app/ai/agent/rag-retriever';

const dbPath = "postgresql://postgres:root@127.0.0.1:5432/tracebale_new_local";

const datasource = new DataSource({
  type: "postgres",
  host: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "root",
  database: "tracebale_new_local",
});

// const datasource = new DataSource({ type: "postgres", database: dbPath });
const db = await SqlDatabase.fromDataSourceParams({ appDataSource: datasource });
const dialect = db.appDataSourceOptions.type;

console.log(`Dialect: ${dialect}`);
const tableNames = db.allTables.map(t => t.tableName);
console.log(`Available tables: ${tableNames.join(", ")}`);

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4.1-mini", // or gpt-4.1-math, etc.
});

// const llm = new ChatOpenAI({
//     model: "gpt-4o",
//     temperature: 0,
//     openAIApiKey: process.env.OPENAI_API_KEY!,
//   });

// Tool to list all tables
const listTablesTool = tool(
  async () => {
    const tableNames = db.allTables.map(t => t.tableName);
    return tableNames.join(", ");
  },
  {
    name: "sql_db_list_tables",
    description: "Input is an empty string, output is a comma-separated list of tables in the database.",
    schema: z.object({}),
  }
);

// Tool to get schema for specific tables
const getSchemaTool = tool(
  async ({ table_names }) => {
    const tables = table_names.split(",").map(t => t.trim());
    return await db.getTableInfo(tables);
  },
  {
    name: "sql_db_schema",
    description: "Input to this tool is a comma-separated list of tables, output is the schema and sample rows for those tables. Be sure that the tables actually exist by calling sql_db_list_tables first! Example Input: table1, table2, table3",
    schema: z.object({
      table_names: z.string().describe("Comma-separated list of table names"),
    }),
  }
);

// Tool to execute SQL query
const queryTool = tool(
  async ({ query }) => {
    try {
      const result = await db.run(query);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: "sql_db_query",
    description: "Input to this tool is a detailed and correct SQL query, output is a result from the database. If the query is not correct, an error message will be returned. If an error is returned, rewrite the query, check the query, and try again.",
    schema: z.object({
      query: z.string().describe("SQL query to execute"),
    }),
  }
);

const tools = [listTablesTool, getSchemaTool, queryTool];

for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}\n`);
}

// Create tool nodes for schema and query execution
const getSchemaNode = new ToolNode([getSchemaTool]);
const runQueryNode = new ToolNode([queryTool]);

// NEW: Add vector store retrieval as first step
async function retrieveContext(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const question = typeof lastMessage.content === 'string' 
    ? lastMessage.content 
    : JSON.stringify(lastMessage.content);
  
  // Retrieve relevant rules/context from vector store
  const relevantKnowledge = await retrieveRelevantKnowledge(question);
  
  // Add context as a system message that will be available throughout
  const contextMessage = new SystemMessage(
    `IMPORTANT DOMAIN KNOWLEDGE AND RULES:\n\n${relevantKnowledge}\n\n` +
    `Use this knowledge to understand the question context, business rules, and data semantics.`
  );

  console.log(relevantKnowledge);
  
  return { messages: [contextMessage] };
}


// Example: create a predetermined tool call
async function listTables(state: typeof MessagesAnnotation.State) {
  const toolCall = {
    name: "sql_db_list_tables",
    args: {},
    id: "abc123",
    type: "tool_call" as const,
  };
  const toolCallMessage = new AIMessage({
    content: "",
    tool_calls: [toolCall],
  });

  const toolMessage = await listTablesTool.invoke({});
  const response = new AIMessage(`Available tables: ${toolMessage}`);

  return { messages: [toolCallMessage, new ToolMessage({ content: toolMessage, tool_call_id: "abc123" }), response] };
}

// Example: force a model to create a tool call
async function callGetSchema(state: typeof MessagesAnnotation.State) {
  const llmWithTools = llm.bindTools([getSchemaTool], {
    tool_choice: "any",
  });
  const response = await llmWithTools.invoke(state.messages);

  return { messages: [response] };
}

const topK = 5;

const generateQuerySystemPrompt = `
You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct ${dialect}
query to run, then look at the results of the query and return the answer. Unless
the user specifies a specific number of examples they wish to obtain, always limit
your query to at most ${topK} results.

You can order the results by a relevant column to return the most interesting
examples in the database. Never query for all the columns from a specific table,
only ask for the relevant columns given the question.

DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.
`;

async function generateQuery(state: typeof MessagesAnnotation.State) {
  const systemMessage = new SystemMessage(generateQuerySystemPrompt);
  // We do not force a tool call here, to allow the model to
  // respond naturally when it obtains the solution.
  const llmWithTools = llm.bindTools([queryTool]);
  const response = await llmWithTools.invoke([systemMessage, ...state.messages]);

  return { messages: [response] };
}

const checkQuerySystemPrompt = `
You are a SQL expert with a strong attention to detail.
Double check the ${dialect} query for common mistakes, including:
- Using NOT IN with NULL values
- Using UNION when UNION ALL should have been used
- Using BETWEEN for exclusive ranges
- Data type mismatch in predicates
- Properly quoting identifiers
- Using the correct number of arguments for functions
- Casting to the correct data type
- Using the proper columns for joins

If there are any of the above mistakes, rewrite the query. If there are no mistakes,
just reproduce the original query.

You will call the appropriate tool to execute the query after running this check.
`;

async function checkQuery(state: typeof MessagesAnnotation.State) {
  const systemMessage = new SystemMessage(checkQuerySystemPrompt);

  // Generate an artificial user message to check
  const lastMessage: any = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    throw new Error("No tool calls found in the last message");
  }
  const toolCall = lastMessage.tool_calls[0];
  const userMessage = new HumanMessage(toolCall.args.query);
  const llmWithTools = llm.bindTools([queryTool], {
    tool_choice: "any",
  });
  const response = await llmWithTools.invoke([systemMessage, userMessage]);
  // Preserve the original message ID
  response.id = lastMessage.id;

  return { messages: [response] };
}


function shouldContinue(state: typeof MessagesAnnotation.State): "check_query" | typeof END {
  const messages = state.messages;
  const lastMessage: any = messages[messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return END;
  } else {
    return "check_query";
  }
}

const builder = new StateGraph(MessagesAnnotation)
  .addNode("retrieve_context", retrieveContext)
  .addNode("list_tables", listTables)
  .addNode("call_get_schema", callGetSchema)
  .addNode("get_schema", getSchemaNode)
  .addNode("generate_query", generateQuery)
  .addNode("check_query", checkQuery)
  .addNode("run_query", runQueryNode)
  .addEdge(START, "retrieve_context")  // NEW: Start with context retrieval
  .addEdge("retrieve_context", "list_tables")  // NEW: Then list tables
  .addEdge("list_tables", "call_get_schema")
  .addEdge("call_get_schema", "get_schema")
  .addEdge("get_schema", "generate_query")
  .addConditionalEdges("generate_query", shouldContinue)
  .addEdge("check_query", "run_query")
  .addEdge("run_query", "generate_query");

const agent = builder.compile();

// let sqlChain: any = null;

// async function getSqlChain() {
//   if (sqlChain) return sqlChain;

//   // Connect LangChain directly to your existing PostgreSQL
//   const db = await SqlDatabase.fromDataSourceParams({
//     pool: pgPool,
//   });

//   const llm = new ChatOpenAI({
//     model: "gpt-4o",
//     temperature: 0,
//     openAIApiKey: process.env.OPENAI_API_KEY!,
//   });

//   // Custom prompt tailored for Indian cotton ginning seasons
//   const customPrompt = PromptTemplate.fromTemplate(`
// You are an expert cotton ginning analyst in India. Seasons run from October to September (e.g., 2024-25 season = Oct 2024 to Sep 2025).

// Understand questions in Hindi + English. Always detect the season correctly.

// Examples:
// - "Is season" or "current season" → 2024-25
// - "Last season" → 2023-24
// - "2023 me" → 2023-24 season

// Database has tables like: ginners, gin_processings, procurements, etc.
// Assume gin processing data is in a table called "gin_processings" or "processing_logs" with columns like:
// - gin_id / ginner_id
// - processing_date (DATE)
// - bales_produced
// - seed_cotton_weight
// - lint_weight
// - season (TEXT like '2024-25') OR derive from date

// Your job:
// 1. Generate ONLY a valid PostgreSQL query
// 2. Always return season-wise grouped data when asked
// 3. Use proper season logic: WHERE processing_date BETWEEN 'YYYY-10-01' AND '(YYYY+1)-09-30'

// Question: {input}

// If the question is about gin-wise, season-wise processed cotton/bales → generate query with GROUP BY ginner name and season.

// Return only the SQL query. No explanation.
// `);

//   sqlChain = createSqlQueryChain({
//     llm,
//     db,
//     prompt: customPrompt,
//   });

//   return sqlChain;
// }

export async function POST(req: NextRequest) {
  // return NextResponse.json({ error: "API disabled temporarily" }, { status: 503 });
  try {
    const { question } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const stream = await agent.stream(
      { messages: [{ role: "user", content: question }] },
      { streamMode: "values" }
    );

    let msg = ''

    for await (const step of stream) {
      if (step.messages && step.messages.length > 0) {
        const lastMessage: any = step.messages[step.messages.length - 1];
        msg += lastMessage.toFormattedString();
        console.log(lastMessage.toFormattedString());
      }
    }

    return NextResponse.json({ answer: msg });
  } catch (err: any) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}