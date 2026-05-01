import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoRepository } from '../../services/dynamodb';
import type { Image } from '@litcrop/shared';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

const repo = new DynamoRepository();

const FARM_ID = 'f0000000-0000-0000-0000-000000000001';
const BED_ID = 'bd000000-0000-0000-0000-000000000001';
const IMG_ID = 'im000000-0000-0000-0000-000000000001';

function imageItem(id: string, capturedAt: string): Record<string, unknown> {
  return {
    PK: `BED#${BED_ID}`,
    SK: `IMG#${capturedAt}#${id}`,
    GSI1PK: `IMG#${id}`,
    GSI1SK: '#META',
    id,
    bed_id: BED_ID,
    node_id: 'cam-001',
    captured_at: capturedAt,
    uploaded_at: capturedAt,
    storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${id}.jpg`,
    trigger: 'scheduled',
    content_type: 'image/jpeg',
    size_bytes: 102400,
  };
}

// ── listImagesByBedAndDay — SK prefix guardrail (#478) ──────────

describe('listImagesByBedAndDay', () => {
  it('queries with begins_with(SK, "IMG#YYYY-MM-DD") on the bed partition', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [imageItem(IMG_ID, '2026-03-17T10:00:00.000Z')] });

    await repo.listImagesByBedAndDay(BED_ID, '2026-03-17');

    const call = ddbMock.commandCalls(QueryCommand)[0];
    const input = call.args[0].input;
    expect(input.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :prefix)');
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':pk': `BED#${BED_ID}`,
      ':prefix': 'IMG#2026-03-17',
    });
    // Newest-first to match getImagesForBed; not strictly required for delete
    // but stable for any future paged variant.
    expect(input.ScanIndexForward).toBe(false);
  });

  it('maps DDB items to Image shape', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [imageItem(IMG_ID, '2026-03-17T10:00:00.000Z')],
    });

    const images = await repo.listImagesByBedAndDay(BED_ID, '2026-03-17');

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: IMG_ID,
      bed_id: BED_ID,
      captured_at: '2026-03-17T10:00:00.000Z',
      trigger: 'scheduled',
    });
  });

  it('returns empty array on no matches', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const images = await repo.listImagesByBedAndDay(BED_ID, '2026-03-17');

    expect(images).toEqual([]);
  });
});

// ── deleteImage — tag cascade + BatchWrite chunking + retry (#478) ─

describe('deleteImage', () => {
  const image: Image = {
    id: IMG_ID,
    bed_id: BED_ID,
    node_id: 'cam-001',
    captured_at: '2026-03-17T10:00:00.000Z',
    uploaded_at: '2026-03-17T10:00:05.000Z',
    storage_key: `images/${FARM_ID}/${BED_ID}/2026/03/17/${IMG_ID}.jpg`,
    trigger: 'scheduled',
    content_type: 'image/jpeg',
    size_bytes: 102400,
  };

  it('queries tags then BatchWrites image+tags in one chunk when N+1 ≤ 25', async () => {
    const tagItems = Array.from({ length: 3 }, (_, i) => ({
      PK: `IMG#${IMG_ID}`,
      SK: `TAG#2026-03-17T11:00:0${i}.000Z#tag-${i}`,
    }));
    ddbMock.on(QueryCommand).resolves({ Items: tagItems });
    ddbMock.on(BatchWriteCommand).resolves({});

    await repo.deleteImage(image);

    const queryCalls = ddbMock.commandCalls(QueryCommand);
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].args[0].input.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :prefix)');
    expect(queryCalls[0].args[0].input.ExpressionAttributeValues).toMatchObject({
      ':pk': `IMG#${IMG_ID}`,
      ':prefix': 'TAG#',
    });

    const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
    expect(batchCalls).toHaveLength(1);
    const requests = batchCalls[0].args[0].input.RequestItems!['litcrop-dev'];
    expect(requests).toHaveLength(4); // 1 image row + 3 tag rows
    // First request must be the image row
    expect(requests![0].DeleteRequest!.Key).toMatchObject({
      PK: `BED#${BED_ID}`,
      SK: `IMG#${image.captured_at}#${IMG_ID}`,
    });
  });

  it('chunks at 25 items per BatchWrite when image+tags exceeds 25', async () => {
    // 30 tags + 1 image row = 31 deletes → 2 chunks (25, 6)
    const tagItems = Array.from({ length: 30 }, (_, i) => ({
      PK: `IMG#${IMG_ID}`,
      SK: `TAG#2026-03-17T11:00:00.${String(i).padStart(3, '0')}Z#tag-${i}`,
    }));
    ddbMock.on(QueryCommand).resolves({ Items: tagItems });
    ddbMock.on(BatchWriteCommand).resolves({});

    await repo.deleteImage(image);

    const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0].args[0].input.RequestItems!['litcrop-dev']).toHaveLength(25);
    expect(batchCalls[1].args[0].input.RequestItems!['litcrop-dev']).toHaveLength(6);
  });

  it('retries UnprocessedItems once on first BatchWrite chunk', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] }); // no tags
    const unprocessed = [{
      DeleteRequest: { Key: { PK: `BED#${BED_ID}`, SK: `IMG#${image.captured_at}#${IMG_ID}` } },
    }];
    ddbMock
      .on(BatchWriteCommand)
      .resolvesOnce({ UnprocessedItems: { 'litcrop-dev': unprocessed } })
      .resolves({}); // retry succeeds

    await repo.deleteImage(image);

    expect(ddbMock.commandCalls(BatchWriteCommand)).toHaveLength(2);
  });

  it('handles image with zero tags (image-only delete)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(BatchWriteCommand).resolves({});

    await repo.deleteImage(image);

    const batchCalls = ddbMock.commandCalls(BatchWriteCommand);
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0].args[0].input.RequestItems!['litcrop-dev']).toHaveLength(1);
  });
});
