// ── Facade: backward-compatible barrel for DynamoRepository ──────
// Domain logic lives in ./repositories/<domain>.ts (ADR-021).
// This file preserves the singleton `dynamoRepo` API so all existing
// consumers and test mocks (`vi.mock('../../services/dynamodb')`) work unchanged.

import * as farms from './repositories/farms';
import * as beds from './repositories/beds';
import * as images from './repositories/images';
import * as tags from './repositories/tags';
import * as members from './repositories/members';
import * as users from './repositories/users';
import * as devices from './repositories/devices';
import * as diary from './repositories/diary';
import * as conversation from './repositories/conversation';
import * as joinRequests from './repositories/join-requests';
import * as notifications from './repositories/notifications';

// Re-export types for backward compatibility
export type { StoredMessage, UserSettings, NotificationPrefs, DeleteAccountSummary } from './repositories/_types';
import type { DeleteAccountSummary } from './repositories/_types';
export { DEFAULT_SETTINGS } from './repositories/_types';

export class DynamoRepository {
  // ── Farms ──────────────────────────────────────────────────────
  getFarm = farms.getFarm;
  getAllFarms = farms.getAllFarms;
  createFarm = farms.createFarm;
  updateFarm = farms.updateFarm;
  deleteFarm = farms.deleteFarm;
  getDiscoverableFarms = farms.getDiscoverableFarms;
  getStats = farms.getStats;

  // ── Beds ───────────────────────────────────────────────────────
  getBedsForFarm = beds.getBedsForFarm;
  getBedById = beds.getBedById;
  updateBed = beds.updateBed;
  createBedsForFarm = beds.createBedsForFarm;
  createBedsForPositions = beds.createBedsForPositions;

  // ── Images ─────────────────────────────────────────────────────
  getImagesForBed = images.getImagesForBed;
  getLatestImageForBed = images.getLatestImageForBed;
  getImageById = images.getImageById;
  createImage = images.createImage;
  updateImageThumbnailKey = images.updateImageThumbnailKey;

  // ── Tags ───────────────────────────────────────────────────────
  getTagsForImage = tags.getTagsForImage;
  getLatestTagForImage = tags.getLatestTagForImage;
  createTag = tags.createTag;

  // ── Members ────────────────────────────────────────────────────
  countUserMemberships = members.countUserMemberships;
  getFarmsForUser = members.getFarmsForUser;
  getFarmMembership = members.getFarmMembership;
  removeFarmMember = members.removeFarmMember;
  addFarmMember = members.addFarmMember;
  getFarmMembers = members.getFarmMembers;
  updateMemberRole = members.updateMemberRole;

  // ── Users ──────────────────────────────────────────────────────
  getUserProfile = users.getUserProfile;
  upsertUserProfile = users.upsertUserProfile;
  getAllUserProfiles = users.getAllUserProfiles;
  getUserSettings = users.getUserSettings;
  upsertUserSettings = users.upsertUserSettings;
  deleteUserItems = users.deleteUserItems;

  // ── Devices ────────────────────────────────────────────────────
  createDevice = devices.createDevice;
  getDeviceById = devices.getDeviceById;
  getDevicesForFarm = devices.getDevicesForFarm;
  updateDeviceConfig = devices.updateDeviceConfig;
  updateDeviceHeartbeat = devices.updateDeviceHeartbeat;
  deleteDevice = devices.deleteDevice;
  setTestShotFlag = devices.setTestShotFlag;
  countDevicesForFarm = devices.countDevicesForFarm;

  // ── Diary ──────────────────────────────────────────────────────
  createDiaryEntry = diary.createDiaryEntry;
  getDiaryEntryById = diary.getDiaryEntryById;
  getDiaryEntries = diary.getDiaryEntries;
  updateDiaryEntry = diary.updateDiaryEntry;
  deleteDiaryEntry = diary.deleteDiaryEntry;

  // ── Conversation ───────────────────────────────────────────────
  getConversationHistory = conversation.getConversationHistory;
  saveConversationHistory = conversation.saveConversationHistory;

  // ── Join Requests ──────────────────────────────────────────────
  createJoinRequest = joinRequests.createJoinRequest;
  getJoinRequest = joinRequests.getJoinRequest;
  getJoinRequestsForFarm = joinRequests.getJoinRequestsForFarm;
  approveJoinRequest = joinRequests.approveJoinRequest;
  rejectJoinRequest = joinRequests.rejectJoinRequest;
  getMyJoinRequests = joinRequests.getMyJoinRequests;
  deleteJoinRequest = joinRequests.deleteJoinRequest;

  // ── Account ────────────────────────────────────────────────────
  // deleteAccount orchestrates cross-domain calls. It must call through
  // `this.*` so that vi.spyOn(repo, 'getFarmsForUser') etc. intercept
  // the internal calls in unit tests. All other methods are simple delegations.
  async deleteAccount(userId: string): Promise<DeleteAccountSummary> {
    const summary: DeleteAccountSummary = {
      farms_deleted: [],
      farms_left: [],
      farms_transferred: [],
      join_requests_deleted: 0,
      profile_deleted: true,
      settings_deleted: true,
    };

    const memberships = await this.getFarmsForUser(userId);

    for (const membership of memberships) {
      const farmId = membership.farm_id;
      const farmMembers = await this.getFarmMembers(farmId);

      if (farmMembers.length === 1) {
        await this.deleteFarm(farmId);
        summary.farms_deleted.push(farmId);
      } else if (membership.role === 'admin') {
        const otherMembers = farmMembers
          .filter((m) => m.user_id !== userId)
          .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

        const successor =
          otherMembers.find((m) => m.role === 'owner') ?? otherMembers[0];

        await this.updateMemberRole(farmId, successor.user_id, 'admin');
        await this.removeFarmMember(userId, farmId);
        summary.farms_transferred.push({ farm_id: farmId, new_admin: successor.user_id });
      } else {
        await this.removeFarmMember(userId, farmId);
        summary.farms_left.push(farmId);
      }
    }

    const joinReqs = await this.getMyJoinRequests(userId);
    for (const jr of joinReqs) {
      await this.deleteJoinRequest(jr.farm_id, userId);
    }
    summary.join_requests_deleted = joinReqs.length;

    await this.deleteUserItems(userId);

    return summary;
  }

  // ── Notifications ──────────────────────────────────────────────
  getNotificationPrefs = notifications.getNotificationPrefs;
  upsertNotificationPrefs = notifications.upsertNotificationPrefs;
}

export const dynamoRepo = new DynamoRepository();
