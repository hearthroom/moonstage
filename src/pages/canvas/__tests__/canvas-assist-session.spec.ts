import { describe, it, expect, vi } from 'vitest'
import { createAssistSession } from '../canvas-assist-state'

describe('paid assist intent', () => {
  const setup = () => { const request=vi.fn().mockResolvedValue(['One','Two','Three']); const fill=vi.fn(); return { request, fill, session:createAssistSession(request,fill) } }
  it('opening and dismissing never requests; confirmation requests once; reopening and selection reuse the result', async () => {
    const {session,request,fill}=setup(); session.context('c:1'); session.open(); session.close(); session.open();
    expect(request).not.toHaveBeenCalled(); expect(session.state.confirming).toBe(true);
    await session.confirm(); expect(request).toHaveBeenCalledTimes(1); expect(fill).not.toHaveBeenCalled();
    session.close(); session.open(); expect(session.state.confirming).toBe(false);
    session.pick(1); expect(fill).toHaveBeenCalledWith('Two'); session.open(); expect(session.state.choices).toHaveLength(3); expect(request).toHaveBeenCalledTimes(1);
  });
  it('refresh needs a separate confirmation and retains old choices on failure', async () => {
    const {session,request}=setup(); session.context('c:1'); session.open(); await session.confirm();
    session.refresh(); session.cancel(); expect(request).toHaveBeenCalledTimes(1);
    session.refresh(); request.mockRejectedValueOnce(new Error('failed')); await session.confirm();
    expect(request).toHaveBeenLastCalledWith('c:1',true); expect(session.state.choices).toEqual(['One','Two','Three']); expect(session.state.error).toBeTruthy();
  });
  it('coalesces repeat clicks and fences late completions after a new round or conversation', async () => {
    const {session,request,fill}=setup(); let resolve!:(v:string[])=>void;
    request.mockReturnValueOnce(new Promise<string[]>(r=>resolve=r)); session.context('c:1'); session.open(); const pending=session.confirm();
    session.close(); session.open(); await session.confirm(); expect(request).toHaveBeenCalledTimes(1);
    session.context('c:2'); session.open(); resolve(['Stale']); await pending;
    expect(session.state.choices).toEqual([]); expect(session.state.confirming).toBe(true); expect(fill).not.toHaveBeenCalled();
  });
  it('switching back to an unchanged conversation reuses its choices', async () => {
    const {session,request}=setup(); session.context('a:1'); session.open(); await session.confirm(); session.context('b:1'); session.context('a:1'); session.open();
    expect(session.state.choices).toHaveLength(3); expect(request).toHaveBeenCalledTimes(1);
  });
});
