# Nimi Platform: An AI-Native Open World

## Overview

Nimi is an AI-native open world platform that enables creators to build, share, and monetize interactive virtual worlds. Unlike traditional game engines that bolt on AI capabilities as an afterthought, Nimi treats AI as a first-class citizen throughout the entire stack. The platform consists of a lightweight runtime, a cross-platform SDK, and a modular extension system called Nimi Mods.

The vision behind Nimi is to democratize world creation. Instead of requiring years of programming experience or expensive tools, Nimi allows creators to describe their worlds through natural language, structured data, and simple configuration files. The AI subsystem handles the heavy lifting: generating environments, populating worlds with intelligent agents, and creating dynamic narratives that respond to player actions.

## Architecture

The Nimi architecture follows a layered design with clear separation of concerns. At the foundation sits the Runtime, a high-performance Go service that handles core operations including AI inference routing, real-time communication, and state management. Above the runtime sits the SDK, a TypeScript library that provides the developer-facing API for building applications.

The runtime communicates with cloud AI providers through a unified interface called Token API. This abstraction allows seamless switching between providers like OpenAI, Anthropic, Google Gemini, DashScope, and DeepSeek without changing application code. The routing system supports both local inference for privacy-sensitive operations and cloud-based inference for maximum capability.

Applications connect to the runtime through two transport mechanisms. Desktop applications use Tauri IPC for native performance, while web applications connect via gRPC. Both transports present an identical API surface, ensuring code portability between platforms.

## World System

A world in Nimi is a persistent, interactive environment defined by a World Draft specification. Each world has a unique identity, a set of rules governing physics and interaction, and a collection of entities that populate it. Worlds can be published, shared, and forked by the community.

The world creation process follows a structured pipeline. Creators begin by drafting a World Draft that defines the world's theme, rules, and initial state. The draft undergoes validation to ensure consistency, then enters a review process before publication. Once published, worlds become discoverable in the platform marketplace.

World maintenance is an ongoing process. Creators can push incremental mutations to update their worlds without disrupting active sessions. The mutation system supports atomic batched updates, ensuring that changes are applied consistently across all connected clients. Lorebooks provide persistent narrative context that AI agents reference during interactions.

## Agent System

AI agents are the lifeblood of Nimi worlds. Each agent is defined by a Brain specification that describes its personality, knowledge, capabilities, and behavioral constraints. Agents can engage in natural language conversations, perform actions within the world, and collaborate with other agents.

The agent architecture separates the brain from the body. The brain handles cognitive functions like language understanding, reasoning, and decision-making. The body handles physical presence, animation, and environmental interaction. This separation allows the same brain to inhabit different bodies across different worlds.

Agent inference follows a priority-based routing system. High-priority interactions like direct player conversations route to the most capable available model. Background activities like ambient dialogue or environmental observations can use lighter, faster models. The routing system automatically balances quality, latency, and cost based on configurable policies.

Memory is a critical component of the agent system. Short-term memory holds the current conversation context and recent interactions. Long-term memory persists across sessions and stores learned preferences, relationship dynamics, and accumulated knowledge. The memory system uses embedding-based retrieval to efficiently surface relevant memories during interactions.

## Economy System

Nimi includes a built-in economy system that enables creators to monetize their worlds and provides in-world economic mechanics. The economy is built on a gift-based model where users can send appreciation gifts to creators and agents they enjoy interacting with.

Assets within the economy follow a standardized specification. Each asset has a defined type, rarity tier, and set of properties. The asset system supports both fungible tokens for currency-like items and non-fungible tokens for unique collectibles. All economic transactions are logged in an immutable audit trail for transparency.

The economy system integrates tightly with the world system. World creators can define custom economic rules, set up marketplaces within their worlds, and create quests that reward players with in-world currency or items. The economic model ensures that value flows fairly between creators, players, and the platform.

## Mod System

Nimi Mods extend the platform's capabilities through a plugin architecture. Each mod is a self-contained package that declares its required capabilities through a manifest file. The manifest specifies which runtime APIs the mod needs access to, what UI components it provides, and how it integrates with the host application.

Mods interact with the platform through a controlled interface called Nimi Hook. This hook provides a sandboxed execution environment that prevents mods from accessing sensitive system resources directly. All mod-to-runtime communication flows through the SDK, ensuring consistent security and performance guarantees.

The mod ecosystem supports several categories. AI mods enhance agent capabilities with specialized knowledge or skills. Content mods add new world elements like environments, characters, or items. Tool mods provide creator utilities like analytics dashboards, content generators, or moderation tools. Social mods add community features like guilds, tournaments, or collaborative building.

The Knowledge Base mod is one of the core AI mods. It enables agents to access structured document collections through Retrieval-Augmented Generation. Users can upload documents in various formats, which are automatically parsed, chunked, embedded, and indexed. During conversations, the system retrieves relevant chunks based on semantic similarity and injects them into the agent's context for more informed responses.

## Real-Time Communication

Nimi supports real-time multiplayer experiences through a WebSocket-based communication layer. The real-time system handles player presence, state synchronization, and event broadcasting. Each world maintains a persistent connection pool that tracks active participants and distributes updates with minimal latency.

The event system follows a publish-subscribe pattern. Clients subscribe to channels that correspond to world regions, agent conversations, or system notifications. Events are delivered in order with exactly-once semantics, ensuring consistent state across all connected clients.

The scheduler service manages timed events within worlds. Creators can define scheduled actions like daily world resets, periodic agent behaviors, or timed events. The scheduler integrates with the economy system to enable time-based economic mechanics like auctions or seasonal sales.

## Security and Privacy

Security is a foundational concern in Nimi's architecture. The authentication system supports multiple identity providers through a unified auth flow. User sessions are managed through short-lived tokens with automatic refresh, minimizing the window of exposure for compromised credentials.

Data privacy follows a principle of minimal collection. The platform only stores data necessary for core functionality and gives users full control over their data lifecycle. AI interactions can be configured to use local inference when privacy requirements demand it, ensuring that sensitive conversations never leave the user's device.

The audit system maintains comprehensive logs of all significant actions. This includes economic transactions, content modifications, and administrative actions. The audit trail is append-only and tamper-evident, providing a reliable record for dispute resolution and compliance.

## Developer Experience

Nimi prioritizes developer experience through comprehensive tooling and documentation. The SDK provides TypeScript-first APIs with full type safety, ensuring that developers catch errors at compile time rather than runtime. The API follows consistent patterns across all domains, reducing the learning curve for new developers.

The development workflow supports hot-reload for both mod development and world editing. Changes to mod code are automatically detected and reloaded without restarting the host application. World edits preview in real-time, allowing creators to see the impact of their changes immediately.

Testing follows a layered approach. Unit tests verify pure business logic without external dependencies. Integration tests connect to a local runtime instance to verify end-to-end flows. Live smoke tests validate connectivity with cloud providers, automatically skipping when credentials are unavailable to prevent CI breakage.

The platform documentation is organized by audience. Getting-started guides help new users create their first world within minutes. Architecture documents explain the platform's design decisions for contributors. API references provide exhaustive detail for SDK consumers. The spec directory contains formal contracts that govern runtime behavior and SDK compatibility.

## Knowledge Base System

The Knowledge Base is one of Nimi's core mod capabilities, designed to give AI agents access to structured document collections through Retrieval-Augmented Generation. The system processes documents through a multi-stage pipeline that transforms raw files into searchable, semantically-indexed knowledge.

Document ingestion begins when a user uploads a file or pastes text content. The system supports multiple formats including Markdown, plain text, PDF, and DOCX. Each document passes through format-specific parsing to extract clean text content, stripping away formatting artifacts while preserving semantic structure like headings and paragraphs.

After parsing, the text undergoes chunking. The chunking algorithm splits documents at paragraph boundaries with a target size of 512 tokens per chunk and 64 tokens of overlap between adjacent chunks. This overlap ensures that information spanning paragraph boundaries is not lost during retrieval. The chunking process assigns each fragment a unique identifier and records its position within the source document.

The embedding stage transforms each text chunk into a high-dimensional vector representation. The platform supports multiple embedding models through its provider abstraction. By default, it uses OpenAI's text-embedding-3-small model, which produces 1536-dimensional vectors. These vectors capture the semantic meaning of the text, enabling similarity-based retrieval that goes beyond simple keyword matching.

Retrieval follows a cosine similarity search pattern. When a user asks a question, the system generates an embedding for the query and compares it against all stored chunk embeddings. The top-K most similar chunks (default K=5) above a minimum similarity threshold (default 0.3) are selected as context for the AI response.

For multi-turn conversations, the system employs query rewriting. When a user asks a follow-up question that references previous context (such as pronouns or implicit references), a lightweight LLM call rewrites the query to be self-contained. This rewritten query produces better retrieval results because it captures the full intent rather than just the surface-level text.

The response generation phase constructs a prompt that includes the retrieved context chunks, the conversation history, and the user's question. The AI model generates an answer grounded in the provided context, with inline citations using bracket notation to reference specific chunks. This citation system allows users to verify the source of information and assess the reliability of the response.

## Performance and Scaling

Nimi's architecture is designed for horizontal scaling. The runtime is stateless by design, allowing multiple instances to run behind a load balancer. State persistence is delegated to external stores: PostgreSQL for relational data, Redis for caching and session management, and OpenSearch for full-text search capabilities.

The AI inference layer uses an adaptive batching strategy. When multiple requests arrive within a short window, they are batched together for more efficient GPU utilization. The batching system respects priority levels, ensuring that interactive requests are never delayed by background processing tasks.

Resource management follows a quota-based model. Each world has configurable limits for concurrent connections, AI inference calls, and storage consumption. These quotas prevent any single world from monopolizing platform resources and ensure fair access for all creators.

Monitoring and observability are built into every layer. Distributed tracing follows requests from client to runtime to cloud provider, making it straightforward to diagnose latency issues. Metrics are exported in Prometheus format for dashboarding and alerting. The audit log provides a complete record of system activity for compliance and debugging purposes.
