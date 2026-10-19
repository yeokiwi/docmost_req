import { BadRequestException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { QueueJob } from '../../integrations/queue/constants';

function setup() {
  const commentRepo = {
    updateComment: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockImplementation(async (id) => ({ id, updated: true })),
  };
  const wsService = { emitCommentEvent: jest.fn() };
  const collab = { handleYjsEvent: jest.fn().mockResolvedValue(undefined) };
  const notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new CommentService(
    commentRepo as any,
    {} as any,
    wsService as any,
    collab as any,
    {} as any,
    notificationQueue as any,
  );
  return { service, commentRepo, wsService, collab, notificationQueue };
}

const base = {
  id: 'c1',
  pageId: 'p1',
  spaceId: 's1',
  workspaceId: 'w1',
  creatorId: 'author',
  parentCommentId: null,
  resolvedAt: null,
} as any;
const user = { id: 'u1' } as any;

describe('CommentService.resolve', () => {
  it('resolves, updates the mark, notifies the author and broadcasts', async () => {
    const { service, commentRepo, collab, notificationQueue, wsService } =
      setup();
    await service.resolve(base, true, user);

    const [values, id] = commentRepo.updateComment.mock.calls[0];
    expect(id).toBe('c1');
    expect(values.resolvedById).toBe('u1');
    expect(values.resolvedAt).toBeInstanceOf(Date);
    expect(collab.handleYjsEvent).toHaveBeenCalledWith(
      'resolveCommentMark',
      'page.p1',
      { commentId: 'c1', resolved: true, user },
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      QueueJob.COMMENT_RESOLVED_NOTIFICATION,
      expect.objectContaining({ commentCreatorId: 'author', actorId: 'u1' }),
    );
    expect(wsService.emitCommentEvent).toHaveBeenCalledWith(
      's1',
      'p1',
      expect.objectContaining({ operation: 'commentResolved' }),
    );
  });

  it('re-opens without notifying', async () => {
    const { service, commentRepo, notificationQueue } = setup();
    await service.resolve({ ...base, resolvedAt: new Date() }, false, user);
    expect(commentRepo.updateComment.mock.calls[0][0]).toMatchObject({
      resolvedAt: null,
      resolvedById: null,
    });
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('does not notify when resolving your own comment', async () => {
    const { service, notificationQueue } = setup();
    await service.resolve({ ...base, creatorId: 'u1' }, true, user);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('is a no-op write when the state already matches', async () => {
    const { service, commentRepo, collab } = setup();
    await service.resolve({ ...base, resolvedAt: new Date() }, true, user);
    expect(commentRepo.updateComment).not.toHaveBeenCalled();
    expect(collab.handleYjsEvent).not.toHaveBeenCalled();
  });

  it('rejects replies', async () => {
    const { service } = setup();
    await expect(
      service.resolve({ ...base, parentCommentId: 'x' }, true, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
