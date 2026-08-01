export type LifeProfileState = 'empty' | 'ready' | 'unavailable' | 'corrupt';

export interface LifeDashboards {
  health?: number;
  work?: number;
  play?: number;
  love?: number;
}

export type LifeHouseId =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'h7'
  | 'h8'
  | 'h9'
  | 'h10'
  | 'h11'
  | 'h12';

export type LifeVisitMode = 'first_entry' | 'return_entry' | 'continue';
export type LifeRecognitionState = 'unknown' | 'draft' | 'owned' | 'dismissed';
export type LifeConditionLevel =
  | 'unknown'
  | 'depleted'
  | 'strained'
  | 'mixed'
  | 'steady'
  | 'energizing';
export type LifeConditionTrend = 'unknown' | 'improving' | 'stable' | 'worsening';

export interface LifeWheelHouseState {
  id: LifeHouseId;
  publicName: string;
  startAngleDeg: number;
  endAngleDeg: number;
  centerAngleDeg: number;
  sweepDeg: -30;
  axisBoundary: boolean;
  recognition: LifeRecognitionState;
  condition: {
    currentSnapshotId: string | null;
    level: LifeConditionLevel;
    status: 'user_stated' | 'dialog_inferred' | 'user_confirmed' | 'user_corrected' | null;
    trend: LifeConditionTrend;
    asOf: string | null;
    evidenceSummary: string | null;
  };
}

export interface LifeWheelView {
  schemaVersion: 1;
  lanternHouse: LifeHouseId | null;
  houses: LifeWheelHouseState[];
}

export interface LifeHouseEntryEvent {
  kind: 'house_entered';
  entryHouse: LifeHouseId;
  visitMode: LifeVisitMode;
  at: string;
}

export interface LifeStopPoint {
  sceneId?: string | null;
  summary?: string | null;
  resumeFrom?: string | null;
  unresolved?: string[];
  sourceEventId?: string | null;
  eventId?: string | null;
  ts?: string | null;
  entryHouse?: LifeHouseId;
}

export interface LifeHouseSession {
  entryHouse: LifeHouseId;
  sessionId: string;
  visitMode?: LifeVisitMode | null;
  enteredAt?: string | null;
  stopPoint?: LifeStopPoint | null;
}

export interface LifeDomainConversation {
  entryHouse: LifeHouseId;
  conversationId: string;
  title?: string | null;
  updatedAt?: string | null;
  stopPoint?: LifeStopPoint | null;
}

export interface LifeBootstrapSummary {
  alias?: string | null;
  lastSurface?: string | null;
  nextStep?: string | null;
  lifeWheel?: LifeWheelView;
}

export interface LifeBootstrapResponse {
  authenticated: boolean;
  user: { id: string; name: string; email?: string | null } | null;
  profileState: LifeProfileState;
  hasSubstantiveProfile: boolean | null;
  profileVersion?: string | null;
  summary?: LifeBootstrapSummary;
  activeHouse?: LifeHouseId | null;
  houseSessions?: LifeHouseSession[];
  domainConversations?: LifeDomainConversation[];
  latestReportId?: string | null;
  reportCount?: number;
  lastConversationId?: string | null;
  lastConversationTitle?: string | null;
  recommendedRoute: '/home' | '/resume';
  error?: { code: string; message: string; retryable?: boolean };
}

export interface LifeOnboardingRequest {
  archiveName: string;
  entryHouse: LifeHouseId;
}

export interface LifeOnboardingResponse {
  ok: boolean;
  profileVersion: string;
  applied: number;
  action: 'restored' | 'new';
  conversationId: string | null;
  entryEvent: LifeHouseEntryEvent;
  prompt: string;
  route: string;
  operationId?: string | null;
  replayed?: boolean;
}

export interface LifeResumeResponse {
  action: 'restored' | 'new';
  conversationId: string | null;
  route: string;
  operationId?: string | null;
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
  gender?: string;
  age?: string;
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

export type LifeStanceSelection = 'more_direct' | 'just_right' | 'less_direct';

export type LifeStanceLevel = 'restrained' | 'direct' | 'decisive';

export interface LifeStanceFeedbackRequest {
  reportVersion: number;
  selection: LifeStanceSelection;
  effectiveLevel: LifeStanceLevel;
  stancePolicyVersion: string;
}

export interface LifeStanceFeedbackResponse {
  ok: boolean;
  reportId: string;
  reportVersion: number;
  selection: LifeStanceSelection;
  effectiveLevel: LifeStanceLevel;
  stancePolicyVersion: string;
  recordedAt: string;
  replayed: boolean;
}

export interface LifeStanceFeedbackCurrent {
  selection: LifeStanceSelection;
  effectiveLevel: LifeStanceLevel;
  stancePolicyVersion: string;
  recordedAt: string;
}

export interface LifeStanceFeedbackState {
  current: LifeStanceFeedbackCurrent | null;
  historyCount: number;
}

export interface LifeReportSummary {
  id: string;
  title: string;
  mode: 'discovery' | 'decision';
  createdAt: string | null;
  houseId?: LifeHouseId | null;
  stanceFeedback?: LifeStanceFeedbackState | null;
}

export interface LifeArchiveResponse {
  schemaVersion: number;
  profileVersion: string | null;
  activeHouse?: LifeHouseId | null;
  profile: LifeProfileView;
  archiveStatus?: LifeArchiveStatus;
  recentDossier?: LifeDossierPreviewEntry[];
  reports: LifeReportSummary[];
}

export interface LifeArchiveStatus {
  variableCount: number;
  dossierClaimCount: number;
  latestClaimId: string | null;
  mapVersion: string;
  gateReached: boolean;
  openingAnnouncedAt: string | null;
}

export interface LifeDossierPreviewEntry {
  id: string;
  section: LifeDossierSection;
  text: string;
  quote: string | null;
  status: string;
  createdAt: string | null;
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
