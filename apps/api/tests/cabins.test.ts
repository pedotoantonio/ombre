import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const holderEmail = 'cabina@bagnodelledune.example';
const otherHolderEmail = 'altracabina@bagnodelledune.example';

interface MyAssignment {
  assignmentId: string;
  beachSlug: string;
  cabinCode: string;
  position: { zone: string; rowNumber: number; colStart: number; colEnd: number } | null;
  validFrom: string;
  validTo: string;
  status: string;
  sublets: { subletId: string; fromDay: string; toDay: string; occupantName: string; status: string }[];
}

describe.skipIf(!testAdminUrl)('sea cabins: assignments, sublets and the holder boundary', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let today: string;
  const tokens: Record<string, string> = {};
  const cabins: Record<string, string> = {};
  let blockId: string;
  let assignmentId: string;

  const day = (offset: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const { beachId } = await seedDemo(database.adminUrl);
    today = (await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today")).rows[0]!.today;
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });
    const sessions = [
      ...demoAccounts.map((account) => ({ key: account.role as string, ...account })),
      { key: 'holder', email: holderEmail, name: 'Titolare di cabina', role: 'cabin_holder' as const },
      { key: 'other', email: otherHolderEmail, name: 'Altro titolare', role: 'cabin_holder' as const },
    ];
    for (const account of sessions) {
      await upsertUser(database.adminUrl, { email: account.email, name: account.name, password }, [{ beachId, role: account.role }]);
      const response = await send('POST', '/v1/auth/login', { email: account.email, password });
      tokens[account.key] = ((await response.json()) as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  const send = (method: string, path: string, payload?: unknown, token?: string) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });

  const manage = `/v1/manage/beaches/${demoBeach.slug}`;
  const manager = () => tokens.manager!;
  const reception = () => tokens.reception!;
  const myCabins = async (token: string) => ((await (await send('GET', '/v1/my/cabins', undefined, token)).json()) as { assignments: MyAssignment[] }).assignments;
  const todayList = async (token: string) =>
    (await (await send('GET', `${manage}/cabins/today`, undefined, token)).json()) as { cabins: { code: string; occupant: { name: string | null; source: string } | null }[] };

  it('registers cabins inside a drawn block, with the permissions split of the specification', async () => {
    const block = (await (await send('POST', `${manage}/layout/elements`, { kind: 'cabin_block', label: 'Cabine', zone: 'monte', rowNumber: 1, colStart: 1, colEnd: 4 }, manager())).json()) as { elementId: string };
    blockId = block.elementId;
    const structure = (await (await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Bar', zone: 'monte', rowNumber: 2, colStart: 1, colEnd: 2 }, manager())).json()) as { elementId: string };

    for (const code of ['CAB1', 'CAB2', 'CAB3']) {
      const created = await send('POST', `${manage}/cabins`, { code, elementId: blockId }, manager());
      expect(created.status).toBe(201);
      cabins[code] = ((await created.json()) as { cabinId: string }).cabinId;
    }
    expect((await send('POST', `${manage}/cabins`, { code: 'CAB1' }, manager())).status).toBe(409);
    // A cabin hangs from a cabin block, never from another element.
    expect((await send('POST', `${manage}/cabins`, { code: 'CAB9', elementId: structure.elementId }, manager())).status).toBe(409);

    // The block and the eraser belong to layout.edit; cabins and decisions to cabins.manage.
    expect((await send('POST', `${manage}/cabins`, { code: 'CAB9' }, reception())).status).toBe(403);
    expect((await send('GET', `${manage}/cabins`, undefined, reception())).status).toBe(403);
    expect((await send('GET', `${manage}/cabins/today`, undefined, reception())).status).toBe(200);
    expect((await send('GET', `${manage}/cabins/today`, undefined, tokens.accounting)).status).toBe(403);
  });

  it('assigns a cabin for a period and refuses overlaps, with or without an account', async () => {
    const created = await send('POST', `${manage}/cabins/${cabins.CAB1}/assignments`, { holderEmail, holderName: 'Titolare di cabina', validFrom: day(-10), validTo: day(30) }, manager());
    expect(created.status).toBe(201);
    assignmentId = ((await created.json()) as { assignmentId: string }).assignmentId;

    expect((await send('POST', `${manage}/cabins/${cabins.CAB1}/assignments`, { holderName: 'Chiunque', validFrom: day(0), validTo: day(5) }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/cabins/${cabins.CAB2}/assignments`, { holderName: 'Chiunque', validFrom: day(5), validTo: day(1) }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/cabins/${cabins.CAB2}/assignments`, { holderEmail: 'nessuno@example.org', validFrom: day(0), validTo: day(5) }, manager())).status).toBe(404);
    expect((await send('POST', `${manage}/cabins/${cabins.CAB2}/assignments`, { validFrom: day(0), validTo: day(5) }, manager())).status).toBe(400);

    // A holder without an account exists only in the manager's register.
    expect((await send('POST', `${manage}/cabins/${cabins.CAB2}/assignments`, { holderName: 'Famiglia Marchetti', holderContact: '+39 000 000 0002', validFrom: day(-5), validTo: day(20) }, manager())).status).toBe(201);
  });

  it('shows the holder exactly their own cabins, and nothing to anyone else', async () => {
    const mine = await myCabins(tokens.holder!);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ beachSlug: demoBeach.slug, cabinCode: 'CAB1', status: 'active', validFrom: day(-10), validTo: day(30) });
    expect(mine[0]!.position).toEqual({ zone: 'monte', rowNumber: 1, colStart: 1, colEnd: 4 });
    // The other holder sees nothing: not CAB1, not the account-less CAB2.
    expect(await myCabins(tokens.other!)).toEqual([]);
    // The holder's role opens none of the club management.
    expect((await send('GET', `${manage}/cabins`, undefined, tokens.holder)).status).toBe(403);
    expect((await send('GET', `${manage}/layout`, undefined, tokens.holder)).status).toBe(403);
  });

  it('walks a sublet from proposal to decision inside the assignment period', async () => {
    const proposed = await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(-1), toDay: day(2), occupantName: 'Ospiti Lanzi' }, tokens.holder);
    expect(proposed.status).toBe(201);
    const first = ((await proposed.json()) as { subletId: string }).subletId;
    // Outside the assignment, inverted, or someone else's assignment: refused.
    expect((await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(25), toDay: day(40), occupantName: 'Fuori periodo' }, tokens.holder)).status).toBe(409);
    expect((await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(3), toDay: day(1), occupantName: 'Rovescio' }, tokens.holder)).status).toBe(409);
    expect((await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(1), toDay: day(2), occupantName: 'Intruso' }, tokens.other)).status).toBe(404);

    const pending = (await (await send('GET', `${manage}/cabin-sublets`, undefined, manager())).json()) as { sublets: { subletId: string; cabinCode: string }[] };
    expect(pending.sublets.map((sublet) => sublet.subletId)).toEqual([first]);
    expect((await send('POST', `${manage}/cabin-sublets/${first}/decision`, { approve: true }, reception())).status).toBe(403);
    expect((await send('POST', `${manage}/cabin-sublets/${first}/decision`, { approve: true }, manager())).status).toBe(204);
    expect((await send('POST', `${manage}/cabin-sublets/${first}/decision`, { approve: false }, manager())).status).toBe(409);

    // Overlapping an approved sublet is refused at proposal time; a later window is fine and can be rejected.
    expect((await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(1), toDay: day(3), occupantName: 'Sovrapposto' }, tokens.holder)).status).toBe(409);
    const later = (await (await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(5), toDay: day(8), occupantName: 'Da rifiutare' }, tokens.holder)).json()) as { subletId: string };
    expect((await send('POST', `${manage}/cabin-sublets/${later.subletId}/decision`, { approve: false }, manager())).status).toBe(204);

    const mine = await myCabins(tokens.holder!);
    expect(mine[0]!.sublets.map((sublet) => sublet.status).sort()).toEqual(['approved', 'rejected']);
  });

  it('tells the front desk who uses each cabin today', async () => {
    const seen = await todayList(reception());
    const byCode = Object.fromEntries(seen.cabins.map((cabin) => [cabin.code, cabin.occupant]));
    expect(byCode.CAB1).toEqual({ name: 'Ospiti Lanzi', source: 'sublet' });
    expect(byCode.CAB2).toEqual({ name: 'Famiglia Marchetti', source: 'holder' });
    expect(byCode.CAB3).toBeNull();
  });

  it('truncates and closes sublets when an assignment ends early, and audits every step', async () => {
    // One approved stay beyond the new end, one pending proposal beyond it.
    const beyond = (await (await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(10), toDay: day(15), occupantName: 'Oltre la chiusura' }, tokens.holder)).json()) as { subletId: string };
    expect((await send('POST', `${manage}/cabin-sublets/${beyond.subletId}/decision`, { approve: true }, manager())).status).toBe(204);
    expect((await send('POST', `/v1/my/assignments/${assignmentId}/sublets`, { fromDay: day(20), toDay: day(22), occupantName: 'In attesa oltre' }, tokens.holder)).status).toBe(201);

    const ended = await send('POST', `${manage}/cabin-assignments/${assignmentId}/end`, { endOn: day(1) }, manager());
    expect(await ended.json()).toEqual({ truncatedSublets: 1, closedSublets: 2 });
    expect((await send('POST', `${manage}/cabin-assignments/${assignmentId}/end`, { endOn: day(1) }, manager())).status).toBe(409);

    const mine = await myCabins(tokens.holder!);
    expect(mine[0]).toMatchObject({ status: 'ended', validTo: day(1) });
    const states = Object.fromEntries(mine[0]!.sublets.map((sublet) => [sublet.occupantName, { status: sublet.status, toDay: sublet.toDay }]));
    expect(states['Ospiti Lanzi']).toEqual({ status: 'approved', toDay: day(1) });
    expect(states['Oltre la chiusura']!.status).toBe('ended');
    expect(states['In attesa oltre']!.status).toBe('rejected');

    // The period is free again: a new assignment may start right after the end.
    expect((await send('POST', `${manage}/cabins/${cabins.CAB1}/assignments`, { holderName: 'Nuovo titolare', validFrom: day(2), validTo: day(40) }, manager())).status).toBe(201);

    const history = (await (await send('GET', `${manage}/cabins/${cabins.CAB1}`, undefined, manager())).json()) as { code: string; assignments: { status: string; sublets: unknown[] }[] };
    expect(history.code).toBe('CAB1');
    expect(history.assignments).toHaveLength(2);
    expect(history.assignments.find((entry) => entry.status === 'ended')?.sublets).toHaveLength(4);
  });

  it('keeps the cabins when their block is erased, and guards deletion by history', async () => {
    const erased = await send('DELETE', `${manage}/layout/elements/${blockId}`, undefined, manager());
    expect(await erased.json()).toEqual({ detachedCabins: 3 });
    const list = (await (await send('GET', `${manage}/cabins`, undefined, manager())).json()) as { cabins: { code: string; position: unknown }[] };
    expect(list.cabins.every((cabin) => cabin.position === null)).toBe(true);
    expect((await myCabins(tokens.holder!))[0]!.position).toBeNull();

    expect((await send('DELETE', `${manage}/cabins/${cabins.CAB1}`, undefined, manager())).status).toBe(409);
    expect((await send('DELETE', `${manage}/cabins/${cabins.CAB3}`, undefined, manager())).status).toBe(204);
  });

  it('never lets a cabin reach the public pages: the drawn block yes, the register no', async () => {
    // Cabin codes, assignments, sublets, holders and occupants are management data.
    // The cabin code is matched as a whole JSON string: a random identifier may
    // contain the hex letters "cab" by pure chance and must not trip the check.
    const hidden = /"CAB\d"|assignment|sublet|holder|occupant|Marchetti|Lanzi|titolare/i;
    const open = JSON.stringify(await (await send('GET', `/v1/beaches/${demoBeach.slug}/availability?day=${demoBeach.day}`)).json());
    expect(open).not.toMatch(hidden);
    const beaches = JSON.stringify(await (await send('GET', '/v1/beaches')).json());
    expect(beaches).not.toMatch(hidden);
  });

  it('writes every cabin action to the audit trail', async () => {
    const trail = await database.admin.query<{ action: string }>("SELECT DISTINCT action FROM audit_event WHERE action LIKE 'cabins.%'");
    expect(trail.rows.map((row) => row.action).sort()).toEqual([
      'cabins.assign',
      'cabins.assignment-end',
      'cabins.create',
      'cabins.delete',
      'cabins.sublet-approve',
      'cabins.sublet-end',
      'cabins.sublet-propose',
      'cabins.sublet-reject',
      'cabins.sublet-truncate',
    ]);
  });
});
