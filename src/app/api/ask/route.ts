import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { pgPool } from '../../lib/db';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function getDatabaseSchema(): Promise<string> {
  const query = `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `;

  const result = await pgPool.query(query);
  const schema: Record<string, { column: string; type: string }[]> = {};

  result.rows.forEach(({ table_name, column_name, data_type }) => {
    if (!schema[table_name]) schema[table_name] = [];
    schema[table_name].push({ column: column_name, type: data_type });
  });

  return JSON.stringify(schema, null, 0).slice(0, 10000);
}

function extractJSON(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Invalid JSON structure');
  return JSON.parse(text.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Invalid question' }, { status: 400 });
    }

    const schema = await getDatabaseSchema();

    const prompt = `
You are a PostgreSQL data analyst assistant.

Given the user's question and the following database schema:

${schema}

Generate a JSON response with:
{
  "answer": "...",
  "query": "...",
  "analysis": "..."
}

ONLY return valid JSON. Do not include commentary.
User question: "${question}"
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a SQL generator for PostgreSQL. Only return valid JSON.' },
        { role: 'user', content: prompt }
      ]
    });

    const gptResponse = completion.choices[0].message?.content;
 
    if (!gptResponse) {
      return NextResponse.json({ error: 'No response from OpenAI' }, { status: 500 });
    }

    let parsed;
    try {
      parsed = extractJSON(gptResponse);

     } catch (err) {
      return NextResponse.json({ error: 'Failed to parse GPT response', raw: gptResponse }, { status: 500 });
    }

    let rawData = [];
    try {
      const result = await pgPool.query(parsed.query);
       rawData = result.rows;
    } catch (err: any) {
      return NextResponse.json({
        error: 'SQL execution failed',
        query: parsed.query,
        details: err.message
      }, { status: 500 });
    }

    return NextResponse.json({
      answer: parsed.answer,
      query: parsed.query,
      analysis: parsed.analysis,
      rawData
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Unexpected server error', details: err.message }, { status: 500 });
  }
}