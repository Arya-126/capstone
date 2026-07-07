import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

// Friend graph for the "friends" leaderboard scope. A friendship is a single
// row (requester→addressee) with a status; either direction counts once
// accepted.

export async function getFriendIds(userId: string): Promise<string[]> {
  const links = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const ids = new Set<string>();
  for (const f of links) ids.add(f.requesterId === userId ? f.addresseeId : f.requesterId);
  return [...ids];
}

const router = Router();
const userCard = { id: true, name: true, level: true, xpTotal: true } as const;

// GET /friends — accepted friends + pending requests (incoming/outgoing)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!;
    const all = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: uid }, { addresseeId: uid }] },
      include: { requester: { select: userCard }, addressee: { select: userCard } },
      orderBy: { createdAt: 'desc' },
    });
    const friends: any[] = [];
    const incoming: any[] = [];
    const outgoing: any[] = [];
    for (const f of all) {
      if (f.status === 'ACCEPTED') {
        friends.push({ ...(f.requesterId === uid ? f.addressee : f.requester), friendshipId: f.id });
      } else if (f.addresseeId === uid) {
        incoming.push({ ...f.requester, friendshipId: f.id });
      } else {
        outgoing.push({ ...f.addressee, friendshipId: f.id });
      }
    }
    res.json({ friends, incoming, outgoing });
  } catch (error) {
    console.error('Friends list error:', error);
    res.status(500).json({ error: 'Failed to load friends' });
  }
});

// POST /friends/request { email } — request, or auto-accept a reverse pending
router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.userId!;
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email required' });
    const target = await prisma.user.findUnique({ where: { email } });
    if (!target) return res.status(404).json({ error: 'No user with that email' });
    if (target.id === uid) return res.status(400).json({ error: "You can't add yourself" });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: uid, addresseeId: target.id },
          { requesterId: target.id, addresseeId: uid },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'PENDING' && existing.addresseeId === uid) {
        await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
        return res.json({ ok: true, status: 'ACCEPTED' });
      }
      return res.json({ ok: true, status: existing.status });
    }
    await prisma.friendship.create({ data: { requesterId: uid, addresseeId: target.id } });
    res.json({ ok: true, status: 'PENDING' });
  } catch (error) {
    console.error('Friend request error:', error);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// POST /friends/:id/accept — only the addressee can accept
router.post('/:id/accept', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const f = await prisma.friendship.findUnique({ where: { id: req.params.id } });
    if (!f || f.addresseeId !== req.userId) return res.status(404).json({ error: 'Request not found' });
    await prisma.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED' } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Friend accept error:', error);
    res.status(500).json({ error: 'Failed to accept' });
  }
});

export default router;
