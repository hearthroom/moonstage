// @vitest-environment jsdom
/**
 * 殼的進入點：ready-shell 每 500ms 重喊直到 hello 到；hello 只認 window.parent，之後釘死 origin。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { bootSandbox } from '../main'
import { envelope, type SandboxHelloConfig } from '../protocol'

const config: SandboxHelloConfig = {
  theme: 'dark', locale: 'zh-Hant', role: { name: 'A', avatarUrl: '' }, user: { nickname: 'B', avatarUrl: '' },
  card: { rules: [], statusbar: '' }, capabilities: { saves: false, edit: false, send: true }, composer: true,
}

function fakeWindow() {
  document.body.innerHTML = '<div id="app"></div>'
  const parent = { postMessage: vi.fn() }
  const listeners: Record<string, ((e: any) => void)[]> = {}
  const win = {
    document,
    parent,
    location: { search: '' },
    visualViewport: null,
    addEventListener: (type: string, fn: (e: any) => void) => { (listeners[type] ||= []).push(fn) },
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    setTimeout, clearTimeout, Date, Promise, Object, JSON, Math, String, Number, Array, RegExp, Error,
  } as unknown as Window & typeof globalThis
  const dispatch = (data: unknown, source: unknown = parent, origin = 'https://host.test') => {
    for (const fn of listeners.message || []) fn({ data, source, origin })
  }
  return { win, parent, dispatch }
}

afterEach(() => { vi.useRealTimers() })

describe('bootSandbox 握手', () => {
  it('ready-shell 每 500ms 重喊；hello 到了就停', () => {
    vi.useFakeTimers()
    const { win, parent, dispatch } = fakeWindow()
    bootSandbox(win)
    expect(parent.postMessage).toHaveBeenCalledTimes(1)
    expect(parent.postMessage.mock.calls[0][0]).toMatchObject({ type: 'ready-shell' })
    vi.advanceTimersByTime(1000)
    expect(parent.postMessage).toHaveBeenCalledTimes(3)
    dispatch(envelope({ type: 'hello', config }))
    vi.advanceTimersByTime(3000)
    const readyShells = parent.postMessage.mock.calls.filter((c) => c[0]?.type === 'ready-shell')
    expect(readyShells).toHaveLength(3)
    expect(document.querySelector('[data-chat=root]')).not.toBeNull()
  })

  it('沒等到 hello 十秒後不再喊', () => {
    vi.useFakeTimers()
    const { win, parent } = fakeWindow()
    bootSandbox(win)
    vi.advanceTimersByTime(30_000)
    const n = parent.postMessage.mock.calls.length
    expect(n).toBeGreaterThan(15)
    expect(n).toBeLessThanOrEqual(22)
    vi.advanceTimersByTime(30_000)
    expect(parent.postMessage.mock.calls.length).toBe(n)
  })

  it('hello 不是來自 parent 的一律不理', () => {
    const { win, dispatch } = fakeWindow()
    bootSandbox(win)
    dispatch(envelope({ type: 'hello', config }), { other: true })
    expect(document.querySelector('[data-chat=root]')).toBeNull()
  })
})

describe('protocol v2 negotiation', () => {
 it('advertises v2 on legacy ready-shell and accepts the selected v2 hello', () => {
  const {win,parent,dispatch}=fakeWindow()
  bootSandbox(win)
  expect(parent.postMessage.mock.calls[0][0]).toMatchObject({ms:1,type:'ready-shell',protocols:[1,2]})
  dispatch({ms:2,type:'hello',config:{...config,capabilities:{...config.capabilities,history:1}}})
  expect(document.querySelector('[data-sandbox="ready"]')).not.toBeNull()
  dispatch({ms:2,type:'messages',messages:[]})
  expect(parent.postMessage.mock.calls.some(([m])=>m.ms===2&&m.type==='ready')).toBe(true)
 })
 it('keeps v1 when an old host replies with v1 hello', () => {
  const {win,parent,dispatch}=fakeWindow()
  bootSandbox(win);dispatch({ms:1,type:'hello',config});dispatch({ms:1,type:'messages',messages:[]})
  expect(parent.postMessage.mock.calls.some(([m])=>m.ms===1&&m.type==='ready')).toBe(true)
 })
})

it('uses selected v2 while synchronous top-level author code runs inside hello',async()=>{
 const {JSDOM}=await import('jsdom')
 const dom=new JSDOM('<div id="app"></div>',{url:'https://shell.fixture.test',runScripts:'dangerously'})
 const win=dom.window as any,sent:any[]=[];const parent={postMessage:(m:any)=>sent.push(m)}
 Object.defineProperty(win,'parent',{value:parent})
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 win.ResizeObserver=class{observe(){}disconnect(){}}
 const computed=win.getComputedStyle.bind(win);win.getComputedStyle=(el:any)=>computed(el)
 try{
  bootSandbox(win)
  const cfg={...config,capabilities:{...config.capabilities,history:1},history:{version:1,available:true,reason:'ready'},card:{rules:[{find:'not-matched',replace:'<script>sdk.history.onChange(function(){});sdk.history.list().catch(function(){});<\/script>'}],statusbar:''}}
  win.dispatchEvent(new win.MessageEvent('message',{source:parent,origin:'https://host.fixture.test',data:{ms:2,type:'hello',config:cfg}}))
  const requests=sent.filter(m=>m.type==='request'&&m.op.startsWith('history.'))
  expect(requests.map(m=>m.op).sort()).toEqual(['history.list','history.subscribe'])
  expect(requests.every(m=>m.ms===2)).toBe(true)
  win.dispatchEvent(new win.MessageEvent('message',{source:parent,origin:'https://host.fixture.test',data:{ms:2,type:'dispose'}}))
 }finally{dom.window.close()}
})
