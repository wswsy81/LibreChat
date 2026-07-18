export type LifeProfileState = 'empty' | 'ready' | 'unavailable' | 'corrupt';

export interface LifeDashboards {
  health?: number;
  work?: number;
  play?: number;
  love?: number;
}

export interface LifeBootstrapSummary {
  alias?: string | null;
  lastSurface?: string | null;
  nextStep?: string | null;
  dashboards?: LifeDashboards;
}

export interface LifeBootstrapResponse {
  authenticated: boolean;
  user: { id: string; name: string; email?: string | null } | null;
  profileState: LifeProfileState;
  hasSubstantiveProfile: boolean | null;
  profileVersion?: string | null;
  summary?: LifeBootstrapSummary;
  latestReportId?: string | null;
  reportCount?: number;
  lastConversationId?: string | null;
  lastConversationTitle?: string | null;
  recommendedRoute: '/home' | '/resume';
  error?: { code: string; message: string; retryable?: boolean };
}

export interface LifeOnboardingRequest {
  archiveName: string;
  dashboards: LifeDashboards;
}

export interface LifeOnboardingResponse {
  ok: boolean;
  profileVersion: string;
  applied: number;
  prompt: string;
  route: string;
  operationId?: string;
  replayed?: boolean;
}

export interface LifeDiagnosticRequest {
  dashboards: LifeDashboards;
}

export interface LifeDiagnosticResponse {
  ok: boolean;
  profileVersion: string;
  dashboards: LifeDashboards;
}

export interface LifeResumeResponse {
  action: 'restored' | 'new';
  conversationId: string | null;
  route: string;
  operationId?: string;
  replayed?: boolean;
}

export interface LifeSignal {
  id?: string;
  description?: string;
  status?: string;
  plantedAt?: string;
  payoff?: string;
  resolvedAt?: string | null;
  halfLifeDays?: number | null;
}

export interface LifeTimelineEntry {
  when?: string;
  what: string;
  source?: string;
}

export interface LifeBirthInfo {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  calendar?: 'solar' | 'lunar';
  gender?: 'male' | 'female';
  city?: string;
}

export interface LifeBasics {
  nickname?: string;
  occupation?: string;
  city?: string;
  education?: string;
  marital?: string;
  birth?: LifeBirthInfo;
}

export type LifeBasicsRequest = {
  [Field in keyof Omit<LifeBasics, 'birth'>]?: string | null;
};

export interface LifeBasicsResponse {
  ok: boolean;
  basics: LifeBasics;
}

export interface LifeBirthResponse {
  ok: boolean;
  litHouses: number;
}

export interface LifeProfileView {
  alias?: string | null;
  archetype?: string | null;
  basics?: LifeBasics;
  dashboards?: LifeDashboards;
  problemFrame?: {
    surface?: string;
    movable?: string;
    constraints?: string | string[];
  };
  compass?: {
    workview?: string;
    lifeview?: string;
    clash?: string;
  };
  energy?: {
    gain?: string | string[];
    drain?: string | string[];
  };
  signals?: LifeSignal[];
  timeline?: LifeTimelineEntry[];
  updatedAt?: string | null;
}

export interface LifeReportSummary {
  id: string;
  title: string;
  mode: 'discovery' | 'decision';
  createdAt: string | null;
}

export interface LifeArchiveResponse {
  schemaVersion: number;
  profileVersion: string | null;
  profile: LifeProfileView;
  reports: LifeReportSummary[];
}

export interface LifeReportsResponse {
  schemaVersion: number;
  items: LifeReportSummary[];
  nextCursor: string | null;
}

export interface LifeReportResponse {
  schemaVersion: number;
  report: LifeReportSummary;
}

export interface LifeShareResponse {
  shareId: string;
  expiresAt: string | null;
  shareUrl: string;
}

export interface LifeInboxEntry {
  id: string;
  text: string;
  capturedAt: string | null;
  digested: boolean;
  digestedAt: string | null;
}

export interface LifeInboxHomework {
  text: string;
  stage: string | null;
  assignedAt: string | null;
}

export interface LifeInboxListResponse {
  schemaVersion: number;
  items: LifeInboxEntry[];
  homework?: LifeInboxHomework | null;
}

export interface LifeInboxCreateResponse {
  ok: boolean;
  entry: LifeInboxEntry;
}

export interface LifePublicShareResponse {
  schemaVersion: number;
  report: Pick<LifeReportSummary, 'id' | 'title' | 'createdAt'> & { html: string };
}

export type LifeDossierSection = 'chapters' | 'scenes' | 'traits' | 'tensions' | 'language';

export type LifeDossierAction = 'keep' | 'rewrite' | 'strike';

export interface LifeDossierAnnotateRequest {
  section: LifeDossierSection;
  entryId: string;
  action: LifeDossierAction;
  text?: string;
}

export interface LifeDossierAnnotateResponse {
  ok: boolean;
  entry: {
    id: string;
    status: string;
    confidence?: number;
  };
}

export type LifeMapHouseAction = 'keep' | 'rewrite' | 'strike';

export interface LifeMapHouseAnnotateRequest {
  houseKey: string;
  action: LifeMapHouseAction;
  text?: string;
}

export interface LifeMapHouseAnnotateResponse {
  ok: boolean;
  house: {
    status: string;
    conf?: number;
    note?: string;
  };
}
