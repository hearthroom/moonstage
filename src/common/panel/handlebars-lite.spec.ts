import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindPanelCopy, renderPanel, sanitizePanelHtml } from './handlebars-lite'

const html = (template: string, data: unknown, opts?: Parameters<typeof renderPanel>[2]) => {
  const result = renderPanel(template, data, opts)
  expect(result.error).toBeUndefined()
  return result.html
}

const dom = (markup: string) => {
  const root = document.createElement('div')
  root.innerHTML = markup
  return root
}

describe('renderPanel: output and paths', () => {
  it('escapes {{x}} and leaves {{{x}}} / {{& x}} raw', () => {
    const data = { v: '<b>"a" & \'b\'</b>' }
    expect(html('{{v}}', data)).toBe('&lt;b&gt;"a" &amp; \'b\'&lt;/b&gt;')
    expect(dom(html('{{v}}', data)).textContent).toBe(data.v)
    expect(dom(html('{{{v}}}', data)).querySelector('b')?.textContent).toBe('"a" & \'b\'')
    expect(dom(html('{{& v}}', data)).querySelector('b')).not.toBeNull()
  })

  it('renders values like Handlebars: missing → empty, false/0 shown, arrays joined, objects stringified', () => {
    expect(html('[{{missing}}][{{a.b.c}}][{{f}}][{{z}}][{{list}}][{{obj}}][{{n}}]', { f: false, z: 0, list: [1, 'x'], obj: { a: 1 }, n: null }))
      .toBe('[][][false][0][1,x][[object Object]][]')
  })

  it('resolves nested paths, bracket segments, slash paths and CJK keys', () => {
    const data = { 好感度: 72, 角色: { 心情: '開心', 'weird key': 'ok' }, a: { b: { c: 'deep' } } }
    expect(html('{{好感度}}|{{角色.心情}}|{{角色.[weird key]}}|{{a/b/c}}|{{this.好感度}}', data)).toBe('72|開心|ok|deep|72')
  })

  it('reads only own properties', () => {
    expect(html('[{{constructor}}][{{a.__proto__}}][{{s.length}}][{{list.length}}]', { a: {}, s: 'abc', list: [1, 2] })).toBe('[][][3][2]')
  })

  it('drops comments, keeps escaped mustaches and handles whitespace control', () => {
    expect(html('a{{! note }}b{{!-- has }} inside --}}c', {})).toBe('abc')
    expect(html('\\{{literal}} {{v}}', { v: 1 })).toBe('{{literal}} 1')
    expect(html('<i>  {{~v~}}  </i>', { v: 1 })).toBe('<i>1</i>')
    expect(html('<i>  {{~{r}~}}  </i>|<i> {{{~r~}}} </i>', { r: '<b>x</b>' })).toBe('<i><b>x</b></i>|<i><b>x</b></i>')
    expect(html('<ul>\n  {{~#each l~}}\n  <li>{{this}}</li>\n  {{~/each~}}\n</ul>', { l: [1, 2] })).toBe('<ul><li>1</li><li>2</li></ul>')
  })
})

describe('renderPanel: blocks', () => {
  it('#each over arrays with @index/@key/@first/@last and this', () => {
    const out = html('{{#each l}}[{{@index}}{{@key}}{{#if @first}}F{{/if}}{{#if @last}}L{{/if}}:{{this}}]{{/each}}', { l: ['a', 'b', 'c'] })
    expect(out).toBe('[00F:a][11:b][22L:c]')
  })

  it('#each over objects exposes @key and this.x', () => {
    const out = html('{{#each 角色}}{{@key}}={{this.好感度}}{{#unless @last}},{{/unless}}{{/each}}', { 角色: { 小雪: { 好感度: 60 }, 阿光: { 好感度: 30 } } })
    expect(out).toBe('小雪=60,阿光=30')
  })

  it('else branches for if/unless/each/with and empty-array falsiness', () => {
    expect(html('{{#if l}}y{{else}}n{{/if}}', { l: [] })).toBe('n')
    expect(html('{{#if o}}y{{else}}n{{/if}}', { o: {} })).toBe('y')
    expect(html('{{#if z}}y{{else}}n{{/if}}|{{#if z includeZero=true}}y{{else}}n{{/if}}', { z: 0 })).toBe('n|y')
    expect(html('{{#unless x}}u{{else}}v{{/unless}}', { x: '' })).toBe('u')
    expect(html('{{#each l}}x{{else}}empty{{/each}}', { l: [] })).toBe('empty')
    expect(html('{{#each o}}x{{else}}empty{{/each}}', { o: {} })).toBe('empty')
    expect(html('{{#with p}}{{name}}{{else}}none{{/with}}', { p: null })).toBe('none')
    expect(html('{{#with p}}{{name}}{{/with}}', { p: { name: '露' } })).toBe('露')
  })

  it('chains {{else if}}', () => {
    const t = '{{#if (gt v 80)}}高{{else if (gt v 40)}}中{{else}}低{{/if}}'
    expect([90, 50, 10].map((v) => html(t, { v }))).toEqual(['高', '中', '低'])
  })

  it('../ climbs context-changing blocks only, not #if', () => {
    const data = { unit: '點', l: [{ v: 1, ok: true }], o: { x: { n: 2 } } }
    expect(html('{{#each l}}{{#if ok}}{{v}}{{../unit}}{{/if}}{{/each}}', data)).toBe('1點')
    expect(html('{{#with o}}{{#each this}}{{n}}{{../../unit}}{{/each}}{{/with}}', data)).toBe('2點')
    expect(html('{{#each l}}{{@root.unit}}{{/each}}', data)).toBe('點')
  })

  it('nested each with @../index and block params', () => {
    const data = { rows: [{ cells: ['a', 'b'] }, { cells: ['c'] }] }
    expect(html('{{#each rows}}{{#each cells}}{{@../index}}{{@index}}{{this}} {{/each}}{{/each}}', data)).toBe('00a 01b 10c ')
    expect(html('{{#each rows as |row r|}}{{#each row.cells as |cell|}}{{r}}{{cell}}{{/each}}{{/each}}', data)).toBe('0a0b1c')
  })

  it('sections on bare paths follow Handlebars: arrays iterate, objects switch context, falsy → else', () => {
    expect(html('{{#l}}{{this}}{{/l}}', { l: [1, 2] })).toBe('12')
    expect(html('{{#o}}{{n}}{{/o}}', { o: { n: 3 } })).toBe('3')
    expect(html('{{#flag}}on{{else}}off{{/flag}}', { flag: false })).toBe('off')
    expect(html('{{^flag}}off{{/flag}}', { flag: false })).toBe('off')
  })
})

describe('renderPanel: helpers', () => {
  it('sub-expressions with eq/ne/gt/gte/lt/lte/and/or/not', () => {
    const data = { a: 5, s: '開心', t: true }
    expect(html('{{#if (eq s "開心")}}1{{/if}}{{#if (eq s \'難過\')}}x{{/if}}', data)).toBe('1')
    expect(html('{{#if (and (gt a 3) (not (lt a 5)) t)}}ok{{/if}}', data)).toBe('ok')
    expect(html('{{#if (or (eq a 1) (gte a 5))}}ok{{/if}}{{#if (and (lte a 4) t)}}x{{/if}}', data)).toBe('ok')
    expect(html('{{#if (ne a 5)}}x{{else}}same{{/if}}', data)).toBe('same')
    expect(html('{{eq a 5}}|{{gt a 10}}|{{not t}}', data)).toBe('true|false|false')
  })

  it('eq/ne treat a number and the same number written as a string as equal; everything else stays strict', () => {
    const data = { n: 50, s: '50', f: 1.5, z: 0, b: true, t: 'abc' }
    expect(html('{{eq n "50"}}|{{eq s 50}}|{{eq f " 1.5 "}}|{{ne n "50"}}|{{eq s "50.0"}}', data)).toBe('true|true|true|false|false')
    expect(html('{{eq z ""}}|{{eq z false}}|{{eq b "true"}}|{{eq t 0}}|{{eq n "5e1"}}|{{eq n "0x32"}}', data)).toBe('false|false|false|false|true|false')
    expect(html('{{#if (eq 好感度 "60")}}y{{else}}n{{/if}}', { 好感度: 60 })).toBe('y')
  })

  it('inline helpers work as blocks too', () => {
    expect(html('{{#eq v 1}}one{{else}}other{{/eq}}', { v: 1 })).toBe('one')
    expect(html('{{#gt v 1}}big{{else}}small{{/gt}}', { v: 1 })).toBe('small')
  })

  it('lookup reads a dynamic key', () => {
    const data = { names: { a: '小雪' }, key: 'a', list: ['x', 'y'] }
    expect(html('{{lookup names key}}|{{lookup list 1}}|{{#each list}}{{lookup ../names "a"}}{{/each}}', data)).toBe('小雪|y|小雪小雪')
  })

  it('literals: numbers, quoted strings, true/false/null', () => {
    expect(html('{{#if (eq n -1.5)}}a{{/if}}{{#if (eq b false)}}b{{/if}}{{#if (eq z null)}}c{{/if}}{{"lit"}}', { n: -1.5, b: false, z: null })).toBe('abclit')
  })
})

describe('renderPanel: @changes and @audience', () => {
  it('exposes opts.changes as @changes everywhere', () => {
    const changes = [{ path: '好感度', from: 50, to: 55 }, { path: '金錢', from: 10, to: 0 }]
    expect(html('{{#each @changes}}{{this.path}}:{{from}}→{{to}};{{/each}}', {}, { changes })).toBe('好感度:50→55;金錢:10→0;')
    expect(html('{{#with x}}{{#each @changes}}{{path}}{{/each}}{{/with}}', { x: {} }, { changes })).toBe('好感度金錢')
    expect(html('{{#each @changes}}x{{else}}none{{/each}}', {})).toBe('none')
  })

  it('audience is readable but does not otherwise change output', () => {
    expect(html('{{@audience}}', {}, { audience: 'author' })).toBe('author')
    expect(renderPanel('{{v}}', { v: 1 }, { audience: 'player' })).toEqual(renderPanel('{{v}}', { v: 1 }, { audience: 'author' }))
  })
})

describe('renderPanel: errors', () => {
  it('unknown helper → name and 1-based line, even in an untaken branch', () => {
    expect(renderPanel('a\nb\n{{format 金錢 "0.00"}}', {})).toEqual({ html: '', error: { message: 'Unknown helper "format"', line: 3, helper: 'format' } })
    expect(renderPanel('{{#if false}}\n{{#if (sum a b)}}x{{/if}}{{/if}}', {}).error).toMatchObject({ line: 2, helper: 'sum' })
    expect(renderPanel('{{#repeat 3}}x{{/repeat}}', {}).error).toMatchObject({ line: 1, helper: 'repeat' })
  })

  it('unclosed block reports the opening line', () => {
    const r = renderPanel('<div>\n{{#each list}}\n{{this}}\n</div>', { list: [1] })
    expect(r.html).toBe('')
    expect(r.error?.line).toBe(2)
    expect(r.error?.message).toMatch(/Unclosed block \{\{#each\}\}/)
  })

  it('mismatched close, stray else/close and unclosed tags', () => {
    expect(renderPanel('{{#if a}}\n{{/each}}', {}).error).toMatchObject({ line: 2 })
    expect(renderPanel('x\n{{/if}}', {}).error).toMatchObject({ line: 2 })
    expect(renderPanel('{{else}}', {}).error?.message).toMatch(/outside of a block/)
    expect(renderPanel('a\n\n{{v', {}).error).toMatchObject({ line: 3 })
    expect(renderPanel('{{> partial}}', {}).error?.message).toMatch(/Partials/)
    expect(renderPanel('{{#if}}x{{/if}}', {}).error?.message).toMatch(/exactly one argument/)
    expect(renderPanel('{{if a}}', {}).error?.helper).toBe('if')
  })
})

describe('sanitizePanelHtml (DOM)', () => {
  it('strips script, on* handlers and javascript: URLs but keeps style', () => {
    const out = sanitizePanelHtml(
      '<div onclick="x()" class="k"><script>alert(1)</script><img src="a.png" onerror="x()"><a href=" JaVa\tScript:alert(1)">l</a>' +
        '<a href="https://ok.example/">ok</a><svg><a xlink:href="javascript:x()">s</a></svg></div><style>.k{color:red}</style>' +
        '<iframe srcdoc="<script>x()</script>"></iframe><template><b onmouseover="x()">t</b></template>',
    )
    expect(out).not.toMatch(/script|onclick|onerror|onmouseover|javascript|iframe/i)
    const root = dom(out)
    expect(root.querySelector('.k')).not.toBeNull()
    expect(root.querySelector('img')?.getAttribute('src')).toBe('a.png')
    expect(root.querySelectorAll('a')[1].getAttribute('href')).toBe('https://ok.example/')
    expect(root.querySelector('style')?.textContent).toBe('.k{color:red}')
  })

  it('renderPanel output is sanitized while escaped data stays inert', () => {
    const r = html('<button onclick="go()">{{v}}</button>{{{raw}}}', { v: '<script>x</script>', raw: '<img src=x onerror=alert(1)>' })
    expect(r).toBe('<button>&lt;script&gt;x&lt;/script&gt;</button><img src="x">')
  })
})

describe('Fengyue-style skin', () => {
  it('renders the panel with helpers, copy target and style', () => {
    const skin =
      '<div class="panel">{{#each 角色}}<div class="row">{{@key}}：{{this.好感度}}{{#if (gt this.好感度 50)}}<b>親密</b>{{else}}<i>普通</i>{{/if}}</div>{{/each}}' +
      '<span data-panel-copy>{{金錢}}</span></div><style>.panel{color:red}</style>'
    const out = html(skin, { 角色: { 小雪: { 好感度: 72 }, 阿光: { 好感度: 30 } }, 金錢: 1200 })
    expect(out).toBe(
      '<div class="panel"><div class="row">小雪：72<b>親密</b></div><div class="row">阿光：30<i>普通</i></div>' +
        '<span data-panel-copy="">1200</span></div><style>.panel{color:red}</style>',
    )
  })
})

describe('bindPanelCopy', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    document.body.innerHTML = ''
  })
  const setup = () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const root = document.createElement('div')
    root.innerHTML = '<span data-panel-copy="CODE-42"><i>點我</i></span><span data-panel-copy> 1200 </span><p>plain</p>'
    document.body.appendChild(root)
    const notify = vi.fn()
    const unbind = bindPanelCopy(root, notify)
    return { root, writeText, notify, unbind }
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('copies the attribute value from a descendant click, then notifies', async () => {
    const { root, writeText, notify } = setup()
    root.querySelector('i')!.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('CODE-42')
    expect(notify).toHaveBeenCalledWith('CODE-42')
  })

  it('falls back to the element text when the attribute is empty', async () => {
    const { root, writeText, notify } = setup()
    ;(root.querySelectorAll('span')[1] as HTMLElement).click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('1200')
    expect(notify).toHaveBeenCalledWith('1200')
  })

  it('ignores other clicks and stops after unbind', async () => {
    const { root, writeText, unbind } = setup()
    root.querySelector('p')!.click()
    unbind()
    root.querySelector('i')!.click()
    await flush()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('does not notify when no copy path works', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const root = dom('<b data-panel-copy="x">x</b>')
    document.body.appendChild(root)
    const notify = vi.fn()
    bindPanelCopy(root, notify)
    root.querySelector('b')!.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('x')
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('sanitizer re-parse (mutation) safety', () => {
  const live = (html: string) => {
    const box = document.createElement('div')
    box.innerHTML = html
    return Array.from(box.querySelectorAll('*')).some((el) => Array.from(el.attributes).some((a) => /^on/i.test(a.name)) || el.localName === 'script')
  }
  it.each([
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
    '<form><math><mtext></form><form><mglyph><style></math><img src=x onerror=alert(1)>',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  ])('nothing executable survives being put into a div: %s', (payload) => {
    const out = sanitizePanelHtml(payload)
    expect(live(out)).toBe(false)
    expect(live(sanitizePanelHtml(out))).toBe(false)
  })
  it('drops external stylesheets', () => {
    expect(sanitizePanelHtml('<link rel="stylesheet" href="https://x.test/a.css"><b>x</b>')).toBe('<b>x</b>')
  })
})
