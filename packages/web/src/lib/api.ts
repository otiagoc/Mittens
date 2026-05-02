const BASE_URL = "/api";

function getToken() {
  return localStorage.getItem("mittens_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("mittens_token");
    window.location.href = "/login";
    throw new Error("Não autorizado");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error ?? "Erro na API");
  }

  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface FollowUpLead {
  id: string;
  name: string;
  phone: string | null;
  telegramUsername: string | null;
  status: string;
  followUpAt: string;
  followUpNote: string | null;
  conversationSummary: string | null;
}

export const dashboardApi = {
  stats: () => request<{
    totalLeads: number;
    newToday: number;
    totalConversations: number;
    activeAgents: number;
    leadsByStatus: { status: string; count: number }[];
    monthlyLeads: { month: string; count: number }[];
    monthlyMessages: { month: string; count: number }[];
    followUpsToday: FollowUpLead[];
  }>("/dashboard/stats"),
};

// ─── Leads ────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  status: string;
  notes: string | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  assignedAgentId: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  conversationSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  leadId: string | null;
  type: string;
  description: string;
  metadata: string | null;
  createdAt: string;
}

export const leadsApi = {
  list: (params?: { status?: string; search?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    if (params?.page) qs.set("page", String(params.page));
    return request<{ data: Lead[]; total: number; page: number }>(`/leads?${qs}`);
  },
  get: (id: string) =>
    request<Lead & { activities: Activity[]; conversations: Conversation[] }>(`/leads/${id}`),
  create: (data: { name: string; phone?: string; email?: string; notes?: string; source?: string }) =>
    request<Lead>("/leads", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Lead>) =>
    request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/leads/${id}`, { method: "DELETE" }),
  messages: (id: string) =>
    request<Message[]>(`/leads/${id}/messages`),
  analyze: (id: string) =>
    request<{ stage: string; confidence: number; reasoning: string; changed: boolean; previousStage: string }>(
      `/leads/${id}/analyze`,
      { method: "POST" }
    ),
  scheduleFollowUp: (id: string, timing: string, note?: string) =>
    request<{ timing: string; followUpAt: string; followUpFormatted: string; note?: string }>(
      `/leads/${id}/follow-up`,
      { method: "POST", body: JSON.stringify({ timing, note }) }
    ),
  summarize: (id: string) =>
    request<{ summary: string }>(`/leads/${id}/summarize`, { method: "POST" }),
};

// ─── Conversas ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  conversationId: string;
  agentId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  telegramChatId: string;
  telegramFirstName: string | null;
  telegramUsername: string | null;
  leadId: string | null;
  activeAgentId: string | null;
  managedAgentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  lead: Lead | null;
  lastMessage: Message | null;
}

export const conversationsApi = {
  list: (page?: number) =>
    request<Conversation[]>(`/conversations?page=${page ?? 1}`),
  get: (id: string) =>
    request<Conversation & { messages: Message[] }>(`/conversations/${id}`),
  send: (id: string, message: string) =>
    request<Message>(`/conversations/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

// ─── Alertas de Imóveis ───────────────────────────────────────────────────────

export interface PropertyAlert {
  id: string;
  leadId: string | null;
  zone: string;
  propertyType: string;
  transactionType: string;
  maxPrice: number | null;
  minPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
  buildYearMin: number | null;
  market: "primary" | "secondary" | null;
  ownerType: "agency" | "private" | null;
  active: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  // Campos enriquecidos (apenas em /property-alerts-all)
  leadName?: string | null;
  listingsCount?: number;
  newCount?: number;
}

export interface PropertyAlertInput {
  zone: string;
  propertyType: string;
  transactionType: "rent" | "buy";
  maxPrice?: number;
  minPrice?: number;
  minArea?: number;
  maxArea?: number;
  buildYearMin?: number;
  market?: "primary" | "secondary" | null;
  ownerType?: "agency" | "private" | null;
}

export interface PropertyListing {
  id: string;
  alertId: string | null;
  leadId: string | null;
  externalId: string;
  source: string;
  title: string | null;
  price: number | null;
  area: number | null;
  zone: string | null;
  url: string;
  isNew: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  details: string | null;
  detailsScrapedAt: string | null;
  notifiedAt: string | null;
  foundAt: string;
}

export interface ListingDetail {
  source: "imovirtual" | "casayes" | "idealista";
  externalId: string;
  url: string;
  title: string;
  description: string;
  images: string[];
  price: number | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  constructionYear: number | null;
  energyRating: string | null;
  hasElevator: boolean | null;
  hasParking: boolean | null;
  pricePerM2: number | null;
  zone: string | null;
  address: string | null;
  characteristics: { label: string; value: string }[];
  scrapedAt: string;
}

export interface AgentProfile {
  name?: string;
  phone?: string;
  email?: string;
  agency?: string;
  photoUrl?: string;
  amiLicense?: string;
  bio?: string;
}

export const propertyListingsApi = {
  list: (params?: { alertId?: string; leadId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.alertId) qs.set("alertId", params.alertId);
    if (params?.leadId) qs.set("leadId", params.leadId);
    return request<PropertyListing[]>(`/property-listings?${qs}`);
  },
  markSeen: (id: string) =>
    request<{ ok: boolean }>(`/property-listings/${id}/seen`, { method: "PATCH" }),
  update: (id: string, data: Partial<{ isFavorite: boolean; isHidden: boolean; isNew: boolean }>) =>
    request<PropertyListing>(`/property-listings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/property-listings/${id}`, { method: "DELETE" }),
  detail: (id: string, refresh = false) =>
    request<PropertyListing & { detail: ListingDetail | null }>(
      `/property-listings/${id}${refresh ? "?refresh=1" : ""}`
    ),
  share: (id: string) =>
    request<{ token: string; url: string; viewCount: number }>(
      `/property-listings/${id}/share`,
      { method: "POST" }
    ),
  runAlert: (alertId: string) =>
    request<{ newCount: number }>(`/property-alerts/${alertId}/run`, { method: "POST" }),
};

// Página pública de partilha (sem auth)
export async function fetchPublicShare(token: string) {
  const res = await fetch(`/api/public/share/${token}`);
  if (!res.ok) throw new Error("Partilha não encontrada");
  return res.json() as Promise<{
    listing: PropertyListing;
    detail: ListingDetail | null;
    profile: AgentProfile;
  }>;
}

export const settingsApi = {
  getProfile: () => request<AgentProfile>("/settings/profile"),
  updateProfile: (data: AgentProfile) =>
    request<AgentProfile>("/settings/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const propertyAlertsApi = {
  list: (leadId: string) =>
    request<PropertyAlert[]>(`/leads/${leadId}/property-alerts`),
  create: (leadId: string, data: PropertyAlertInput) =>
    request<PropertyAlert>(`/leads/${leadId}/property-alerts`, {
      method: "POST", body: JSON.stringify(data),
    }),
  update: (alertId: string, data: Partial<PropertyAlert>) =>
    request<PropertyAlert>(`/property-alerts/${alertId}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  delete: (alertId: string) =>
    request<{ ok: boolean }>(`/property-alerts/${alertId}`, { method: "DELETE" }),
  toggle: (alertId: string, active: boolean) =>
    request<PropertyAlert>(`/property-alerts/${alertId}`, {
      method: "PATCH", body: JSON.stringify({ active }),
    }),
  test: (leadId: string, data: PropertyAlertInput) =>
    request<{ count: number; listings: { title: string; price: number | null; url: string }[] }>(
      `/leads/${leadId}/property-alerts/test`,
      { method: "POST", body: JSON.stringify(data) }
    ),
};

// ─── Agentes ──────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  keywords: string[];
  type: "claude_api" | "managed_agent" | "n8n_workflow";
  enabled: boolean;
  systemPrompt: string | null;
  managedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const agentsApi = {
  list: () => request<Agent[]>("/agents"),
  create: (data: Partial<Agent>) =>
    request<Agent>("/agents", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Agent>) =>
    request<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/agents/${id}`, { method: "DELETE" }),
  chat: (id: string, message: string, history?: { role: string; content: string }[]) =>
    request<{ text: string; agentId: string }>(`/agents/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};
