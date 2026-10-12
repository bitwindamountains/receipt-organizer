import { PermissionState, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { CapturedNotification } from './transaction-parser';

export interface SharedImage {
  /** file:// copy in the app cache. */
  fileUri: string;
  mimeType: string;
  fileName?: string;
}

export interface DeviceScreenshot {
  /** content:// URI in the gallery (read-only). */
  uri: string;
  fileName: string;
  /** Epoch milliseconds. */
  takenAt: number;
  mimeType: string;
}

/** App-local Android plugin (android/app/.../SnapSortCapturePlugin.java). Android only. */
export interface SnapSortCapturePlugin {
  getCaptureStatus(): Promise<{ accessGranted: boolean; enabled: boolean }>;
  setCaptureEnabled(options: { enabled: boolean }): Promise<void>;
  openNotificationAccessSettings(): Promise<void>;
  /** Queued notifications, left in the queue until acknowledged. */
  getCapturedNotifications(): Promise<{ notifications: CapturedNotification[] }>;
  ackCapturedNotifications(options: { ids: string[] }): Promise<void>;
  getPhotosPermission(): Promise<{ state: PermissionState }>;
  requestPhotosPermission(): Promise<{ state: PermissionState }>;
  getRecentScreenshots(options: { since: number; limit?: number }): Promise<{ screenshots: DeviceScreenshot[] }>;
  takeSharedImages(): Promise<{ images: SharedImage[] }>;
  addListener(event: 'notificationCaptured', listener: (notification: CapturedNotification) => void): Promise<PluginListenerHandle>;
  addListener(event: 'imagesShared', listener: (event: { count: number }) => void): Promise<PluginListenerHandle>;
}

export const SnapSortCapture = registerPlugin<SnapSortCapturePlugin>('SnapSortCapture');
