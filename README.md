# LangChain + LangGraph AI Chatbot

An AI-powered conversational application built with **Next.js, LangChain, LangGraph, and OpenAI**, featuring an agent-based architecture capable of interacting with application data through a database.

The project demonstrates how modern LLM applications can move beyond simple prompt → response workflows by giving an AI agent access to external data and tools.

## 🚀 What This Project Demonstrates

* **LLM-powered conversational interface**
* **LangChain** integration for building AI workflows
* **LangGraph** for agent-based workflow orchestration
* **OpenAI** integration for natural-language responses
* **Database-aware AI agent** capable of using application data as a source
* Structured separation between the chat interface, AI workflow, and data layer
* Next.js application architecture with TypeScript

## 🧠 How It Works

```text
User
  │
  ▼
Chat Interface
  │
  ▼
Next.js Application
  │
  ▼
LangGraph Agent
  │
  ├── Understand User Intent
  │
  ├── Decide Whether Data Is Required
  │
  └── Query Application Data
          │
          ▼
      Database
          │
          ▼
     Agent Context
          │
          ▼
       OpenAI
          │
          ▼
     AI Response
```

The key idea is that the model isn't limited to information contained in the prompt. The agent can use application data as an external source when generating its response.

## 🛠️ Tech Stack

* **Next.js**
* **TypeScript**
* **LangChain**
* **LangGraph**
* **OpenAI**
* **Database integration**
* **React**

## 🎯 Why I Built This

This project explores the architecture behind modern AI applications and demonstrates how **LLMs, agents, external tools, and application databases can work together** to create context-aware conversational experiences.

Rather than treating an LLM as a simple chatbot, the project focuses on building an application where the model can reason about the user's request and interact with external application data.

## 🔍 Key Engineering Concepts

* Agent-based AI workflows
* LLM tool integration
* External data access
* Context-aware responses
* AI application architecture
* Next.js + TypeScript integration
* Database-backed AI systems

## 📌 Project Status

This is a learning and experimentation project focused on exploring **LangChain, LangGraph, agent architectures, and LLM-powered applications**.

More capabilities can be added around authentication, persistent conversation history, additional tools, structured outputs, observability, and production-grade security.

---

**Built by [Palwinder Singh](https://github.com/PalwinderSinghPaali)**
