export interface GitHubRule {
  event: 'OPENED' | 'REVIEW_REQUESTED' | 'MERGED';
  enabled: boolean;
  fromStatusIds: string[];
  targetStatusId: string;
}
export interface GitHubRepository {
  id: string;
  fullName: string;
  installationId: string;
  enabled: boolean;
  rules: GitHubRule[];
  lastSyncedAt: string | null;
  lastError: string | null;
  syncing: boolean;
}
export interface GitHubSettings {
  configured: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
  appUrl: string | null;
  repositories: GitHubRepository[];
}
export interface IssueDevelopment {
  pullRequests: {
    id: string;
    number: number;
    title: string;
    url: string;
    state: string;
    draft: boolean;
    branch: string;
    author: string;
    repository: string;
  }[];
  commits: { id: string; sha: string; message: string; url: string; author: string; repository: string }[];
}
