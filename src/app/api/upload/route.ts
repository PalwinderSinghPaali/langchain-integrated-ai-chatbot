import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
 import { Pool } from "pg";
 const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase();
    let text = "";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ---- PARSE FILE ----
    if (ext === "pdf") {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === "xlsx") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      workbook.SheetNames.forEach(sheet => {
        text += XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]);
      });
    } else if (ext === "csv") {
      text = buffer.toString("utf-8"); // simple CSV as text
    } else if (ext === "txt") {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    // ---- INSERT INTO DB ----
    const jsonContent = { rawText: text };

    await pool.query(
      `INSERT INTO file_chunks (id, filename, content) VALUES ($1, $2, $3)`,
      [uuidv4(), filename, JSON.stringify(jsonContent)] // ✅ stringify
    );

    return NextResponse.json({ message: "File uploaded successfully!" });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process the file" },
      { status: 500 }
    );
  }
}
