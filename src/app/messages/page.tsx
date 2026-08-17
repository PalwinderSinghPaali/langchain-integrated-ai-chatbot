"use client";
import { useRef, useState } from "react";
import { Paperclip, SendHorizonal } from "lucide-react";

export default function ChatBot() {
  const [messages, setMessages] = useState<
    Array<{ type: "user" | "bot"; content: any }>
  >([]);
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setMessages((prev) => [...prev, { type: "user", content: input }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input }),
      });

      const data = await res.json();

      setMessages((prev) => [...prev, { type: "bot", content: data }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          content: { error: "Something went wrong. Please try again." },
        },
      ]);
    } finally {
      setLoading(false);
      setInput("");
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sanitizedFileName = file.name.toLowerCase().replace(/[^a-z0-9]/gi, "_");

    if (sanitizedFileName.length > 48) {
      setUploadMessage("❌ File name too long. Please rename and try again.");
      return;
    }

    setFileName(file.name);
    setUploadMessage("📄 Uploading document in database...");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadMessage(`✅ Uploaded: ${file.name}`);
        setTimeout(() => setUploadMessage(""), 600);
      } else {
        setUploadMessage(`❌ Upload failed: ${data.error || "Unknown error"}`);
        setFileName("");
      }
    } catch (error) {
      setUploadMessage("❌ Upload failed");
      setFileName("");
    } finally {
      setUploading(false);
    }
  };

  const renderRawData = (data: any) => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const headers = Object.keys(data[0]);

    return (
      <div className="overflow-x-auto">
        <table className="text-sm border border-gray-300 rounded-sm">
          <thead className="bg-gray-100">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2 text-left border-b font-semibold text-gray-700"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, i: number) => (
              <tr key={i} className="even:bg-white odd:bg-gray-50">
                {headers.map((header) => (
                  <td key={header} className="px-3 py-2 border-b text-gray-700">
                    {String(row[header])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e2f]">
      <div className="p-4 bg-[#1e1e2f] text-white border border-white mx-1 rounded-xl">
        <h1 className="text-xl font-semibold">Database Analytics Assistant</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1e1e2f]">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"
              }`}
          >
            {msg.type === "user" ? (
              <p className="p-3 rounded-4xl text-sm shadow bg-gradient-to-br from-purple-500 to-purple-700 text-white py-2 font-semibold px-4 break-words">
                {msg.content}
              </p>
            ) : msg.content.error ? (
              <p className="p-3 rounded-2xl text-sm shadow bg-gray-800 text-red-500 py-3 font-semibold m-[40px] px-4">
                {msg.content.error}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 text-lg">🤖</span>
                  <p className="bg-gray-800 text-white leading-relaxed rounded-2xl p-3">
                    {msg.content.answer}
                  </p>
                </div>
                <div className="mt-2">
                  {renderRawData(msg.content.rawData)}
                </div>
              </div>
            )}
           </div>
        ))}
        <div ref={endRef} />
      </div>
     <p className="flex w-full text-white font-semibold">{uploadMessage}</p>
      <div className="border-t border-gray-300 flex items-center justify-between gap-3 px-2 mb-2 pt-4 bg-[#1e1e2f]">
        <div className="flex items-center space-x-2 w-full">
          <label
            className={`flex-shrink-0 ${loading || uploading ? "cursor-not-allowed" : "cursor-pointer"
              }`}
          >
            <Paperclip className="w-5 h-5 text-gray-400 hover:text-gray-200" />
            <input
              type="file"
              onChange={handleUpload}
              className="hidden"
              disabled={loading || uploading}
            />
          </label>
          <div className="w-full">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Ask about your data..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 outline-none focus:outline-none text-white placeholder:text-white"
              disabled={loading}
            />
          </div>
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <SendHorizonal className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
