"use client";

import { useEffect, useRef, useState } from "react";

type Paper = {
  name: string;
  category: string;
  pages: number | null;
  color: string;
  size?: number;
  status: "indexed" | "ready" | "processing" | "error";
  isSample?: boolean;
  documentId?: string;
};

type ChatSource = {
  paper: string;
  page: number | string;
  score: number;
  text: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
};

type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

const API_URL = "http://127.0.0.1:8000";
const STORAGE_KEY = "researchpaper-ai-chats-v1";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

const initialPapers: Paper[] = [
  {
    name: "paper1.pdf",
    category: "Quantitative Investing",
    pages: 45,
    color: "#A78BFA",
    status: "indexed",
    isSample: true,
  },
  {
    name: "paper2.pdf",
    category: "Regime Uncertainty & Itô Correction",
    pages: 10,
    color: "#6EE7B7",
    status: "indexed",
    isSample: true,
  },
  {
    name: "paper3.pdf",
    category: "Inflation & Stock Returns",
    pages: 7,
    color: "#FBBF77",
    status: "indexed",
    isSample: true,
  },
];

const navItems = [
  { name: "Overview", icon: "◫" },
  { name: "Research Chat", icon: "⌕" },
  { name: "Paper Library", icon: "▤" },
  { name: "Compare Papers", icon: "⇄" },
  { name: "Literature Review", icon: "▧" },
];

const suggestions = [
  "Volatility & returns",
  "Regime uncertainty",
  "Itô correction",
];

function createChat(): ChatConversation {
  const now = Date.now();

  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [papers, setPapers] = useState<Paper[]>(initialPapers);
  const [question, setQuestion] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState("");
  // Compare Papers
const [compareIds, setCompareIds] = useState<string[]>([]);
const [comparison, setComparison] = useState("");
const [compareSources, setCompareSources] = useState<ChatSource[]>([]);
const [isComparing, setIsComparing] = useState(false);
const [compareError, setCompareError] = useState("");

// Literature Review
const [reviewIds, setReviewIds] = useState<string[]>([]);
const [researchTopic, setResearchTopic] = useState("");
const [literatureReview, setLiteratureReview] = useState("");
const [reviewSources, setReviewSources] = useState<ChatSource[]>([]);
const [isGeneratingReview, setIsGeneratingReview] = useState(false);
const [reviewError, setReviewError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRequestId = useRef(0);

  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const messages = activeChat?.messages ?? [];

  // Load saved chats from the browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (Array.isArray(parsed) && parsed.length > 0) {
          const validChats = (parsed as ChatConversation[]).filter(
            (chat) =>
              typeof chat.id === "string" &&
              typeof chat.title === "string" &&
              Array.isArray(chat.messages)
          );

          if (validChats.length > 0) {
            setChats(validChats);
            setActiveChatId(validChats[0].id);
          } else {
            const fresh = createChat();
            setChats([fresh]);
            setActiveChatId(fresh.id);
          }
        } else {
          const fresh = createChat();
          setChats([fresh]);
          setActiveChatId(fresh.id);
        }
      } else {
        const fresh = createChat();
        setChats([fresh]);
        setActiveChatId(fresh.id);
      }
    } catch {
      const fresh = createChat();
      setChats([fresh]);
      setActiveChatId(fresh.id);
    } finally {
      setStorageReady(true);
    }
  }, []);

  // Save chats whenever their contents change.
  useEffect(() => {
    if (!storageReady) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (error) {
      console.error("Could not save chat history:", error);
    }
  }, [chats, storageReady]);

  function updateChat(
    id: string,
    updater: (chat: ChatConversation) => ChatConversation
  ) {
    setChats((current) =>
      current.map((chat) => (chat.id === id ? updater(chat) : chat))
    );
  }

  function newChat() {
    // Ignore late responses from a request belonging to the old chat.
    chatRequestId.current += 1;

    const fresh = createChat();

    setChats((current) => [fresh, ...current]);
    setActiveChatId(fresh.id);
    setQuestion("");
    setChatError("");
    setIsAsking(false);
    setActiveNav("Research Chat");
  }

  function switchChat(id: string) {
    chatRequestId.current += 1;
    setActiveChatId(id);
    setQuestion("");
    setChatError("");
    setIsAsking(false);
    setActiveNav("Research Chat");
  }

  function renameChat(id: string) {
    const chat = chats.find((item) => item.id === id);
    if (!chat) return;

    const title = window.prompt("Enter a new chat name:", chat.title);

    if (!title?.trim()) return;

    updateChat(id, (current) => ({
      ...current,
      title: title.trim(),
      updatedAt: Date.now(),
    }));
  }

  function deleteChat(id: string) {
    const chat = chats.find((item) => item.id === id);
    if (!chat) return;

    if (!window.confirm(`Delete "${chat.title}"?`)) return;

    if (id === activeChatId) {
      chatRequestId.current += 1;
      setIsAsking(false);
      setQuestion("");
      setChatError("");
    }

    const remaining = chats.filter((item) => item.id !== id);

    if (remaining.length === 0) {
      const fresh = createChat();
      setChats([fresh]);
      setActiveChatId(fresh.id);
    } else {
      setChats(remaining);

      if (id === activeChatId) {
        setActiveChatId(remaining[0].id);
      }
    }
  }

  function addFiles(fileList: FileList | File[]) {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of Array.from(fileList)) {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        errors.push(`${file.name}: only PDFs are allowed.`);
      } else if (file.size === 0) {
        errors.push(`${file.name}: the file is empty.`);
      } else if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: maximum size is 20 MB.`);
      } else {
        valid.push(file);
      }
    }

    const combined = [...selectedFiles, ...valid];

    if (combined.length > MAX_FILES) {
      errors.push(`You can queue a maximum of ${MAX_FILES} PDFs.`);
    }

    const limited = combined.slice(0, MAX_FILES);
    const total = limited.reduce((sum, file) => sum + file.size, 0);

    if (total > MAX_TOTAL_SIZE) {
      setUploadMessage("Combined upload size cannot exceed 100 MB.");
      return;
    }

    setSelectedFiles(limited);
    setUploadMessage(
      errors.length
        ? errors.join(" ")
        : `${valid.length} PDF(s) added to your upload queue.`
    );
  }

  async function stageUploads() {
    if (selectedFiles.length === 0) {
      setUploadMessage("Select at least one PDF first.");
      return;
    }

    const files = [...selectedFiles];
    const uploaded: Paper[] = [];
    const failed: string[] = [];
    const successfulIndexes = new Set<number>();

    setUploadMessage(`Uploading ${files.length} PDF(s)...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.detail || "Upload failed.");
        }

        successfulIndexes.add(i);

        uploaded.push({
          name: result.filename ?? file.name,
          category: "Indexed in Pinecone",
          pages: null,
          color: "#6EE7B7",
          size: file.size,
          status: "indexed",
          documentId: result.document_id,
        });
      } catch (error) {
        failed.push(
          `${file.name}: ${
            error instanceof Error ? error.message : "Upload failed."
          }`
        );
      }
    }

    if (uploaded.length > 0) {
      setPapers((current) => [...uploaded, ...current]);
    }

    setSelectedFiles(
      files.filter((_, index) => !successfulIndexes.has(index))
    );

    setSearchFilter("");
    setActiveNav("Paper Library");

    setUploadMessage(
      failed.length
        ? `${uploaded.length} uploaded. ${failed.join(" ")}`
        : `Success! ${uploaded.length} PDF(s) uploaded and indexed.`
    );
  }

  function deletePaper(name: string) {
    const paper = papers.find((item) => item.name === name);
    if (!paper) return;

    if (
      !window.confirm(
        `Remove ${name} from the browser library? This does not delete Pinecone vectors or server files.`
      )
    ) {
      return;
    }

    setPapers((current) => current.filter((item) => item !== paper));
    setUploadMessage(`${name} removed from the browser library.`);
  }

  async function askQuestion(value = question) {
    const cleaned = value.trim();

    if (!cleaned || isAsking || !activeChatId) return;

    const chatId = activeChatId;
    const requestId = ++chatRequestId.current;

    setQuestion("");
    setChatError("");
    setUploadMessage("");
    setActiveNav("Research Chat");
    setIsAsking(true);

    updateChat(chatId, (chat) => ({
      ...chat,
      title:
        chat.messages.length === 0
          ? cleaned.length > 38
            ? `${cleaned.slice(0, 38)}…`
            : cleaned
          : chat.title,
      messages: [...chat.messages, { role: "user", content: cleaned }],
      updatedAt: Date.now(),
    }));

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Failed to generate an answer.");
      }

      // Don't add a late response to a different conversation.
      if (requestId !== chatRequestId.current) return;

      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            role: "assistant",
            content: result.answer,
            sources: result.sources ?? [],
          },
        ],
        updatedAt: Date.now(),
      }));
    } catch (error) {
      if (requestId === chatRequestId.current) {
        setChatError(
          error instanceof Error ? error.message : "Something went wrong."
        );
      }
    } finally {
      if (requestId === chatRequestId.current) {
        setIsAsking(false);
      }
    }
  }

async function runComparison() {
  if (compareIds.length < 2) {
    setCompareError("Select at least two uploaded papers.");
    return;
  }

  setIsComparing(true);
  setCompareError("");
  setComparison("");
  setCompareSources([]);

  try {
    const response = await fetch(`${API_URL}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_ids: compareIds }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Comparison failed.");
    }

    setComparison(result.comparison);
    setCompareSources(result.sources ?? []);
  } catch (error) {
    setCompareError(
      error instanceof Error ? error.message : "Something went wrong."
    );
  } finally {
    setIsComparing(false);
  }
}

async function runLiteratureReview() {
  if (reviewIds.length === 0) {
    setReviewError("Select at least one uploaded paper.");
    return;
  }

  if (!researchTopic.trim()) {
    setReviewError("Enter a research topic.");
    return;
  }

  setIsGeneratingReview(true);
  setReviewError("");
  setLiteratureReview("");
  setReviewSources([]);

  try {
    const response = await fetch(`${API_URL}/literature-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_ids: reviewIds,
        research_topic: researchTopic.trim(),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || "Literature review failed.");
    }

    setLiteratureReview(result.literature_review);
    setReviewSources(result.sources ?? []);
  } catch (error) {
    setReviewError(
      error instanceof Error ? error.message : "Something went wrong."
    );
  } finally {
    setIsGeneratingReview(false);
  }
}

  const filteredPapers = papers.filter((paper) =>
    `${paper.name} ${paper.category}`
      .toLowerCase()
      .includes(searchFilter.toLowerCase())
  );

  const indexedCount = papers.filter(
    (paper) => paper.status === "indexed"
  ).length;

  const totalBytes = selectedFiles.reduce(
    (sum, file) => sum + file.size,
    0
  );

  const sortedChats = [...chats].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setActiveNav("Overview")}
          aria-label="Go to overview"
        >
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-name">
              researchpaper<span>.ai</span>
            </div>
            <div className="brand-caption">RESEARCH WORKSPACE</div>
          </div>
        </button>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => setActiveNav(item.name)}
              className={`nav-item ${
                activeNav === item.name ? "active" : ""
              }`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>

              {item.name === "Paper Library" && (
                <span className="nav-count">
                  {String(papers.length).padStart(2, "0")}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="chat-history">
          <div className="chat-history-heading">
            <span>YOUR CHATS</span>
            <button
              className="new-chat-small"
              onClick={newChat}
              title="New chat"
            >
              +
            </button>
          </div>

          <button className="new-chat-button" onClick={newChat}>
            ＋ New Chat
          </button>

          <div className="chat-history-list">
            {sortedChats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${
                  chat.id === activeChatId ? "selected" : ""
                }`}
              >
                <button
                  className="chat-history-select"
                  onClick={() => switchChat(chat.id)}
                  title={chat.title}
                >
                  <span>⌕</span>
                  <span className="chat-history-title">{chat.title}</span>
                </button>

                <div className="chat-history-actions">
                  <button
                    onClick={() => renameChat(chat.id)}
                    title="Rename"
                    aria-label="Rename chat"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteChat(chat.id)}
                    title="Delete"
                    aria-label="Delete chat"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="status-indicator">
            <span className="status-dot" />
            <div>
              <div className="status-title">Research engine</div>
              <div className="status-subtitle">
                {indexedCount} indexed papers
              </div>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">R</div>
            <div>
              <div className="profile-name">Researcher</div>
              <div className="profile-plan">Personal workspace</div>
            </div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activeNav}
          </div>
          <div className="topbar-right">
            <span className="engine-badge">
              <span className="status-dot" />
              LOCAL RESEARCH ENGINE
            </span>
          </div>
        </header>

        <div className="page-content">
          {activeNav === "Overview" && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    YOUR RESEARCH, CONNECTED
                  </div>
                  <h1>
                    Think deeper.
                    <br />
                    <span>Research smarter.</span>
                  </h1>
                  <p className="welcome-description">
                    Explore your papers, connect ideas, and turn complex
                    research into clear insights.
                  </p>
                </div>

                <div className="date-card">
                  <span className="date-card-icon">✳</span>
                  <span>YOUR PRIVATE RESEARCH SPACE</span>
                  <strong>One workspace.</strong>
                  <strong>Every insight.</strong>
                </div>
              </div>

              <div className="stats-grid">
                <StatCard
                  label="Research papers"
                  value={String(papers.length).padStart(2, "0")}
                  foot="Documents in your library"
                  icon="▤"
                  color="purple"
                />
                <StatCard
                  label="Indexed passages"
                  value="1,159"
                  foot="Existing Pinecone vectors"
                  icon="⌘"
                  color="green"
                />
                <StatCard
                  label="Vector dimensions"
                  value="384"
                  foot="Embedding space · MiniLM"
                  icon="⌁"
                  color="orange"
                />
                <StatCard
                  label="Answer model"
                  value="Qwen 1.5B"
                  foot="Local inference via Ollama"
                  icon="✳"
                  color="blue"
                />
              </div>

              <section className="ask-card">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">START EXPLORING</div>
                    <h2>What are you researching today?</h2>
                    <p>Ask a question across your indexed research papers.</p>
                  </div>
                  <div className="ask-sparkle">✳</div>
                </div>

                <div className="question-box">
                  <span className="question-icon">⌕</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void askQuestion();
                    }}
                    placeholder="Ask about volatility, regime shifts, stock returns..."
                  />
                  <button
                    className="ask-button"
                    onClick={() => void askQuestion()}
                  >
                    Explore <span>↗</span>
                  </button>
                </div>

                <div className="suggestion-row">
                  <span className="suggestion-label">TRY ASKING</span>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      className="suggestion-chip"
                      onClick={() => setQuestion(suggestion)}
                    >
                      {suggestion} <span>↗</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="lower-grid">
                <div className="panel papers-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">YOUR COLLECTION</div>
                      <h2>Recent research</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setActiveNav("Paper Library")}
                    >
                      View library ↗
                    </button>
                  </div>
                  <PaperList papers={papers.slice(0, 3)} />
                </div>
                <EnginePanel indexedCount={indexedCount} />
              </section>
            </>
          )}

          {activeNav === "Paper Library" && (
            <>
              <PageHeading
                kicker="YOUR COLLECTION"
                title="Paper library."
                subtitle="Upload PDFs and prepare them for evidence-based search."
              />

              <section
                className={`upload-zone ${isDragging ? "dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  addFiles(event.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />

                <div className="upload-icon">
                  <span>↑</span>
                </div>
                <h2>Bring your research into focus</h2>
                <p>Drag and drop PDFs here, or browse your computer.</p>

                <button
                  className="ask-button browse-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse PDF files <span>↗</span>
                </button>

                <div className="upload-limits">
                  PDF only · Up to 10 files · 20 MB per file · 100 MB total
                </div>
              </section>

              {uploadMessage && (
                <div className="notice" role="status">
                  ⓘ {uploadMessage}
                </div>
              )}

              {selectedFiles.length > 0 && (
                <section className="panel staged-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">UPLOAD QUEUE</div>
                      <h2>Selected files ({selectedFiles.length})</h2>
                    </div>
                    <span>{formatSize(totalBytes)} total</span>
                  </div>

                  <div className="paper-list">
                    {selectedFiles.map((file, index) => (
                      <div
                        className="paper-row"
                        key={`${file.name}-${file.size}-${index}`}
                      >
                        <div className="paper-file-icon">PDF</div>
                        <div className="paper-info">
                          <div className="paper-name">{file.name}</div>
                          <div className="paper-category">
                            {formatSize(file.size)} · Ready to submit
                          </div>
                        </div>
                        <button
                          className="remove-button"
                          onClick={() =>
                            setSelectedFiles((current) =>
                              current.filter((_, i) => i !== index)
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="queue-actions">
                    <button
                      className="text-button"
                      onClick={() => setSelectedFiles([])}
                    >
                      Clear queue
                    </button>
                    <button
                      className="ask-button"
                      onClick={() => void stageUploads()}
                    >
                      Add to library ↗
                    </button>
                  </div>
                </section>
              )}

              <section className="panel library-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">DOCUMENTS</div>
                    <h2>Your research collection</h2>
                  </div>
                  <span className="nav-count">{papers.length} files</span>
                </div>

                <input
                  className="library-search"
                  value={searchFilter}
                  onChange={(event) => setSearchFilter(event.target.value)}
                  placeholder="Search your document names..."
                />

                <PaperList
                  papers={filteredPapers}
                  detailed
                  onDelete={deletePaper}
                />
              </section>
            </>
          )}

          {activeNav === "Research Chat" && (
            <>
              <div className="chat-page-heading">
                <PageHeading
                  kicker="EVIDENCE-BASED QUESTIONS"
                  title="Research chat."
                  subtitle="Ask questions and ground answers in passages from your research collection."
                />
                <button className="ask-button" onClick={newChat}>
                  ＋ New Chat
                </button>
              </div>

              <section className="panel research-chat-panel">
                <div className="chat-current-title">
                  <div>
                    <div className="section-kicker">
                      CURRENT CONVERSATION
                    </div>
                    <h2>{activeChat?.title ?? "New chat"}</h2>
                  </div>
                  <span>{messages.length} messages</span>
                </div>

                <div className="chat-messages">
                  {messages.length === 0 && (
                    <div className="chat-placeholder">
                      <div className="chat-placeholder-icon">⌕</div>
                      <h2>Your research conversation starts here</h2>
                      <p>
                        Ask a question to search your indexed papers and
                        generate an answer with supporting sources.
                      </p>
                    </div>
                  )}

                  {messages.map((message, index) => (
                    <div
                      key={`${activeChatId}-${index}`}
                      className={`chat-message ${
                        message.role === "user"
                          ? "chat-message-user"
                          : "chat-message-assistant"
                      }`}
                    >
                      <strong>
                        {message.role === "user"
                          ? "You"
                          : "ResearchPaper AI"}
                      </strong>

                      <p className="chat-message-content">
                        {message.content}
                      </p>

                      {message.role === "assistant" &&
                        message.sources &&
                        message.sources.length > 0 && (
                          <div className="chat-sources">
                            <strong>Retrieved sources</strong>
                            {message.sources.map((source, sourceIndex) => (
                              <div
                                key={`${source.paper}-${source.page}-${sourceIndex}`}
                                className="chat-source-card"
                              >
                                <strong>{source.paper}</strong>
                                <div>Page {source.page}</div>
                                <p>{source.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  ))}

                  {isAsking && (
                    <p role="status" className="chat-thinking">
                      Researching your papers and generating an answer...
                    </p>
                  )}

                  {chatError && (
                    <div className="notice" role="alert">
                      {chatError}
                    </div>
                  )}
                </div>

                <div className="question-preview">
                  <span className="question-icon">⌕</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void askQuestion();
                      }
                    }}
                    placeholder="Ask a question about your PDFs..."
                    disabled={isAsking || !storageReady}
                  />
                  <button
                    className="ask-button"
                    onClick={() => void askQuestion()}
                    disabled={isAsking || !question.trim() || !storageReady}
                  >
                    {isAsking ? "Thinking..." : "Ask question ↗"}
                  </button>
                </div>

                <p className="chat-footnote">
                  Answers use Ollama and passages retrieved from Pinecone.
                  Conversations are saved in this browser.
                </p>
              </section>
            </>
          )}

{activeNav === "Compare Papers" && (
  <>
    <PageHeading
      kicker="CROSS-PAPER ANALYSIS"
      title="Compare papers."
      subtitle="Compare methodologies, findings, datasets and limitations across studies."
    />

    <section className="panel feature-panel">
      <div className="feature-icon">⇄</div>
      <h2>Select papers to compare</h2>
      <p>
        Choose at least two uploaded papers. ResearchPaper AI will
        compare their methods, findings, contributions and limitations.
      </p>

      <div className="paper-list">
        {papers.filter((paper) => paper.documentId).length === 0 ? (
          <p className="empty-state">
            No uploaded papers are available yet. Upload PDFs in Paper Library first.
          </p>
        ) : (
          papers.filter((paper) => paper.documentId).map((paper) => (
            <label
              key={paper.documentId}
              className="paper-row"
              style={{ cursor: "pointer", gap: 12 }}
            >
              <input
                type="checkbox"
                checked={compareIds.includes(paper.documentId!)}
                onChange={(event) => {
                  setCompareIds((current) =>
                    event.target.checked
                      ? [...current, paper.documentId!]
                      : current.filter((id) => id !== paper.documentId)
                  );
                }}
              />
              <span className="paper-file-icon">PDF</span>
              <span className="paper-info">
                <span className="paper-name">{paper.name}</span>
                <span className="paper-category">{paper.category}</span>
              </span>
            </label>
          ))
        )}
      </div>

      <p>{compareIds.length} paper(s) selected</p>

      <button
        className="ask-button"
        onClick={() => void runComparison()}
        disabled={isComparing || compareIds.length < 2}
      >
        {isComparing ? "Comparing papers..." : "Compare Papers ↗"}
      </button>

      {compareError && (
        <div className="notice" role="alert">{compareError}</div>
      )}

      {comparison && (
        <div style={{ marginTop: 24 }}>
          <h2>Comparison results</h2>
          <div
            className="chat-message chat-message-assistant"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {comparison}
          </div>

          <h3>Supporting sources</h3>
          {compareSources.map((source, index) => (
            <div className="chat-source-card" key={`${source.paper}-${source.page}-${index}`}>
              <strong>{source.paper}</strong>
              <p>Page {source.page}</p>
              <p>{source.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  </>
)}


          
{activeNav === "Literature Review" && (
  <>
    <PageHeading
      kicker="SYNTHESIS WORKSPACE"
      title="Literature review."
      subtitle="Generate a structured review with themes, research gaps and supporting evidence."
    />

    <section className="panel feature-panel">
      <div className="feature-icon">▧</div>
      <h2>Define your research topic</h2>
      <p>
        Select the papers to include and describe the topic you want
        your literature review to investigate.
      </p>

      <label htmlFor="research-topic">
        <strong>Research topic</strong>
      </label>
      <input
        id="research-topic"
        className="library-search"
        value={researchTopic}
        onChange={(event) => setResearchTopic(event.target.value)}
        placeholder="e.g. Machine learning for financial forecasting"
      />

      <h3>Select source papers</h3>
      <div className="paper-list">
        {papers.filter((paper) => paper.documentId).length === 0 ? (
          <p className="empty-state">
            No uploaded papers are available yet. Upload PDFs in Paper Library first.
          </p>
        ) : (
          papers.filter((paper) => paper.documentId).map((paper) => (
            <label
              key={paper.documentId}
              className="paper-row"
              style={{ cursor: "pointer", gap: 12 }}
            >
              <input
                type="checkbox"
                checked={reviewIds.includes(paper.documentId!)}
                onChange={(event) => {
                  setReviewIds((current) =>
                    event.target.checked
                      ? [...current, paper.documentId!]
                      : current.filter((id) => id !== paper.documentId)
                  );
                }}
              />
              <span className="paper-file-icon">PDF</span>
              <span className="paper-info">
                <span className="paper-name">{paper.name}</span>
                <span className="paper-category">{paper.category}</span>
              </span>
            </label>
          ))
        )}
      </div>

      <p>{reviewIds.length} paper(s) selected</p>

      <button
        className="ask-button"
        onClick={() => void runLiteratureReview()}
        disabled={
          isGeneratingReview ||
          reviewIds.length === 0 ||
          !researchTopic.trim()
        }
      >
        {isGeneratingReview ? "Generating review..." : "Generate Literature Review ↗"}
      </button>

      {reviewError && (
        <div className="notice" role="alert">{reviewError}</div>
      )}

      {literatureReview && (
        <div style={{ marginTop: 24 }}>
          <h2>Generated literature review</h2>
          <div
            className="chat-message chat-message-assistant"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {literatureReview}
          </div>

          <h3>Supporting sources</h3>
          {reviewSources.map((source, index) => (
            <div className="chat-source-card" key={`${source.paper}-${source.page}-${index}`}>
              <strong>{source.paper}</strong>
              <p>Page {source.page}</p>
              <p>{source.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  </>
)}


          <footer className="footer">
            <span>RESEARCHPAPER.AI</span>
            <span>Built for deeper thinking.</span>
            <span>LOCAL MODEL · PINECONE RETRIEVAL</span>
          </footer>
        </div>
      </section>

      <style jsx>{`
        .chat-history {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-height: 150px;
          overflow: hidden;
          margin-top: 16px;
          padding: 14px 10px;
          border-top: 1px solid var(--border, #30303b);
        }

        .chat-history-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 12px;
          color: #a5a3b5;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.4px;
        }

        .new-chat-small {
          width: 28px;
          height: 28px;
          border: 1px solid #454052;
          border-radius: 8px;
          background: transparent;
          color: #c4b5fd;
          font-size: 20px;
          cursor: pointer;
        }

        .new-chat-button {
          width: 100%;
          padding: 11px;
          margin-bottom: 10px;
          border: 1px solid #514078;
          border-radius: 9px;
          background: #30264f;
          color: #f5f3ff;
          text-align: left;
          cursor: pointer;
        }

        .chat-history-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-height: 0;
          overflow-y: auto;
        }

        .chat-history-item {
          display: flex;
          align-items: center;
          min-width: 0;
          border: 1px solid transparent;
          border-radius: 8px;
        }

        .chat-history-item.selected {
          border-color: #514078;
          background: #282139;
        }

        .chat-history-select {
          display: flex;
          flex: 1;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 10px 6px;
          border: 0;
          background: transparent;
          color: var(--foreground, #eeeef4);
          text-align: left;
          cursor: pointer;
        }

        .chat-history-title {
          overflow: hidden;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-history-actions {
          display: flex;
          flex-shrink: 0;
        }

        .chat-history-actions button {
          padding: 5px;
          border: 0;
          background: transparent;
          color: #aaa6bd;
          cursor: pointer;
        }

        .chat-history-actions button:hover {
          color: #c4b5fd;
        }

        .chat-page-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .research-chat-panel {
          padding: 24px;
        }

        .chat-current-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border, #30303b);
        }

        .chat-current-title h2 {
          margin: 5px 0 0;
          overflow-wrap: anywhere;
          font-size: 16px;
        }

        .chat-messages {
          display: flex;
          flex-direction: column;
          gap: 18px;
          min-height: 300px;
          max-height: 520px;
          overflow-y: auto;
          margin-bottom: 24px;
          padding: 4px;
        }

        .chat-message {
          min-width: 0;
          padding: 16px;
          border-radius: 12px;
          line-height: 1.7;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .chat-message-user {
          align-self: flex-end;
          max-width: 85%;
          border: 1px solid #514078;
          background: #30264f;
          color: #f5f3ff;
        }

        .chat-message-assistant {
          align-self: stretch;
          max-width: 100%;
          border: 1px solid var(--border, #30303b);
          background: transparent;
          color: var(--foreground, #f5f5f7);
        }

        .chat-message-content {
          margin: 8px 0 0;
          color: inherit;
          overflow-wrap: anywhere;
        }

        .chat-sources {
          margin-top: 20px;
        }

        .chat-source-card {
          margin-top: 10px;
          padding: 12px;
          border: 1px solid var(--border, #30303b);
          border-radius: 8px;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .chat-source-card p {
          margin-bottom: 0;
          color: var(--muted, #b4b4c0);
        }

        .chat-thinking,
        .chat-footnote {
          color: var(--muted, #aaaab8);
          font-size: 12px;
        }

        @media (max-width: 760px) {
          .chat-page-heading {
            flex-direction: column;
          }

          .research-chat-panel {
            padding: 14px;
          }

          .chat-message-user {
            max-width: 95%;
          }
        }
      `}</style>
    </main>
  );
}

function StatCard({
  label,
  value,
  foot,
  icon,
  color,
}: {
  label: string;
  value: string;
  foot: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className={`stat-number ${value.length > 8 ? "model-number" : ""}`}>
        {value}
      </div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}

function PageHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">
        <span className="eyebrow-line" />
        {kicker}
      </div>
      <h1>
        <span>{title}</span>
      </h1>
      <p className="welcome-description">{subtitle}</p>
    </div>
  );
}

function PaperList({
  papers,
  detailed = false,
  onDelete,
}: {
  papers: Paper[];
  detailed?: boolean;
  onDelete?: (name: string) => void;
}) {
  if (papers.length === 0) {
    return <p className="empty-state">No papers to display yet.</p>;
  }

  return (
    <div className="paper-list">
      {papers.map((paper, index) => (
        <div className="paper-row" key={`${paper.name}-${index}`}>
          <div className="paper-file-icon" style={{ color: paper.color }}>
            PDF
          </div>

          <div className="paper-info">
            <div className="paper-name">{paper.name}</div>
            <div className="paper-category">{paper.category}</div>
          </div>

          {detailed && (
            <span className={`document-status ${paper.status}`}>
              {paper.status === "indexed"
                ? "INDEXED"
                : paper.status === "ready"
                  ? "STAGED"
                  : paper.status.toUpperCase()}
            </span>
          )}

          <div className="paper-pages">
            {paper.pages !== null
              ? `${paper.pages} pages`
              : paper.size
                ? formatSize(paper.size)
                : "—"}
          </div>

          {detailed && onDelete && (
            <button
              className="remove-button"
              onClick={() => onDelete(paper.name)}
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function EnginePanel({ indexedCount }: { indexedCount: number }) {
  return (
    <div className="panel activity-panel">
      <div className="section-kicker">SYSTEM OVERVIEW</div>
      <h2>Your research engine</h2>

      <div className="engine-visual">
        <div className="engine-orbit orbit-one" />
        <div className="engine-orbit orbit-two" />
        <div className="engine-core">
          R<span>.</span>
        </div>
        <div className="orbit-node node-one">PDF</div>
        <div className="orbit-node node-two">AI</div>
        <div className="orbit-node node-three">DB</div>
      </div>

      <div className="engine-step">
        <span className="step-check">✓</span>
        <div>
          <strong>Document ingestion</strong>
          <span>{indexedCount} indexed papers</span>
        </div>
        <span className="step-state">READY</span>
      </div>

      <div className="engine-step">
        <span className="step-check">✓</span>
        <div>
          <strong>Vector retrieval</strong>
          <span>Existing Pinecone vectors</span>
        </div>
        <span className="step-state">READY</span>
      </div>

      <div className="engine-step">
        <span className="step-check">✓</span>
        <div>
          <strong>Research chat</strong>
          <span>FastAPI and Ollama integration</span>
        </div>
        <span className="step-state">READY</span>
      </div>
    </div>
  );
}