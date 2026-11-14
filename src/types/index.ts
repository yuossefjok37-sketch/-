/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CodeStatus = 'active' | 'bound' | 'expired' | 'suspended';

export interface ActivationCode {
  id: string;
  code: string;
  batchId?: string;
  durationDays: number;
  durationLabel?: string;
  status: CodeStatus;
  createdAt: string;
  firstActivatedAt?: string | null;
  expiresAt?: string | null;
  deviceToken?: string | null;
  deviceModel?: string | null;
  deviceOs?: string | null;
  appVersion?: string | null;
  lastVerifiedAt?: string | null;
  note?: string | null;
  createdBy?: string;
}

export type ActionType =
  | 'create_code'
  | 'batch_generate'
  | 'activate'
  | 'verify'
  | 'unbind'
  | 'suspend'
  | 'resume'
  | 'delete';

export interface ActivityLog {
  id: string;
  action: ActionType;
  code: string;
  deviceToken?: string | null;
  performedBy: string;
  timestamp: string;
  details: string;
  ipAddress?: string;
}

export interface CodeStats {
  total: number;
  active: number;
  bound: number;
  expired: number;
  suspended: number;
}

export interface SystemSettings {
  apiKey: string;
  appName: string;
  allowNewActivations: boolean;
  updatedAt?: string;
}

export interface ActivationRequest {
  code: string;
  deviceToken: string;
  deviceModel?: string;
  deviceOs?: string;
  appVersion?: string;
}

export interface ActivationResponse {
  success: boolean;
  message: string;
  status: CodeStatus;
  code?: string;
  durationDays?: number;
  remainingDays?: number;
  remainingHours?: number;
  firstActivatedAt?: string;
  expiresAt?: string;
  deviceToken?: string;
  sessionToken?: string;
}

export interface VerificationRequest {
  code: string;
  deviceToken: string;
}

export interface VerificationResponse {
  valid: boolean;
  message: string;
  status: CodeStatus;
  expiresAt?: string;
  remainingDays?: number;
  remainingHours?: number;
  durationDays?: number;
  deviceMatched?: boolean;
}
