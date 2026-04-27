import { useState, useEffect, useRef, useCallback } from 'react'

const CATEGORIES = ["","動物","建物・建築","ビジネス","飲み物","環境","感情と情緒","食べ物","グラフィック素材","趣味とレジャー","産業","風景","ライフスタイル","人物","植物・花","宗教・文化","科学","社会問題","スポーツ","テクノロジー","交通手段","旅行"]
const STORAGE_SESSIONS = 'smg_sessions'
const STORAGE_APIKEY = 'smg_apikey'
const today = () => new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\//g,'/')
let _id = Date.now()
const uid = () => String(++_id)

const RED = '#c8321e'
const DARK = '#1a1a1a'
const WHITE = '#ffffff'
const LIGHT_BG = '#f5f4f2'
const BORDER = '#e0ddd6'
const TEXT = '#1a1a1a'
const MUTED = '#888'
const SERIF = "'Cormorant Garamond', Georgia, serif"
const ZK = '"Zen Kaku Gothic New", sans-serif'
const SANS = "'DM Sans', system-ui, sans-serif"

const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = reject
  reader.onload = (e) => {
    const src = e.target.result
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      const MAX = 800
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const compressed = canvas.toDataURL('image/jpeg', 0.75)
      resolve({ preview: compressed, base64: compressed.split(',')[1] })
    }
    img.src = src
  }
  reader.readAsDataURL(file)
})

const callAPI = async (base64, apiKey, userPrompt) => {
  const extra = userPrompt ? `\n\nAdditional instructions:\n${userPrompt}` : ''
  const res = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: `You are a professional stock photo metadata specialist. Analyze this image and return ONLY a JSON object.
{"title":"...","keywords":"...","category":N}
- title: max 200 chars, English, descriptive
- keywords: English, comma-separated, max 49, most important first
- category: 1=Animals,2=Buildings,3=Business,4=Drinks,5=Environment,6=Emotions,7=Food,8=Graphic Resources,9=Hobbies,10=Industry,11=Landscapes,12=Lifestyle,13=People,14=Plants,15=Religion,16=Science,17=Social Issues,18=Sports,19=Technology,20=Transportation,21=Travel${extra}
Return ONLY the JSON.` }
      ]}]
    })
  })
  if (!res.ok) { const t = await res.text(); throw new Error(JSON.parse(t)?.error?.message || `API error ${res.status}`) }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const parsed = JSON.parse(data.content[0].text.replace(/```json|```/g, '').trim())
  return { title: parsed.title || '', keywords: parsed.keywords || '', category: String(parsed.category || 1) }
}
const doExportCSV = (rows, filename) => {
  const esc = s => '"' + String(s).replace(/"/g, '""') + '"'
  const lines = ['Filename,Title,Keywords,Category,Releases', ...rows.map(r => [r.filename, esc(r.title), esc(r.keywords), r.category, ''].join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename || 'adobe_stock_metadata.csv'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

export default function App() {
  const [page, setPage] = useState('today')
  const [selectedId, setSelectedId] = useState(null)
  const [sessions, setSessions] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_SESSIONS)) || [] } catch { return [] } })
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_APIKEY) || '')
  const [showApiModal, setShowApiModal] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')

  useEffect(() => {
    try {
      const slim = sessions.map(s => ({ ...s, rows: s.rows.map(({ base64, ...r }) => r) }))
      localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(slim))
    } catch (e) {
      // 容量オーバーの場合は古いセッションを削除して再試行
      try {
        const slim = sessions.slice(0, 5).map(s => ({ ...s, rows: s.rows.map(({ base64, ...r }) => r) }))
        localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(slim))
      } catch (e2) { console.warn('localStorage full') }
    }
  }, [sessions])

  const saveSession = (session) => setSessions(prev => {
    const exists = prev.find(s => s.id === session.id)
    return exists ? prev.map(s => s.id === session.id ? session : s) : [session, ...prev]
  })
  const deleteSession = (id) => setSessions(prev => prev.filter(s => s.id !== id))
  const openDetail = (id) => { setSelectedId(id); setPage('detail') }

  return (
    <div style={{ minHeight: '100vh', background: LIGHT_BG, display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
      {/* Top nav - dark */}
      <nav style={{ background: DARK, padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 220, flexShrink: 0 }}><img src='/img/logo.png' style={{ height: 20, width: 'auto' }} alt='logo' /><span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', color: WHITE }}>Stock Photo Generator</span></div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 32 }}>
          {[['today','今日の作業'],['history','履歴'],['detail','詳細']].map(([p, label]) => (
            <span key={p} onClick={() => p !== 'detail' && setPage(p)}
              style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', cursor: p !== 'detail' ? 'pointer' : 'default', color: page === p ? WHITE : '#888', borderBottom: page === p ? `2px solid ${RED}` : '2px solid transparent', paddingBottom: 4 }}>
              {label}
            </span>
          ))}
        </div>
        <div style={{ width: 180 }} />
      </nav>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar - light */}
        <aside style={{ width: 200, background: WHITE, borderRight: `0.5px solid ${BORDER}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ marginBottom: 6 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.08em', color: MUTED }}>WORKSPACE</p>
            <p style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>URU Illustration</p>
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavItem label="ワークスペース" active={page === 'today'} onClick={() => setPage('today')} />
            <NavItem label="アーカイブ" active={page === 'history'} onClick={() => setPage('history')} />
          </div>
          <div style={{ marginTop: 24, borderTop: `0.5px solid ${BORDER}`, paddingTop: 16 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.06em', color: MUTED, marginBottom: 10 }}>最近のセッション</p>
            {sessions.slice(0, 4).map(s => (
              <div key={s.id} onClick={() => openDetail(s.id)} style={{ marginBottom: 10, cursor: 'pointer' }}>
                <p style={{ fontSize: 12, fontWeight: 600 }}>{s.date === today() ? `今日・${s.date.slice(5)}` : s.date.slice(5)}</p>
                <p style={{ fontSize: 11, color: MUTED }}>{s.rows.length}枚</p>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span onClick={() => { setApiKeyInput(apiKey); setShowApiModal(true) }} style={{ fontSize: 12, color: MUTED, cursor: 'pointer', padding: '4px 0' }}>⚙ 設定</span>
            <span style={{ fontSize: 12, color: MUTED, padding: '4px 0' }}>？ サポート</span>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
          {page === 'today' && <TodayPage sessions={sessions} apiKey={apiKey} saveSession={saveSession} onNeedApiKey={() => { setApiKeyInput(''); setShowApiModal(true) }} onViewHistory={() => setPage('history')} />}
          {page === 'history' && <HistoryPage sessions={sessions} onOpen={openDetail} onNewSession={() => setPage('today')} onDelete={deleteSession} onUpdateMemo={(id, memo) => setSessions(prev => prev.map(s => s.id === id ? { ...s, memo } : s))} />}
          {page === 'detail' && <DetailPage session={sessions.find(s => s.id === selectedId)} saveSession={saveSession} apiKey={apiKey} onBack={() => setPage('history')} onNeedApiKey={() => { setApiKeyInput(''); setShowApiModal(true) }} />}
        </main>
      </div>

      {showApiModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: WHITE, borderRadius: 12, padding: 28, width: 400, border: `0.5px solid ${BORDER}` }}>
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>APIキー設定</p>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>Google AI StudioまたはAnthropicのAPIキーを入力してください。このPCのブラウザにのみ保存されます。</p>
            <input value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="APIキーを入力..."
              style={{ width: '100%', border: `0.5px solid ${BORDER}`, borderRadius: 6, padding: '9px 12px', fontSize: 13, fontFamily: SANS, outline: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowApiModal(false)} style={{ padding: '7px 16px', borderRadius: 6, border: `0.5px solid ${BORDER}`, background: WHITE, fontSize: 12, cursor: 'pointer', fontFamily: SANS }}>キャンセル</button>
              <button onClick={() => { localStorage.setItem(STORAGE_APIKEY, apiKeyInput); setApiKey(apiKeyInput); setShowApiModal(false) }}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: RED, color: WHITE, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavItem({ label, active, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: active ? LIGHT_BG : 'transparent', borderLeft: active ? `2px solid ${RED}` : '2px solid transparent' }}>
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? TEXT : MUTED }}>{label}</span>
    </div>
  )
}

function TodayPage({ sessions, apiKey, saveSession, onNeedApiKey, onViewHistory }) {
  const [session, setSession] = useState({ id: uid(), date: today(), rows: [], csvExported: false })
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const updateSession = (s) => { setSession(s); saveSession(s) }
  const newBatch = () => { setSession({ id: uid(), date: today(), rows: [], csvExported: false }); setError(''); setPrompt('') }

  const addFiles = useCallback((fileList) => {
    for (const f of fileList) {
      if (!f.type.startsWith('image/')) continue
      const id = uid()
      setSession(prev => { const next = { ...prev, rows: [...prev.rows, { id, filename: f.name, title: '', keywords: '', category: '1', status: 'pending', preview: '', base64: '' }] }; saveSession(next); return next })
      compressImage(f).then(({ preview, base64 }) => {
        setSession(prev => { const next = { ...prev, rows: prev.rows.map(r => r.id === id ? { ...r, preview, base64 } : r) }; saveSession(next); return next })
      })
    }
  }, [])

  const generateAll = async () => {
    if (!apiKey) { onNeedApiKey(); return }
    setGenerating(true); setError('')
    const userPrompt = prompt.trim()
    setSession(prev => { const next = { ...prev, rows: prev.rows.map(r => ({ ...r, status: 'loading' })) }; saveSession(next); return next })
    const currentRows = session.rows
    await Promise.allSettled(currentRows.map(async (row) => {
      try {
        const b64 = row.base64 || (row.preview ? row.preview.split(',')[1] : '')
        const result = await callAPI(b64, apiKey, userPrompt)
        setSession(prev => { const next = { ...prev, rows: prev.rows.map(r => r.id === row.id ? { ...r, ...result, status: 'done' } : r) }; saveSession(next); return next })
      } catch (e) {
        setError(e.message)
        setSession(prev => { const next = { ...prev, rows: prev.rows.map(r => r.id === row.id ? { ...r, status: 'error' } : r) }; saveSession(next); return next })
      }
    }))
    setGenerating(false)
  }

  const handleExport = () => {
    doExportCSV(session.rows, `adobe_stock_${session.date.replace(/\//g, '-')}.csv`)
    updateSession({ ...session, csvExported: true })
  }

  const hasDone = session.rows.some(r => r.status === 'done')

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: ZK, fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Today's Work</h1>
      </div>

      {/* Step 1: Upload area + thumbnails side by side */}
      <div style={{ background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, padding: '16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><img src='/img/step_img.png' style={{ height: 14, width: 'auto' }} alt='' /><span style={{ color: '#a01010', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>STEP</span><span style={{ color: '#a01010', fontSize: 13, fontWeight: 700 }}>1</span></div>
          <span style={{ fontSize: 11, color: MUTED }}>イラストをドロップ、または選択</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div onClick={() => fileRef.current.click()} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            style={{ border: `1.5px dashed ${dragging ? RED : '#c8c4bc'}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#f5ede8' : '#f5f4f2', flexShrink: 0, width: 180 }}>
            <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
            <div style={{ fontSize: 20, marginBottom: 6, color: RED }}>↑</div>
            <p style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>ドロップ or クリック</p>
            <p style={{ fontSize: 10, color: MUTED }}>JPG・PNG・WEBP</p>
          </div>
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', minHeight: 88 }}>
            {session.rows.length === 0 && <p style={{ fontSize: 12, color: MUTED, alignSelf: 'center', width: '100%', textAlign: 'center' }}>イラストをアップロードすると<br/>ここに表示されます</p>}
            {session.rows.map(r => (
              <div key={r.id} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: `0.5px solid ${BORDER}`, background: '#ddd' }}>
                {r.preview ? <img src={r.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: MUTED }}>読込中</div>}
                <div onClick={e => { e.stopPropagation(); updateSession({ ...session, rows: session.rows.filter(row => row.id !== r.id) }) }}
                  style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: r.status === 'done' ? '#2d7a4f' : r.status === 'loading' ? '#f0a500' : r.status === 'error' ? RED : 'transparent' }} />
              </div>
            ))}
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT }}>{session.rows.length}枚</p>
            <p style={{ fontSize: 10, color: MUTED }}>選択中</p>
          </div>
        </div>
      </div>

      {/* Step 2: AI instructions */}
      <div style={{ background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, padding: '16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><img src='/img/step_img.png' style={{ height: 14, width: 'auto' }} alt='' /><span style={{ color: '#a01010', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>STEP</span><span style={{ color: '#a01010', fontSize: 13, fontWeight: 700 }}>2</span></div>
          <span style={{ fontSize: 11, color: MUTED }}>AIへの指示を入力（任意）</span>
        </div>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
          placeholder="例：水彩イラストです。色彩・雰囲気・スタイルのキーワードを優先してください。"
          style={{ width: '100%', border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: SANS, background: '#fafaf8', resize: 'none', outline: 'none', lineHeight: 1.6 }} />
      </div>

      {/* Step 3: Actions */}
      <div style={{ background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, padding: '16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><img src='/img/step_img.png' style={{ height: 14, width: 'auto' }} alt='' /><span style={{ color: '#a01010', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>STEP</span><span style={{ color: '#a01010', fontSize: 13, fontWeight: 700 }}>3</span></div>
          <span style={{ fontSize: 11, color: MUTED }}>生成してCSVを書き出す</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={generateAll} disabled={generating || !session.rows.length}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: session.rows.length ? RED : '#ccc', color: WHITE, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', cursor: session.rows.length ? 'pointer' : 'not-allowed', fontFamily: SANS }}>
            {generating ? '生成中...' : 'AIで生成する'}
          </button>
          <button onClick={handleExport} disabled={!hasDone}
            style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${hasDone ? TEXT : BORDER}`, background: 'transparent', fontSize: 13, fontWeight: 700, cursor: hasDone ? 'pointer' : 'not-allowed', color: hasDone ? TEXT : MUTED, fontFamily: SANS }}>
            CSVを書き出す
          </button>
          {hasDone && <span style={{ fontSize: 11, color: '#2d7a4f', marginLeft: 8 }}>✓ {session.rows.filter(r => r.status === 'done').length}枚 生成完了</span>}
        </div>
      </div>

      {error && <div style={{ background: '#fde8e8', border: `0.5px solid #f0b0b0`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: RED }}><strong>エラー：</strong> {error}</div>}

      {sessions.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontFamily: ZK, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Recent Sessions</h2>
            <span onClick={onViewHistory} style={{ fontSize: 11, letterSpacing: '0.06em', fontWeight: 600, color: RED, cursor: 'pointer' }}>すべて表示</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 24 }}>
            {(sessions[0]?.rows || []).slice(0, 4).map(r => (
              <div key={r.id} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#ccc' }}>
                {r.preview && <img src={r.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
              </div>
            ))}
          </div>
        </>
      )}

      {session.rows.length > 0 && hasDone && <MetaTable rows={session.rows} onUpdate={(id, field, value) => updateSession({ ...session, rows: session.rows.map(r => r.id === id ? { ...r, [field]: value } : r) })} />}
    </>
  )
}

function HistoryPage({ sessions, onOpen, onNewSession, onDelete, onUpdateMemo }) {
  const [editingId, setEditingId] = useState(null)
  const [memoValue, setMemoValue] = useState('')

  const startEdit = (e, s) => {
    e.stopPropagation()
    setEditingId(s.id)
    setMemoValue(s.memo || '')
  }

  const saveMemo = (id) => {
    onUpdateMemo(id, memoValue)
    setEditingId(null)
  }

  return (
    <>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
        <span>アーカイブ</span> <span style={{ color: RED, fontWeight: 600 }}>› 履歴</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontFamily: ZK, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>Archives</h1>
        <button onClick={onNewSession} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 8, border: 'none', background: RED, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
          ＋ 新しいセッション
        </button>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, marginBottom: 16 }}>{sessions.length}件のセッション</div>
      {sessions.length === 0 && <p style={{ color: MUTED, textAlign: 'center', padding: '60px 0', fontSize: 14 }}>まだ履歴がありません</p>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sessions.map(s => (
          <div key={s.id}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', marginBottom: 8, borderRadius: 10, background: WHITE, border: `0.5px solid ${BORDER}`, transition: 'border-color 0.1s', cursor: 'pointer' }}
            onClick={() => onOpen(s.id)}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#bbb'}
            onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>

            {/* サムネイルグリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#eee' }}>
              {s.rows.slice(0, 4).map(r => (
                <div key={r.id} style={{ background: '#ccc', overflow: 'hidden' }}>
                  {r.preview && <img src={r.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
                </div>
              ))}
            </div>

            {/* メイン情報 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{s.date}</p>
                <span style={{ fontSize: 11, color: MUTED }}>—</span>
                <span style={{ fontSize: 11, color: MUTED }}>{s.rows.length}枚</span>
              </div>
              {editingId === s.id ? (
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={memoValue} onChange={e => setMemoValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveMemo(s.id) }}
                    autoFocus placeholder="例：すいかシリーズ、秋の花など"
                    style={{ flex: 1, border: `0.5px solid ${RED}`, borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: SANS, outline: 'none' }} />
                  <button onClick={() => saveMemo(s.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: RED, color: WHITE, fontSize: 11, cursor: 'pointer', fontFamily: SANS, flexShrink: 0 }}>保存</button>
                  <button onClick={e => { e.stopPropagation(); setEditingId(null) }} style={{ padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${BORDER}`, background: 'transparent', fontSize: 11, cursor: 'pointer', fontFamily: SANS, flexShrink: 0 }}>キャンセル</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 12, color: s.memo ? TEXT : MUTED }}>{s.memo || 'メモなし'}</p>
                  <span onClick={e => startEdit(e, s)} style={{ fontSize: 10, color: MUTED, cursor: 'pointer', padding: '1px 6px', borderRadius: 4, border: `0.5px solid ${BORDER}` }}>編集</span>
                </div>
              )}
            </div>

            {/* ステータス */}
            <span style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.csvExported ? '#e8f5ee' : '#fde8e8', color: s.csvExported ? '#2d7a4f' : RED, border: `0.5px solid ${s.csvExported ? '#a5d6a7' : '#f0b0b0'}`, flexShrink: 0 }}>
              {s.csvExported ? '● CSV出力済み' : '● 未出力'}
            </span>

            {/* 削除 */}
            <button onClick={e => { e.stopPropagation(); if (window.confirm('このセッションを削除しますか？')) onDelete(s.id) }}
              style={{ padding: '4px 10px', borderRadius: 6, border: `0.5px solid #f0b0b0`, background: 'transparent', fontSize: 11, color: RED, cursor: 'pointer', fontFamily: SANS, flexShrink: 0 }}>削除</button>
          </div>
        ))}
      </div>
    </>
  )
}

function DetailPage({ session, saveSession, apiKey, onBack, onNeedApiKey }) {
  const [rows, setRows] = useState(session?.rows || [])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState('')

  useEffect(() => { if (session) setRows(session.rows) }, [session])
  if (!session) return <p style={{ color: MUTED }}>セッションが見つかりません</p>

  const updateRow = (id, field, value) => {
    const newRows = rows.map(r => r.id === id ? { ...r, [field]: value } : r)
    setRows(newRows); saveSession({ ...session, rows: newRows })
  }

  const regenerateAll = async () => {
    if (!apiKey) { onNeedApiKey(); return }
    setGenerating(true); setError('')
    const userPrompt = prompt.trim()
    setRows(prev => prev.map(r => ({ ...r, status: 'loading' })))
    await Promise.allSettled(rows.map(async (row) => {
      try {
        const b64 = row.base64 || (row.preview ? row.preview.split(',')[1] : '')
        const result = await callAPI(b64, apiKey, userPrompt)
        setRows(prev => { const n = prev.map(r => r.id === row.id ? { ...r, ...result, status: 'done' } : r); saveSession({ ...session, rows: n }); return n })
      } catch (e) {
        setError(e.message)
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'error' } : r))
      }
    }))
    setGenerating(false)
  }

  const handleExport = () => {
    doExportCSV(rows, `adobe_stock_${session.date.replace(/\//g, '-')}.csv`)
    saveSession({ ...session, rows, csvExported: true })
  }

  const extra = rows.length - 4

  return (
    <>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
        <span style={{ cursor: 'pointer' }} onClick={onBack}>アーカイブ</span>
        <span style={{ color: RED, fontWeight: 600 }}> › セッション詳細</span>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* Left: images */}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: ZK, fontSize: 40, fontWeight: 700, lineHeight: 1, marginBottom: 6 }}>{session.date}</h1>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 20, lineHeight: 1.6, maxWidth: 400 }}>
            このセッションでは、{rows.length}枚のイラストが処理されました。AIによって生成されたメタデータは、商用利用および検索エンジンの最適化に合わせて調整されています。
          </p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button onClick={regenerateAll} disabled={generating}
              style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 6 }}>
              {generating ? '生成中...' : '↺ 再生成'}
            </button>
            <button onClick={handleExport}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: RED, color: WHITE, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 6 }}>
              ↓ CSVを書き出す
            </button>
          </div>

          <p style={{ fontSize: 10, letterSpacing: '0.08em', color: MUTED, fontWeight: 600, marginBottom: 12 }}>SELECTED ASSETS</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.65fr 0.65fr', gap: 6, marginBottom: 20 }}>
            {rows[0]?.preview && <div style={{ gridRow: '1 / 3', borderRadius: 10, overflow: 'hidden', background: '#ccc', aspectRatio: '0.8' }}><img src={rows[0].preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>}
            {rows.slice(1, 3).map(r => r.preview && <div key={r.id} style={{ borderRadius: 10, overflow: 'hidden', background: '#ccc', aspectRatio: '1' }}><img src={r.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>)}
            {rows[3]?.preview && <div style={{ borderRadius: 10, overflow: 'hidden', background: '#ccc', aspectRatio: '1' }}><img src={rows[3].preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>}
            {extra > 0 && <div style={{ borderRadius: 10, background: DARK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1' }}>
              <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 300, color: WHITE }}>+{extra}</span>
              <span style={{ fontSize: 9, letterSpacing: '0.08em', color: '#aaa', marginTop: 4 }}>MORE ASSETS</span>
            </div>}
          </div>

          <p style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 }}>AIへの指示（再生成時）</p>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
            placeholder="例：タイトルは日本語で / キーワードは20個以内"
            style={{ width: '100%', maxWidth: 400, border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: SANS, background: WHITE, resize: 'vertical', outline: 'none', lineHeight: 1.6, marginBottom: 16 }} />
        </div>

        {/* Right: metadata table */}
        <div style={{ width: 440, flexShrink: 0 }}>
          <div style={{ background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `0.5px solid ${BORDER}` }}>
              <p style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, color: MUTED }}>METADATA REGISTRY</p>
              <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>● AI Optimized</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#faf9f7' }}>
                  <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, color: MUTED, fontWeight: 600, width: '34%' }}>タイトル</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: MUTED, fontWeight: 600, width: '30%' }}>キーワード</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: MUTED, fontWeight: 600, width: '22%' }}>カテゴリ</th>
                  <th style={{ padding: '8px 10px', width: '14%' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: `0.5px solid ${BORDER}` }}>
                    <td style={{ padding: '10px 14px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.preview && <img src={r.preview} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} alt="" />}
                        <textarea value={r.title} rows={2} maxLength={200} onChange={e => updateRow(r.id, 'title', e.target.value)}
                          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 11, fontFamily: SANS, resize: 'none', outline: 'none', lineHeight: 1.5 }} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 10px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
                        {(r.keywords || '').split(',').slice(0, 2).map(k => k.trim()).filter(Boolean).map((k, i) => (
                          <span key={i} style={{ padding: '1px 6px', background: LIGHT_BG, borderRadius: 3, fontSize: 10, fontWeight: 500 }}>{k}</span>
                        ))}
                      </div>
                      <textarea value={r.keywords} rows={2} onChange={e => updateRow(r.id, 'keywords', e.target.value)}
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 10, fontFamily: SANS, resize: 'none', outline: 'none', color: MUTED, lineHeight: 1.5 }} />
                    </td>
                    <td style={{ padding: '10px 10px', verticalAlign: 'top' }}>
                      <select value={r.category} onChange={e => updateRow(r.id, 'category', e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: 11, fontFamily: SANS, fontWeight: 600, outline: 'none', color: RED, cursor: 'pointer', width: '100%' }}>
                        {CATEGORIES.map((c, i) => i === 0 ? null : <option key={i} value={String(i)}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', verticalAlign: 'top' }}>
                      <span style={{ fontSize: 14, color: MUTED, cursor: 'pointer' }}>✎</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div style={{ background: '#fde8e8', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 12, color: RED }}><strong>エラー：</strong> {error}</div>}

          {/* Session summary */}
          <div style={{ background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, padding: '16px 18px', marginTop: 12 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, color: MUTED, marginBottom: 14 }}>SESSION SUMMARY</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                ['Total Assets', String(rows.length)],
                ['Keywords', String(rows.reduce((a, r) => a + (r.keywords ? r.keywords.split(',').length : 0), 0))],
                ['Score', 'A+']
              ].map(([label, val]) => (
                <div key={label} style={{ background: LIGHT_BG, borderRadius: 8, padding: '12px 14px' }}>
                  <p style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: label === 'Score' ? RED : TEXT }}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function MetaTable({ rows, onUpdate }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id || null)
  const selected = rows.find(r => r.id === selectedId) || rows[0]

  const kwList = selected ? (selected.keywords || '').split(',').map(k => k.trim()).filter(Boolean) : []

  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 24, background: WHITE, borderRadius: 12, border: `0.5px solid ${BORDER}`, overflow: 'hidden' }}>

      {/* Left: thumbnail list */}
      <div style={{ width: 160, borderRight: `0.5px solid ${BORDER}`, flexShrink: 0, overflowY: 'auto', maxHeight: 520 }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: `0.5px solid ${BORDER}` }}>
          <p style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 600, color: MUTED }}>METADATA INVENTORY</p>
          <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{rows.length}枚</p>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} onClick={() => setSelectedId(r.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: `0.5px solid ${BORDER}`, background: selectedId === r.id ? '#fdf2f0' : 'transparent', borderLeft: selectedId === r.id ? `2px solid ${RED}` : '2px solid transparent' }}>
            <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', background: '#ddd', flexShrink: 0 }}>
              {r.preview && <img src={r.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: r.status === 'done' ? '#2d7a4f' : r.status === 'loading' ? '#f0a500' : r.status === 'error' ? RED : '#ddd' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: selectedId === r.id ? 600 : 400, color: TEXT, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.title || `イラスト ${i + 1}`}
              </p>
              <p style={{ fontSize: 10, color: MUTED }}>{r.keywords ? r.keywords.split(',').length : 0}個のキーワード</p>
            </div>
          </div>
        ))}
      </div>

      {/* Right: detail panel */}
      {selected ? (
        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', maxHeight: 520 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 100, height: 100, borderRadius: 10, overflow: 'hidden', background: '#ddd', flexShrink: 0 }}>
              {selected.preview && <img src={selected.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>タイトル</p>
              <textarea value={selected.title} rows={3} maxLength={200}
                onChange={e => onUpdate(selected.id, 'title', e.target.value)}
                style={{ width: '100%', border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: SANS, resize: 'none', outline: 'none', lineHeight: 1.6, background: '#fafaf8' }} />
              <p style={{ fontSize: 10, color: MUTED, textAlign: 'right', marginTop: 2 }}>{selected.title?.length || 0}/200文字</p>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 600, color: MUTED }}>カテゴリ</p>
            </div>
            <select value={selected.category} onChange={e => onUpdate(selected.id, 'category', e.target.value)}
              style={{ width: '100%', border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: SANS, fontWeight: 600, outline: 'none', color: RED, background: '#fafaf8', cursor: 'pointer' }}>
              {CATEGORIES.map((c, i) => i === 0 ? null : <option key={i} value={String(i)}>{i}. {c}</option>)}
            </select>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 600, color: MUTED }}>キーワード</p>
              <span style={{ fontSize: 11, color: kwList.length > 40 ? RED : MUTED }}>{kwList.length} / 49個</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {kwList.map((k, i) => (
                <span key={i} style={{ padding: '3px 10px', background: i < 10 ? '#fdf2f0' : LIGHT_BG, color: i < 10 ? RED : TEXT, borderRadius: 4, fontSize: 11, fontWeight: i < 10 ? 600 : 400, border: `0.5px solid ${i < 10 ? '#f0b0b0' : BORDER}` }}>{k}</span>
              ))}
            </div>
            <textarea value={selected.keywords} rows={4}
              onChange={e => onUpdate(selected.id, 'keywords', e.target.value)}
              placeholder="キーワードをカンマ区切りで入力..."
              style={{ width: '100%', border: `0.5px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: SANS, resize: 'none', outline: 'none', lineHeight: 1.6, background: '#fafaf8', color: MUTED }} />
            <p style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>重要なキーワードを先頭に。上位10個（赤）が検索に最も影響します。</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13 }}>
          左のリストからイラストを選んでください
        </div>
      )}
    </div>
  )
}
