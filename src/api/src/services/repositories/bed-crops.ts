import { QueryCommand, UpdateCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { BedCrop } from '@litcrop/shared';
import { DDB_KEY_PREFIXES } from '@litcrop/shared';
import { ddb, TABLE_NAME, pk, sk, GSI1_INDEX } from './_infrastructure';
import { itemToBedCrop } from './_mappers';
import { getBedById } from './beds';
import { NotFoundError } from '../../errors';

/**
 * BedCrop repository (#279 Wave B).
 *
 * All GSI1 queries MUST include `begins_with(GSI1SK, 'CROP#')` — the bed's
 * own `#META` row shares `GSI1PK=BED#<bedId>` and would otherwise be returned
 * mixed with BedCrop rows. This is a DESIGN-279 §3.4 mandatory guardrail
 * (S4-2 remediation). Exposed queries below uphold this contract; do NOT
 * add a raw `queryByGSI1(BED#<b>)` call that omits the prefix filter.
 */

/** List all BedCrops for a bed, newest SK first (natural GSI1 order). */
export async function listBedCropsByBed(bedId: string): Promise<BedCrop[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': pk.bed(bedId),
        ':prefix': DDB_KEY_PREFIXES.CROP,
      },
    }),
  );
  return (result.Items ?? []).map((item) => itemToBedCrop(item));
}

/** Get one BedCrop by id via GSI1. */
export async function getBedCrop(bedId: string, bedCropId: string): Promise<BedCrop> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: {
        ':pk': pk.bed(bedId),
        ':sk': sk.cropGsi1(bedCropId),
      },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) throw new NotFoundError(`BedCrop not found: ${bedCropId}`);
  return itemToBedCrop(item);
}

/** Create a new BedCrop. Caller is responsible for enforcing the 5-cap (see routes). */
export async function createBedCrop(bedCrop: BedCrop): Promise<BedCrop> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: pk.farm(bedCrop.farm_id),
        SK: sk.crop(bedCrop.bed_id, bedCrop.id),
        GSI1PK: pk.bed(bedCrop.bed_id),
        GSI1SK: sk.cropGsi1(bedCrop.id),
        ...bedCrop,
      },
    }),
  );
  return bedCrop;
}

/** Update a BedCrop. null-valued fields are removed; undefined fields are skipped. */
export async function updateBedCrop(
  farmId: string,
  bedId: string,
  bedCropId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const setExpressions: string[] = [];
  const removeExpressions: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    if (value === null) {
      removeExpressions.push(`#${key}`);
    } else {
      setExpressions.push(`#${key} = :${key}`);
      values[`:${key}`] = value;
    }
  }

  if (setExpressions.length === 0 && removeExpressions.length === 0) return;

  const parts: string[] = [];
  if (setExpressions.length > 0) parts.push(`SET ${setExpressions.join(', ')}`);
  if (removeExpressions.length > 0) parts.push(`REMOVE ${removeExpressions.join(', ')}`);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.crop(bedId, bedCropId) },
      UpdateExpression: parts.join(' '),
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
      ConditionExpression: 'attribute_exists(PK)',
    }),
  );
}

/** Hard-delete a BedCrop. Soft delete (status → 'failed') is the route-layer policy. */
export async function deleteBedCrop(farmId: string, bedId: string, bedCropId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk.farm(farmId), SK: sk.crop(bedId, bedCropId) },
    }),
  );
}

/**
 * Resolve the active crop cycle for a bed. Implements the lazy-materialize
 * strategy per DESIGN-279 §6:
 *   1. Query GSI1 for real BedCrop items on this bed.
 *   2. Return the first active/planned one if found.
 *   3. Fallback: if the bed still has legacy inline `crop_type` + no `completed_at`,
 *      synthesize a non-persisted virtual BedCrop with a deterministic id
 *      (`bed-legacy-<bedId>`) so it never clashes with real uuids.
 *   4. Otherwise null.
 *
 * Wave E will remove the fallback branch after all legacy beds are promoted
 * to real BedCrop rows (see design §6 step 3).
 */
export async function getActiveCropForBed(bedId: string): Promise<BedCrop | null> {
  const crops = await listBedCropsByBed(bedId);
  const active = crops.find((c) => c.status === 'active' || c.status === 'planned');
  if (active) return active;

  const bed = await getBedById(bedId);
  if (bed.crop_type && !bed.completed_at) {
    return synthesizeVirtualBedCrop(bed.id, bed.farm_id, bed);
  }
  return null;
}

function synthesizeVirtualBedCrop(
  bedId: string,
  farmId: string,
  bed: { crop_type?: string; crop_variety?: string; planted_at?: string; expected_harvest?: string },
): BedCrop {
  const now = new Date().toISOString();
  return {
    id: `bed-legacy-${bedId}`,
    bed_id: bedId,
    farm_id: farmId,
    crop_type: bed.crop_type as string,
    crop_variety: bed.crop_variety,
    planted_at: bed.planted_at,
    expected_harvest: bed.expected_harvest,
    status: 'active',
    created_by: 'system',
    created_at: now,
    updated_at: now,
  };
}
