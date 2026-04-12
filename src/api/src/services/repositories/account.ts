import type { DeleteAccountSummary } from './_types';
import { getFarmsForUser, getFarmMembers, removeFarmMember, updateMemberRole } from './members';
import { deleteFarm } from './farms';
import { getMyJoinRequests, deleteJoinRequest } from './join-requests';
import { deleteUserItems } from './users';

export async function deleteAccount(userId: string): Promise<DeleteAccountSummary> {
  const summary: DeleteAccountSummary = {
    farms_deleted: [],
    farms_left: [],
    farms_transferred: [],
    join_requests_deleted: 0,
    profile_deleted: true,
    settings_deleted: true,
  };

  const memberships = await getFarmsForUser(userId);

  for (const membership of memberships) {
    const farmId = membership.farm_id;
    const members = await getFarmMembers(farmId);

    if (members.length === 1) {
      await deleteFarm(farmId);
      summary.farms_deleted.push(farmId);
    } else if (membership.role === 'admin') {
      const otherMembers = members
        .filter((m) => m.user_id !== userId)
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at));

      const successor =
        otherMembers.find((m) => m.role === 'owner') ?? otherMembers[0];

      await updateMemberRole(farmId, successor.user_id, 'admin');
      await removeFarmMember(userId, farmId);
      summary.farms_transferred.push({ farm_id: farmId, new_admin: successor.user_id });
    } else {
      await removeFarmMember(userId, farmId);
      summary.farms_left.push(farmId);
    }
  }

  const joinRequests = await getMyJoinRequests(userId);
  for (const jr of joinRequests) {
    await deleteJoinRequest(jr.farm_id, userId);
  }
  summary.join_requests_deleted = joinRequests.length;

  await deleteUserItems(userId);

  return summary;
}
